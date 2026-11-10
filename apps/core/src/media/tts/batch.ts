/**
 * M9-2 · 批量合成 —— :17863/v1/tts/batch → jobId 包装成 Task.type="audio"（spec §3.2 / api L569-571）。
 *
 * 冻结语义：
 * - durationSec 用服务端**实测值**（api §2.5.3：主程序据此算帧数，不许用估算）。
 * - emotion/strength/durationFactor 透传（mcp voiceSynthesize schema）。
 * - 服务不可达 → voice_offline(503)；服务在跑但模型未装 → voice_not_loaded(409)。
 * - 失败项不许静默吞：任一 item ok:false → 上抛 DramaError（红总帐，不降级）。
 *
 * fetch 可注入（全 mock，零真实网络）。
 */
import { DramaError } from "@text2drama/shared";

import type { GpuLock } from "../../gpu/lock.js";
import type { TtsClient, FetchLike } from "./client.js";

export interface BatchItemInput {
  id?: string;
  text: string;
  emotion?: string;
  strength?: number;
  durationFactor?: number;
}

export interface BatchItemResult {
  id?: string;
  durationSec: number;
  sampleRate: number;
}

export interface BatchJobResponse {
  ok?: boolean;
  jobId?: string;
  status?: string;
  results?: {
    id?: string;
    ok?: boolean;
    error?: string;
    durationSec?: number;
    sampleRate?: number;
  }[];
}

/** 单条失败信息（进 details） */
interface ItemFailure {
  id: string | null;
  error: string;
}

/**
 * 提交批量合成并等待完成（wait:true）。
 *
 * 前置：调用方必须已完成 client.load()（锁被 tts 持有中）；本函数运行前后不重复抢锁——
 * 锁的持有段是 load→batch→unload（api §2.5.1 交接顺序）。
 */
export async function synthesizeBatch(
  client: TtsClient,
  lock: GpuLock,
  items: BatchItemInput[],
  voice: string,
  opts?: { fetch?: FetchLike; baseUrl?: string; sampleRate?: number },
): Promise<{ taskId: string; items: BatchItemResult[] }> {
  if (items.length === 0) {
    throw new DramaError("invalid_param", { message: "items 不能为空" });
  }
  if (voice === "") {
    throw new DramaError("voice_no_reference", {
      message: "voice 不能为空（角色未绑定 VoiceProfile 且未显式给 voice）",
    });
  }
  if (lock.status().holder !== "tts") {
    // 不静默绕锁：合成必须发生在 tts 持锁段内
    throw new DramaError("gpu_lock_held", {
      details: { holder: lock.status().holder, requested: "tts" },
      hint: "先 client.load() 拿锁，再批量合成，最后 client.unload()",
    });
  }

  const baseUrl = opts?.baseUrl ?? "http://127.0.0.1:17863";
  const doFetch = opts?.fetch ?? (globalThis.fetch as unknown as FetchLike);

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(`${baseUrl}/v1/tts/batch`, {
      method: "POST",
      body: JSON.stringify({ voice, wait: true, items }),
    });
  } catch (e) {
    throw new DramaError("voice_offline", { cause: e });
  }
  if (res.status === 409) {
    // api §2.5.1：未加载时调合成接口返回 409，不会偷偷加载
    throw new DramaError("voice_not_loaded");
  }
  if (!res.ok) {
    throw new DramaError("voice_offline", {
      message: `IndexTTS /v1/tts/batch → HTTP ${res.status}`,
      details: { status: res.status },
    });
  }

  const job = (await res.json()) as BatchJobResponse;
  if (job.ok === false || job.jobId === undefined) {
    throw new DramaError("voice_offline", {
      message: "IndexTTS /v1/tts/batch 返回缺少 jobId 或 ok:false",
      details: job,
    });
  }

  const results = job.results ?? [];
  const failures: ItemFailure[] = [];
  const out: BatchItemResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const r = results[i];
    if (r === undefined || r.ok === false || r.durationSec === undefined) {
      failures.push({
        id: r?.id ?? item.id ?? `#${i}`,
        error: r?.error ?? "结果缺失或无实测 durationSec",
      });
      continue;
    }
    out.push({
      id: r.id ?? item.id,
      durationSec: r.durationSec, // 实测值，算帧数用它
      sampleRate: r.sampleRate ?? opts?.sampleRate ?? 48000,
    });
  }
  if (failures.length > 0) {
    // 单条失败不影响整批提交，但对调用方是硬失败——不许静默降级
    throw new DramaError("voice_offline", {
      message: `批量合成 ${failures.length}/${items.length} 条失败`,
      details: { jobId: job.jobId, failures },
    });
  }

  return { taskId: job.jobId, items: out };
}
