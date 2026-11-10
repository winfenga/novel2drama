/**
 * M9-0 · 全局 GPU 锁 —— ComfyUI / TTS / Video2X 三方互斥（spec §3.1 / G2）。
 *
 * 依据：api-contract.md §4.6（L541-552 先抢锁再转发 :17863）、§8 L1060-1065（GPU 互斥）、
 * m489-spec.md §3.2（签名冻结）。
 *
 * 轨道间协议（spec §3.1 G2）：M9 建锁导出工厂，M8 的 comfy/queue.ts 本轮不 import 它
 * （文件零交集纪律）；真实接线归主会话收尾任务。
 *
 * 红线：被占时 acquire 抛 gpu_lock_held(409) 带 holder，**不许排队等待静默降级**——
 * 本轮实现是「冲突即 409」，不做 promise 链排队；排队策略归 M8 queue（同进程单例对接）。
 */
import { DramaError } from "@text2drama/shared";

export type GpuHolder = "comfyui" | "tts" | "video2x";

const HOLDERS: readonly GpuHolder[] = ["comfyui", "tts", "video2x"] as const;

function assertHolder(holder: string): void {
  if (!(HOLDERS as readonly string[]).includes(holder)) {
    throw new DramaError("invalid_param", {
      message: `未知 holder：${holder}（合法值：${HOLDERS.join("/")}）`,
    });
  }
}

/** TTS 客户端需要的最小锁形状（依赖倒置，测试可注入 mock lock）。 */
export interface GpuLock {
  acquire(holder: GpuHolder): Promise<void>;
  release(holder: string): void;
  status(): { holder: string | null };
}

/**
 * 创建全局 GPU 锁（同进程单例——调用方负责只建一次；本模块不缓存实例，
 * 因为 M8 queue 与本轨共用的是**接线层**的同一实例，不是模块级单例）。
 */
export function createGpuLock(): GpuLock {
  let holder: GpuHolder | null = null;

  return {
    async acquire(requested: GpuHolder): Promise<void> {
      assertHolder(requested);
      if (holder !== null && holder !== requested) {
        throw new DramaError("gpu_lock_held", {
          details: { holder, requested },
          hint: `GPU 正被 ${holder} 占用；等待其 release 后重试，或先取消该任务`,
        });
      }
      // 同 holder 重入：TTS 持锁段内（load→batch→unload）重复 load 幂等，不自我冲突
      holder = requested;
    },

    release(called: string): void {
      assertHolder(called);
      // 幂等：非当前 holder 调 release 一律忽略（含锁空闲时），不抛
      if (holder === called) holder = null;
    },

    status(): { holder: string | null } {
      return { holder };
    },
  };
}
