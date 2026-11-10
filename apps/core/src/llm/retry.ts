/**
 * M5-4 · temperature=1 重试 + 思考块剥离。
 *
 * 冻结依据：`docs/m35-spec.md` §1.2、`docs/architecture.md` L819-832（stripReasoning 正则照抄）。
 *
 * 重试策略（architecture L711）：部分模型只接受 `temperature=1`，按**报错文案**判断
 * 是否与 temperature 相关，是则用 temperature=1 重试一次。不维护模型白名单。
 * 红线：重试也失败 → **原错原样上抛**，绝不吞（execution-plan §8.2）。
 */
import { llmChat } from "./chat.js";
import type { ChatOpts, ChatResult } from "./chat.js";

/** 报错文案里出现这些词 → 认定是 temperature 相关错误 */
const TEMPERATURE_ERROR_RE = /temperature/i;

/**
 * 剥离思考块/元行（architecture L819-832 逐字照抄）：
 * 1. `<think>` 类标签块（think/thinking/analysis/reasoning/scratchpad）
 * 2. `<|...|>` 特殊 token
 * 3. markdown 代码围栏
 * 4. 「思考过程：」等元行
 */
const THINK_BLOCK_RE = /<(think|thinking|analysis|reasoning|scratchpad)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
const META_LINE_RE =
  /^(?:[-*#>\s]*)?(?:\*\*)?(?:思考过程|思考|分析|推理|说明|解释|备注|Thinking|Analysis)(?:\*\*)?\s*[:：]/i;

export function stripReasoning(text: string): string {
  let out = String(text || "");
  out = out.replace(THINK_BLOCK_RE, "");
  out = out.replace(/<\|[^|]{1,60}\|>/g, "");
  out = out.replace(/^\s*```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  return out
    .split(/\r?\n/)
    .filter((l) => !META_LINE_RE.test(l.trim()))
    .join("\n")
    .trim();
}

/**
 * temperature=1 重试一次的调用封装。
 *
 * catch 只在这里出现一次：第一次调用的温度相关错误需要识别后换参重试——
 * 这是「重试一次」的授权吞点（spec §3 共同纪律第 2 条）。重试失败时原错原样上抛，
 * 非温度相关错误直接上抛，均不返回默认值。
 */
export async function chatWithRetry(cfg: unknown, opts: ChatOpts): Promise<string> {
  let first: ChatResult;
  try {
    first = await llmChat(cfg, opts);
  } catch (e) {
    // 判断是否温度相关：按报错文案（llm_unreachable 的 message 里带上游响应体片段）。
    const msg = e instanceof Error ? e.message : String(e);
    if (!TEMPERATURE_ERROR_RE.test(msg)) throw e; // 与温度无关 → 原错上抛，不重试
    // 温度相关 → 用 temperature=1 重试一次；这次不再 catch，失败原错上抛
    const retried = await llmChat(cfg, { ...opts, temperature: 1 });
    return stripReasoning(retried.content);
  }
  return stripReasoning(first.content);
}
