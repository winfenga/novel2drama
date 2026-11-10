/**
 * M9-3 测试 · 归一化与定位（spec §3.3 重点用例全写死）：
 * - normalizeCjk：漸→渐、為→为（NFKC 不转繁简）
 * - spreadTokenTiming：我的 0.1s → 两字各 0.05s
 * - locateSpan 四方向：正常命中 / 繁简差命中 / 重复 ambiguous / 缺失 not_found（含尾部截断）
 * - 容错：差 1 字命中；差 30% 不命中
 * heard 数据用 decision-log §6B L294-304 的实测逐字时间戳。
 */
import { describe, expect, it } from "vitest";
import { DramaError } from "@text2drama/shared";

import { normalizeCjk, spreadTokenTiming, spreadTokens } from "./normalize.js";
import { locateSpan, type AsrWord } from "./align.js";

// DEC L294-304 实测输出（中文 15 字，截取到「我的」，后面用补齐数据延伸到完整句）
const HEARD_TRADITIONAL: AsrWord[] = [
  { word: "夜", startSec: 0.0, endSec: 0.6 },
  { word: "色", startSec: 0.6, endSec: 0.78 },
  { word: "漸", startSec: 0.78, endSec: 1.06 }, // ★坑一：ASR 输出繁体
  { word: "深,", startSec: 1.06, endSec: 1.5 }, // ★标点：ASR 把句号转成英文逗号
  { word: "我的", startSec: 1.84, endSec: 1.94 }, // ★坑二：两字一个 token 0.1s
  { word: "光芒", startSec: 1.94, endSec: 2.3 },
  { word: "為", startSec: 2.3, endSec: 2.42 }, // ★坑一
  { word: "迷途者", startSec: 2.42, endSec: 2.8 },
  { word: "指引", startSec: 2.8, endSec: 3.3 },
  { word: "方", startSec: 3.3, endSec: 3.6 },
  { word: "向", startSec: 3.88, endSec: 4.06 },
];

describe("normalizeCjk", () => {
  it("繁→简：漸→渐、為→为（NFKC 做不到，靠映射表）", () => {
    expect(normalizeCjk("漸")).toBe("渐");
    expect(normalizeCjk("為")).toBe("为");
    expect(normalizeCjk("夜色漸深，我的光芒為迷途者指引方向")).toBe(
      "夜色渐深 我的光芒为迷途者指引方向",
    );
  });

  it("NFKC 与空白折叠：全角字母数字、连续空白", () => {
    expect(normalizeCjk("ＡＢＣ１２３")).toBe("abc123");
    expect(normalizeCjk("a  b")).toBe("a b");
  });

  it("标点归一：ASR 转出的英文逗号/中文标点全折空格", () => {
    expect(normalizeCjk("深,")).toBe("深");
    expect(normalizeCjk("你好！？……「引号」")).toBe("你好 引号");
  });
});

describe("spreadTokenTiming", () => {
  it("「我的」单 token 0.1s → 两字各 0.05s（DEC 坑二实测样例）", () => {
    const r = spreadTokenTiming("我的", 1.84, 1.94);
    expect(r.map((c) => c.char)).toEqual(["我", "的"]);
    expect(r[0]!.startSec).toBeCloseTo(1.84);
    expect(r[0]!.endSec).toBeCloseTo(1.89);
    expect(r[1]!.startSec).toBeCloseTo(1.89);
    expect(r[1]!.endSec).toBeCloseTo(1.94);
  });

  it("单字 token 原样；三字 token 三等分", () => {
    expect(spreadTokenTiming("夜", 0, 0.6)).toEqual([{ char: "夜", startSec: 0, endSec: 0.6 }]);
    const r = spreadTokenTiming("迷途者", 2.42, 2.8);
    expect(r.map((c) => c.char)).toEqual(["迷", "途", "者"]);
    expect(r[2]!.endSec).toBeCloseTo(2.8);
  });

  it("spreadTokens：字流 + owners 对齐", () => {
    const { chars, owners } = spreadTokens([
      { word: "我的", startSec: 1.84, endSec: 1.94 },
      { word: "夜", startSec: 0, endSec: 0.6 },
    ]);
    expect(chars.map((c) => c.char)).toEqual(["我", "的", "夜"]);
    expect(owners).toEqual([0, 0, 1]);
  });
});

describe("locateSpan（三方向全测，不猜）", () => {
  it("① 正常命中：简体 expected 在繁体 heard 里命中（坑一被归一化消化）", () => {
    const span = locateSpan(HEARD_TRADITIONAL, "夜色渐深");
    expect(span.startSec).toBe(0.0);
    expect(span.endSec).toBe(1.5); // 到「深」字尾（token「深,」的标点被归一化剥离，深独占区间）
    expect(span.chars.map((c) => c.char).join("")).toBe("夜色渐深");
  });

  it("② 繁体 heard 简体 expected 命中中段：我的光芒为迷途者（跨 token 坑二）", () => {
    const span = locateSpan(HEARD_TRADITIONAL, "我的光芒为迷途者");
    expect(span.startSec).toBe(1.84);
    expect(span.endSec).toBeCloseTo(2.8);
  });

  it("②b 繁体 expected 也命中（双向归一）", () => {
    const span = locateSpan(HEARD_TRADITIONAL, "夜色漸深");
    expect(span.startSec).toBe(0.0);
    expect(span.endSec).toBe(1.5);
  });

  it("③ 重复台词 → ambiguous_multiple_exact_targets 报错（绝不确定位到其中一处）", () => {
    const heard: AsrWord[] = [
      { word: "我", startSec: 0, endSec: 0.2 },
      { word: "不", startSec: 0.2, endSec: 0.4 },
      { word: "知道", startSec: 0.4, endSec: 0.8 },
      { word: "。", startSec: 0.8, endSec: 0.9 },
      { word: "我", startSec: 1.2, endSec: 1.4 },
      { word: "不", startSec: 1.4, endSec: 1.6 },
      { word: "知道", startSec: 1.6, endSec: 2.0 },
    ];
    try {
      locateSpan(heard, "我不知道");
      expect.fail("应当抛 ambiguous");
    } catch (e) {
      expect(e).toBeInstanceOf(DramaError);
      const de = e as DramaError;
      expect(de.code).toBe("invalid_param");
      expect(de.details).toMatchObject({ kind: "ambiguous_multiple_exact_targets" });
      expect((de.details as { matches: unknown[] }).matches).toHaveLength(2);
    }
  });

  it("④ 完全缺失 → target_not_found 报错", () => {
    try {
      locateSpan(HEARD_TRADITIONAL, "你终于来了");
      expect.fail("应当抛 not_found");
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("invalid_param");
      expect(de.details).toMatchObject({ kind: "target_not_found" });
    }
  });

  it("④b ASR 尾部截断（坑三）：heard 短于 expected → not_found；期望尾部片段也 not_found", () => {
    // DEC 坑三：20.16s 音频只转到 19.96s，最后几个字没转
    const truncated: AsrWord[] = HEARD_TRADITIONAL.slice(0, 8); // 只到「迷途者」，尾部「指引方向」丢
    // heard 整体比期望短
    try {
      locateSpan(truncated, "夜色渐深，我的光芒为迷途者指引方向");
      expect.fail("应当抛 not_found");
    } catch (e) {
      expect((e as DramaError).details).toMatchObject({
        kind: "target_not_found",
        heardChars: 12,
      });
    }
    // heard 不短但尾部片段缺失
    try {
      locateSpan(truncated, "指引方向");
      expect.fail("应当抛 not_found");
    } catch (e) {
      expect((e as DramaError).details).toMatchObject({ kind: "target_not_found" });
    }
  });

  it("容错匹配：heard 与 expected 差 1 字（≤15%）命中；差 30% 不命中", () => {
    // 期望 10 字，heard 同窗口错 1 字（指→知）：10×15%=1.5 → tol=1，命中
    const heardTypo: AsrWord[] = [
      { word: "夜色渐深", startSec: 0, endSec: 1.5 },
      { word: "我的", startSec: 1.84, endSec: 1.94 },
      { word: "光芒", startSec: 1.94, endSec: 2.3 },
      { word: "为", startSec: 2.3, endSec: 2.42 },
      { word: "迷途知", startSec: 2.42, endSec: 2.8 }, // 者→知，1 字之差
      { word: "指引方向", startSec: 2.8, endSec: 4.06 },
    ];
    const span = locateSpan(heardTypo, "我的光芒为迷途者");
    expect(span.startSec).toBe(1.84);

    // 差 3 字（30%）：tol=1，不命中
    const heardBad: AsrWord[] = [
      { word: "夜色渐深", startSec: 0, endSec: 1.5 },
      { word: "光芒万丈照大地", startSec: 1.84, endSec: 2.3 }, // 与「我的光芒为迷途者」差 30%+
    ];
    try {
      locateSpan(heardBad, "我的光芒为迷途者");
      expect.fail("应当抛 not_found");
    } catch (e) {
      expect((e as DramaError).details).toMatchObject({ kind: "target_not_found" });
    }
  });

  it("空期望 → empty_target 报错", () => {
    expect(() => locateSpan(HEARD_TRADITIONAL, "。，！")).toThrow(DramaError);
  });
});
