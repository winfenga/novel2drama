/**
 * M8-3 · 队列与显存守门。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（architecture L1872-1879）。
 *
 * 策略：
 * - 串行优先：concurrencyCap 默认 1（本地 GPU 同时跑多工作流极易 OOM）
 * - 队列上限：超过 maxQueueLength 直接拒绝 → queue_full (503)，不默默堆积
 * - 显存守门：出队执行前查剩余显存 < vramGuardMB → 挂起（suspended=true），
 *   等待空闲；等待中任务被取消 → 抛 vram_insufficient 不再执行
 * - OOM 自愈：run 抛 comfy_out_of_memory → 调 freeFn（ComfyUI /free）→ 降档重试**一次**；
 *   第二次仍 OOM → 原错上抛，不静默降级（总红线）
 *
 * G2（spec §5）：GPU 锁由 M9 建 gpu/lock.ts，本模块不 import 它。holder 接口以
 * `setGpuLockHolder` 预留，**M9 gpu/lock 就绪后对接**——真实接线归主会话收尾任务。
 */

import { DramaError } from "@text2drama/shared";

export interface QueueOptions {
  concurrencyCap: number;
  vramGuardMB: number;
  maxQueueLength: number;
}

export interface QueueTask {
  id: string;
  run: () => Promise<void>;
  estimateVramMB: number;
}

export interface QueueStatus {
  queued: number;
  running: string | null;
  suspended: boolean;
}

/** 剩余显存查询（MB）；测试注入 mock，生产由调用方接 nvidia-smi / nvml */
export type VramFreeFn = () => Promise<number>;

/** OOM 自愈的「释放显存」动作（生产 = ComfyUI /free） */
export type FreeFn = () => Promise<void>;

/** OOM 时的降档动作：改工作流参数（分辨率档位等）让重试更省显存 */
export type DowngradeFn = (task: QueueTask) => QueueTask | void;

export interface QueueDeps {
  vramFree: VramFreeFn;
  free: FreeFn;
  downgrade?: DowngradeFn;
  /** 轮询显存间隔（挂起等待时）；测试可调小 */
  pollIntervalMs?: number;
  /** 显存查询可替换（测试/运行时注入口，如接 nvidia-smi 实测值） */
  setVramFree?: (fn: VramFreeFn) => void;
}

/** GPU 锁 holder 预留接口（G2）：M9 gpu/lock 就绪后对接，本轮不做真实接线 */
export interface GpuLockHolder {
  /** M9: acquire(holder: "comfyui" | "tts" | "video2x") */
  acquire: (holder: "comfyui") => Promise<void>;
  /** M9: release(holder) —— 非 holder 调 release 幂等忽略 */
  release: (holder: "comfyui") => void;
}

let gpuLockHolder: GpuLockHolder | null = null;
/** M9 gpu/lock 就绪后由主会话接线调用；本轮（G2）仅存引用不调用 */
export function setGpuLockHolder(h: GpuLockHolder | null): void {
  gpuLockHolder = h;
}

export function createQueue(
  opts: QueueOptions,
  deps: QueueDeps,
): {
  enqueue(task: QueueTask): Promise<"queued" | "rejected">;
  status(): QueueStatus;
  cancelQueued(taskId: string): boolean;
  lastError(): { taskId: string; error: unknown } | null;
} {
  const queue: QueueTask[] = [];
  const waiting = new Set<QueueTask>();
  let runningId: string | null = null;
  let suspended = false;
  let lastErrorRecord: { taskId: string; error: unknown } | null = null;
  const pollIntervalMs = deps.pollIntervalMs ?? 500;

  async function pump(): Promise<void> {
    if (runningId !== null) return; // 串行：cap=1
    const next = queue.shift();
    if (next === undefined) {
      suspended = false;
      return;
    }
    // 注意：出队时不从 waiting 删除——waiting 表示「已入队但尚未开始执行」，
    // 取消（cancelQueued）或守门通过开始执行时才移除，供守门循环判取消。

    // 显存守门：出队执行前查，低于 guardMB → 挂起，等空闲再继续
    while (true) {
      const freeMB = await deps.vramFree();
      if (freeMB >= opts.vramGuardMB) {
        suspended = false;
        waiting.delete(next); // 开始执行，退出「等待取消」跟踪
        break;
      }
      suspended = true;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      // 等待期间可能被取消：任务对象已不在内存跟踪集 → 不执行，报 vram_insufficient
      if (!waiting.has(next)) {
        suspended = false;
        const cancelErr = new DramaError("vram_insufficient", {
          message: `任务 ${next.id} 在显存守门等待期间被取消`,
        });
        lastErrorRecord = { taskId: next.id, error: cancelErr };
        throw cancelErr;
      }
    }

    runningId = next.id;
    try {
      await runWithOomSelfHeal(next);
    } catch (err) {
      lastErrorRecord = { taskId: next.id, error: err };
      throw err;
    } finally {
      runningId = null;
    }
    // 继续泵下一条（不递归爆栈：串行下链长有限，且 await 已断栈）
    await pump();
  }

  async function runWithOomSelfHeal(task: QueueTask): Promise<void> {
    // OOM 自愈（architecture L1876）：OOM → /free → 降档重试一次；第二次失败原错上抛
    try {
      await task.run();
      return;
    } catch (err) {
      if (!isComfyOutOfMemory(err)) throw err;
    }
    // 第一次 OOM：/free + 降档重试
    await deps.free();
    const downgraded = deps.downgrade?.(task);
    const retryTask = downgraded ?? task;
    try {
      await retryTask.run();
    } catch (err) {
      if (isComfyOutOfMemory(err)) {
        // 第二次 OOM：原错上抛，不静默降级
        throw err;
      }
      throw err;
    }
  }

  function isComfyOutOfMemory(err: unknown): boolean {
    return err instanceof DramaError && err.code === "comfy_out_of_memory";
  }

  return {
    async enqueue(task: QueueTask): Promise<"queued" | "rejected"> {
      if (queue.length >= opts.maxQueueLength) {
        throw new DramaError("queue_full", {
          message: `队列已满（${queue.length}/${opts.maxQueueLength}），拒绝入队`,
          details: { queued: queue.length, maxQueueLength: opts.maxQueueLength },
        });
      }
      queue.push(task);
      waiting.add(task);
      // 全部后台泵：enqueue 不被任务执行阻塞（显存守门挂起是常态，不能卡提交方）。
      // 错误去向：记 lastErrorRecord（不静默——提交方/轮询方经 lastError() 观察，
      // 任务模型的 error 字段接线归主会话收尾）。
      void pump().catch(() => {
        // 兜住 unhandledRejection；错误已记入 lastErrorRecord。
      });
      return "queued";
    },

    /** 后台任务失败记录（最近一条）；前台任务错误直接上抛不走这里 */
    lastError(): { taskId: string; error: unknown } | null {
      return lastErrorRecord;
    },

    status(): QueueStatus {
      return { queued: queue.length, running: runningId, suspended };
    },

    /** 取消排队中任务（尚未开始跑）；running 的取消走 cancel.ts 的 interrupt 路径 */
    cancelQueued(taskId: string): boolean {
      // 队列里的直接移出
      const idx = queue.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        const [removed] = queue.splice(idx, 1);
        if (removed !== undefined) waiting.delete(removed);
        return true;
      }
      // 已出队但还在显存守门等待的：从等待跟踪集移除，守门循环会感知并报 vram_insufficient
      for (const t of waiting) {
        if (t.id === taskId) {
          waiting.delete(t);
          return true;
        }
      }
      return false;
    },
  };
}
