/**
 * M5-3 · LLM 调用核心 —— llmChat。
 *
 * 冻结依据：`docs/m35-spec.md` §1.2、`docs/architecture.md` L657-701（逐行照抄）。
 *
 * 错分类（一律对调用方 502，除 private_url/invalid_param 这类 400 由 assertBaseUrl 抛）：
 * - 401/403 → `llm_auth`
 * - 404     → `llm_model_not_found`
 * - 其余非 2xx / 网络错 / 超时 abort → `llm_unreachable`
 *
 * 红线：失败一律上抛 DramaError，**不 catch 后返回默认值**（不静默降级）。
 * 唯一的 catch 是读响应体 `text().catch(() => "")` —— 它只是给错误 message
 * 补充上游响应体片段，属于错误信息构造，不是吞错降级（architecture L693 原样）。
 */
import { DramaError } from "@text2drama/shared";

import { expectPickConfig, pickBackend } from "./backends.js";
import { assertBaseUrl } from "./netPolicy.js";
import type { Role } from "../config/types.js";

export interface ChatOpts {
  role: Role;
  system: string;
  userText: string;
  temperature?: number;
  maxTokens?: number;
  /** 调用方自己的取消信号；120s 超时另起 AbortController（architecture L662-663） */
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  usage?: { prompt: number; completion: number };
}

/** OpenAI 兼容响应体里我们关心的字段（宽松读取，不猜默认值） */
interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 单次 LLM 调用（不重试——重试在 retry.ts）。
 * cfg 收 unknown，由 expectPickConfig 显式校验，不合法抛 invalid_param。
 */
export async function llmChat(
  cfg: unknown,
  opts: ChatOpts,
): Promise<ChatResult> {
  const conf = expectPickConfig(cfg);
  const backend = pickBackend(conf, opts.role);
  assertBaseUrl(backend);

  const endpoint = backend.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("LLM 调用超时")), 120_000);
  // 调用方的 signal 只用来提前取消，不并入 120s 超时控制器（语义分离，spec 只冻结 120s）
  const onOuterAbort = (): void => controller.abort(new Error("调用方取消"));
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backend.apiKey}`,
      },
      body: JSON.stringify({
        model: backend.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userText },
        ],
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    if (r.status === 401 || r.status === 403) {
      throw new DramaError("llm_auth", {
        message: `后端 ${backend.id} 认证失败`,
      });
    }
    if (r.status === 404) {
      // 模型名不对时，多数实现返回 404
      throw new DramaError("llm_model_not_found", {
        message: `模型 ${backend.model} 在后端 ${backend.id} 上不存在`,
      });
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new DramaError("llm_unreachable", {
        message: `后端 ${backend.id} 返回 ${r.status}: ${body.slice(0, 500)}`,
      });
    }

    const data = (await r.json()) as ChatCompletionResponse;
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      throw new DramaError("llm_unreachable", {
        message: `后端 ${backend.id} 的响应缺少 choices[0].message.content 字段`,
      });
    }
    const usage = data.usage;
    return {
      content: raw,
      ...(isFiniteNumber(usage?.prompt_tokens) && isFiniteNumber(usage?.completion_tokens)
        ? { usage: { prompt: usage.prompt_tokens, completion: usage.completion_tokens } }
        : {}),
    };
  } catch (e) {
    // 非 DramaError（fetch 网络错 / 超时 abort）统一折成 llm_unreachable 上抛。
    // 这里 catch 是错分类重包装，不是吞错降级——原错挂 cause，绝不返回默认值。
    if (e instanceof DramaError) throw e;
    const reason = e instanceof Error ? e.message : String(e);
    throw new DramaError("llm_unreachable", {
      message: `后端 ${backend.id} 调用失败：${reason}`,
      cause: e,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
