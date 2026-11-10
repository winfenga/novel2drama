/**
 * M2-1 · 合规闸门核心（D1 两步制的第一步；读图第二步不在闸门职责内）。
 *
 * 依据：docs/m267-spec.md §1.2（签名冻结）、§0 D1（同链两步、多后端手动选）、E2
 * （判定步一次调用同时收 text 与 image；无视觉后端时 image 输入直接 refused）。
 *
 * 语义（spec §1.2 原文）：
 * - 逐个后端尝试（visionBackends 按 priority 排）：
 *   minor_signal → 立即返回（拦，早停，不再试后续后端）；
 *   refused → 试下一个后端；全部 refused → 返回最后一个 refused；
 *   全部尝试结束无 minor_signal → pass。
 * - 闸门忠实转发模型判定，不自行改判、不自动降级 SFW
 *   （降级是调用方拿到 minor_signal 后的动作）。
 * - llmCall 是自带最小实现层（M5 替换），不从 config 注册。
 * - verdict 与 GateVerdict 三值对齐 shared/errors.ts 的错误语义：
 *   refused = 后端拒绝服务（上游不可用/拒答），minor_signal = 有未成年信号。
 */

import { GATE_SYSTEM_PROMPT } from "./gatePrompt.js";

export interface GateVerdict {
  /** pass = 过闸；minor_signal = 有未成年信号；refused = 后端拒绝服务 */
  verdict: "pass" | "minor_signal" | "refused";
  /** 判定依据（哪个信号触发/后端原文），落审计必填 */
  evidence: string;
  /** 哪个后端出的结论 */
  backendId: string;
}

export interface GateDeps {
  /** 复用 M5 之前的临时调用层——M5 没做完，M2 自带最小 llmCall */
  llmCall: (opts: { backendId: string; system: string; userText: string }) => Promise<string>;
  /** 可用的视觉后端 id 列表（config.llmBackends 里 roles 含 "vision" 的 enabled 后端，按 priority 排） */
  visionBackends: { id: string; priority: number }[];
  /** 审计落点：append-only jsonl，一行一判定 */
  auditWrite: (entry: {
    ts: string;
    verdict: GateVerdict["verdict"];
    evidence: string;
    backendId: string;
    inputHash: string;
  }) => void;
}

/** 解析模型输出：只认 `verdict: pass|minor_signal` 两行格式；解析不出视为该后端 refused。 */
function parseVerdict(raw: string): { verdict: "pass" | "minor_signal"; evidence: string } | null {
  const verdictMatch = /^\s*verdict:\s*(pass|minor_signal)\s*$/im.exec(raw);
  if (verdictMatch === null || verdictMatch[1] === undefined) return null;
  const evidenceMatch = /^\s*evidence:\s*(.+)$/im.exec(raw);
  return {
    verdict: verdictMatch[1] as "pass" | "minor_signal",
    evidence: evidenceMatch !== null && evidenceMatch[1] !== undefined ? evidenceMatch[1].trim() : "",
  };
}

/** 输入指纹：审计去重/关联用，内容本身不落审计（隐私）。 */
async function inputHash(input: { text?: string; imageBase64?: string }): Promise<string> {
  const payload = JSON.stringify({ t: input.text ?? null, i: input.imageBase64 ?? null });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 组装判定步 userText：文本与图片（多模态后端一次调用同收，E2）。 */
function buildUserText(input: { text?: string; imageBase64?: string; imageMime?: string }): string {
  const parts: string[] = [];
  if (typeof input.text === "string" && input.text.length > 0) {
    parts.push(`[待判定文本]\n${input.text}`);
  }
  if (typeof input.imageBase64 === "string" && input.imageBase64.length > 0) {
    parts.push(`[待判定图片] mime=${input.imageMime ?? "image/*"} base64=${input.imageBase64}`);
  }
  return parts.join("\n\n");
}

/**
 * 合规闸门（D1 两步制的第一步）。
 * 逐个后端尝试：判 minor_signal → 立即返回（拦）；refused → 试下一个后端；
 * 全部 refused → 返回最后一个 refused；全部通过 → pass。
 * **不自动降级 SFW**——降级是调用方（工具层）拿到 minor_signal 后的动作。
 */
export async function runGate(
  input: { text?: string; imageBase64?: string; imageMime?: string },
  deps: GateDeps,
): Promise<GateVerdict> {
  const hash = await inputHash(input);
  const userText = buildUserText(input);
  const hasImage = typeof input.imageBase64 === "string" && input.imageBase64.length > 0;

  // E2：无视觉后端时 image 输入直接 refused 并提示配后端。
  if (hasImage && deps.visionBackends.length === 0) {
    const verdict: GateVerdict = {
      verdict: "refused",
      evidence: "输入含图片但没有任何可用视觉后端，请配置 roles 含 vision 的 LLM 后端",
      backendId: "none",
    };
    deps.auditWrite({ ts: new Date().toISOString(), verdict: verdict.verdict, evidence: verdict.evidence, backendId: verdict.backendId, inputHash: hash });
    return verdict;
  }

  // 纯文本无任何输入 → 参数问题，不是后端问题；显式报错不静默。
  if (userText.length === 0) {
    throw new Error("runGate: text 与 imageBase64 至少要有一个");
  }

  const backends = [...deps.visionBackends].sort((a, b) => a.priority - b.priority);
  let lastRefused: GateVerdict | null = null;

  for (const backend of backends) {
    let raw: string;
    try {
      raw = await deps.llmCall({
        backendId: backend.id,
        system: GATE_SYSTEM_PROMPT,
        userText,
      });
    } catch (err) {
      // 后端调用层异常按 refused 处理（后端没给出结论），试下一个。
      lastRefused = {
        verdict: "refused",
        evidence: `后端调用失败：${err instanceof Error ? err.message : String(err)}`,
        backendId: backend.id,
      };
      deps.auditWrite({ ts: new Date().toISOString(), verdict: "refused", evidence: lastRefused.evidence, backendId: backend.id, inputHash: hash });
      continue;
    }

    const parsed = parseVerdict(raw);
    if (parsed === null) {
      lastRefused = {
        verdict: "refused",
        evidence: `后端输出无法解析为 verdict 格式：${raw.slice(0, 200)}`,
        backendId: backend.id,
      };
      deps.auditWrite({ ts: new Date().toISOString(), verdict: "refused", evidence: lastRefused.evidence, backendId: backend.id, inputHash: hash });
      continue;
    }

    const verdict: GateVerdict = {
      verdict: parsed.verdict,
      evidence: parsed.evidence,
      backendId: backend.id,
    };
    deps.auditWrite({ ts: new Date().toISOString(), verdict: verdict.verdict, evidence: verdict.evidence, backendId: verdict.backendId, inputHash: hash });
    // minor_signal 早停：立即返回拦截，不再尝试后续后端。
    if (parsed.verdict === "minor_signal") return verdict;
    // pass 也是终态：模型明确判定通过，返回。
    return verdict;
  }

  // 全部后端 refused → 返回最后一个 refused。
  if (lastRefused !== null) return lastRefused;

  // visionBackends 为空且纯文本输入：没有任何后端可用，显式 refused。
  const verdict: GateVerdict = {
    verdict: "refused",
    evidence: "没有任何可用后端（visionBackends 为空）",
    backendId: "none",
  };
  deps.auditWrite({ ts: new Date().toISOString(), verdict: verdict.verdict, evidence: verdict.evidence, backendId: verdict.backendId, inputHash: hash });
  return verdict;
}
