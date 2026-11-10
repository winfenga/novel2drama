/**
 * M9-3b · 文本片段定位 —— heard 逐字流滑窗容错匹配（spec §3.2 / DEC §13.3 裁决）。
 *
 * 冻结算法：
 * ① 匹配前 normalizeCjk（繁简映射 + NFKC + 标点归一）
 * ② token 拆字流（spreadTokens，坑二）
 * ③ 滑窗 + 莱文斯坦距离 ≤ max(1, len×15%)（不用上游 exact 严格相等）
 * ④ 找不到 → target_not_found；多处命中 → ambiguous；**报错不猜**
 *    （DramaError invalid_param 带 details；G4：DEC §13.4 的状态语义吸收进 details.kind，
 *     字段名 is_not_a_speech_classifier 等不照抄）
 */
import { DramaError } from "@text2drama/shared";

import { normalizeCjk, spreadTokens } from "./normalize.js";
import type { CharTiming } from "@text2drama/shared";

export interface AsrWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface LocatedSpan {
  startSec: number;
  endSec: number;
  /** 命中窗口的实际 heard 逐字（调试/回写 charTimings 用） */
  chars: CharTiming[];
}

/** 莱文斯坦距离（经典 DP，O(mn)；窗口与期望都 ≤ 数十字，性能无忧） */
function editDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1, // 删
        cur[j - 1]! + 1, // 插
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), // 换
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** 容错阈值：max(1, len×15%)，向下取整但至少 1（DEC §13.3 原式） */
function tolerance(len: number): number {
  return Math.max(1, Math.floor(len * 0.15));
}

/**
 * 在 heard 逐字流里定位 expectedText 的唯一窗口。
 * @throws DramaError invalid_param + details.kind:
 *   - "target_not_found"：无任何窗口达容错阈值（含 ASR 尾部截断——坑三）
 *   - "ambiguous_multiple_exact_targets"：多个窗口同时命中（台词重复出现）
 */
export function locateSpan(heard: AsrWord[], expectedText: string): LocatedSpan {
  const { chars } = spreadTokens(heard);
  const expected = Array.from(normalizeCjk(expectedText).replace(/ /g, ""));
  if (expected.length === 0) {
    throw new DramaError("invalid_param", {
      message: "expectedText 归一化后为空（纯标点/空白），无法定位",
      details: { kind: "empty_target" },
    });
  }
  if (chars.length < expected.length) {
    // 坑三：ASR 截断（heard 比期望还短）不可能命中
    throw new DramaError("invalid_param", {
      message: "ASR heard 字流比期望片段短（疑似尾部截断），定位失败不猜",
      details: {
        kind: "target_not_found",
        heardChars: chars.length,
        expectedChars: expected.length,
        heardText: chars.map((c) => c.char).join(""),
      },
    });
  }

  const tol = tolerance(expected.length);
  const hits: number[] = []; // 命中窗口的起始字下标
  for (let start = 0; start + expected.length <= chars.length; start++) {
    const window = chars.slice(start, start + expected.length).map((c) => c.char);
    if (editDistance(window, expected) <= tol) hits.push(start);
  }

  if (hits.length === 0) {
    throw new DramaError("invalid_param", {
      message: `期望片段在 ASR 结果中定位失败（容错 ${tol} 字内无命中）`,
      details: {
        kind: "target_not_found",
        expectedText,
        heardText: chars.map((c) => c.char).join(""),
        tolerance: tol,
      },
    });
  }
  if (hits.length > 1) {
    throw new DramaError("invalid_param", {
      message: `期望片段命中 ${hits.length} 处（台词重复出现），无法唯一定位不猜`,
      details: {
        kind: "ambiguous_multiple_exact_targets",
        expectedText,
        matches: hits.map((h) => ({
          startSec: chars[h]!.startSec,
          endSec: chars[h + expected.length - 1]!.endSec,
        })),
      },
    });
  }

  const s = hits[0]!;
  const windowChars = chars.slice(s, s + expected.length);
  return {
    startSec: windowChars[0]!.startSec,
    endSec: windowChars[windowChars.length - 1]!.endSec,
    chars: windowChars,
  };
}
