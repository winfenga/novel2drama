/**
 * M9-1 · IndexTTS 客户端 —— load/unload 的唯一官方入口（spec §3.2 / api §4.6）。
 *
 * 冻结语义：
 * - load/unload **先 acquire("tts")，再转发** :17863/api/load | /api/unload；
 *   **不许直连绕过锁**（api §2.5.1 警告：直连会把 ComfyUI 挤爆 OOM）。
 * - 已加载时 load 幂等返回成功（不重复加载）。
 * - 卸载成功后 release（唤醒排队中的 ComfyUI 任务）。
 * - 服务不可达 → voice_offline(503)；服务在跑但未装模型（合成场景）→ voice_not_loaded(409)。
 *   （not_loaded 在 batch 场景由上游检测 / load 场景幂等成功；本文件在 load 响应显式失败时上抛。）
 *
 * HTTP 全 mock（spec §4 纪律 4：零真实网络）；fetch 可注入。
 */
import { DramaError } from "@text2drama/shared";

import type { GpuLock } from "../../gpu/lock.js";

/** load 端点响应（api §2.5.6：显存余量低于 7000MB 带 warning，不拒绝） */
interface LoadResponse {
  ok?: boolean;
  warnings?: string[];
  error?: string;
}

export interface TtsClient {
  /** 装模型进显存（~14s）；已加载幂等；返回服务端 warnings */
  load(): Promise<{ warnings: string[] }>;
  /** 卸模型（~0.3s，服务不退出）；成功后 release GPU 锁 */
  unload(): Promise<void>;
}

/** fetch 形状（测试注入 mock 用；node 18+ 全局 fetch 兼容） */
export type FetchLike = (url: string, init?: { method?: string; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function createTtsClient(opts: {
  baseUrl: string;
  lock: GpuLock;
  fetch?: FetchLike;
}): TtsClient {
  const doFetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

  async function callLifecycle(path: "/api/load" | "/api/unload"): Promise<unknown> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, { method: "POST" });
    } catch (e) {
      // 网络层失败（服务没起/ECONNREFUSED）→ voice_offline，cause 带原始错误供排查
      throw new DramaError("voice_offline", { cause: e });
    }
    if (!res.ok) {
      // 生命周期端点失败：409 = 未加载态下 unload 之类的状态冲突；其余按上游 code 原样折算
      throw new DramaError("voice_offline", {
        message: `IndexTTS 生命周期调用失败：${path} → HTTP ${res.status}`,
        details: { path, status: res.status },
      });
    }
    return (await res.json()) as unknown;
  }

  return {
    async load() {
      await opts.lock.acquire("tts");
      let data: unknown;
      try {
        data = await callLifecycle("/api/load");
      } catch (e) {
        // 加载失败必须释放锁（不静默持锁——持着坏锁会堵死 ComfyUI）
        opts.lock.release("tts");
        throw e;
      }
      const body = data as LoadResponse;
      if (body.ok === false) {
        opts.lock.release("tts");
        throw new DramaError("voice_offline", {
          message: body.error ?? "IndexTTS /api/load 返回 ok:false",
          details: body,
        });
      }
      // 交接顺序（api §2.5.1）：load 成功后 TTS 仍持有锁直到 unload —— 锁在合成结束由 batch 层释放；
      // 但契约语义是「load→批量 TTS→unload 为一整个持有段」，client 层不代释放，
      // 由调用方（batch / voice 路由）完成后显式 unload()（内部 release）。
      return { warnings: body.warnings ?? [] };
    },

    async unload() {
      await opts.lock.acquire("tts");
      try {
        await callLifecycle("/api/unload");
      } finally {
        // 卸载成功（或确认失败）后都 release：unload 幂等场景（模型本就未装）服务也返回成功语义；
        // 失败时释放锁让错误上抛后系统回到可用态（不静默持锁）。
        opts.lock.release("tts");
      }
    },
  };
}
