/**
 * M6-2 · 台词预算与拆条。
 *
 * 依据：m267-spec §2.2、storyboard-rules.md §四 L203-205 + L242 裁决：
 * 主场景台词是事实，D 迁就台词——超预算返回建议（加长到 X 秒 / 拆两镜），
 * 绝不静默压缩台词。
 */

import { DramaError } from "@text2drama/shared";

export interface DialogueBudgetInput {
  text: string;
}

export interface DialogueSuggestion {
  kind: "extend" | "split";
  /** extend：建议加长到的秒数 */
  targetD?: number;
  /** split：建议拆成几镜 */
  splitInto?: number;
}

export interface DialogueBudgetResult {
  charCount: number;
  hardCap: number;
  suggestCap: number;
  over: boolean;
  suggestion: DialogueSuggestion | null;
}

/**
 * 台词预算：ceil(N/3) 条数下限；绝不删台词。
 * - N ≤ floor(D×2.5)：不超，suggestion=null
 * - suggestCap < N ≤ floor(D×3)：超建议值——extend 到 ceil(N/2.5) 秒（D 上限 15 则拆镜）
 * - N > floor(D×3)：超硬上限——拆两镜
 */
export function dialogueBudget(lines: { text: string }[], D: number): DialogueBudgetResult {
  if (!Number.isInteger(D) || D < 5 || D > 15) {
    throw new DramaError("invalid_param", {
      message: "D 必须是 5-15 的整数（H3 约束）",
      details: { D },
    });
  }

  const charCount = lines.reduce((sum, l) => sum + l.text.length, 0);
  const hardCap = Math.floor(D * 3);
  const suggestCap = Math.floor(D * 2.5);
  const over = charCount > suggestCap;

  let suggestion: DialogueSuggestion | null = null;

  if (charCount > hardCap) {
    // 超硬上限：单镜塞不下，拆两镜（不静默压缩）
    suggestion = { kind: "split", splitInto: 2 };
  } else if (over) {
    // 超建议值但在硬上限内：建议加长到刚好容纳的秒数；加不进 5-15 区间则拆镜
    const targetD = Math.ceil(charCount / 2.5);
    suggestion = targetD <= 15 ? { kind: "extend", targetD } : { kind: "split", splitInto: 2 };
  }

  return { charCount, hardCap, suggestCap, over, suggestion };
}

/** 台词条数下限：自然语速 3 字/秒 → ceil(字数/3) 条 */
export function minLineCount(charCount: number): number {
  return Math.ceil(charCount / 3);
}
