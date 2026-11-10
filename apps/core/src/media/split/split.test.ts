/**
 * M9-4 测试 · 切分（DEC §6B.2 实测数据做基准：4 段台词切 4 镜、时刻精确）。
 */
import { describe, expect, it } from "vitest";

import { splitDialogueAudio } from "./split.js";
import { locateSpan, type AsrWord } from "../align/align.js";

// DEC L294-304 实测逐字数据（延伸补齐），整句 4.34s（尾部静默 0.28s），
// 4 段分镜片段（表示法 B：存文本子串）→ locateSpan 定位 → splitDialogueAudio 切分
const HEARD: AsrWord[] = [
  { word: "夜", startSec: 0.0, endSec: 0.6 },
  { word: "色", startSec: 0.6, endSec: 0.78 },
  { word: "漸", startSec: 0.78, endSec: 1.06 },
  { word: "深,", startSec: 1.06, endSec: 1.5 },
  { word: "我的", startSec: 1.84, endSec: 1.94 },
  { word: "光芒", startSec: 1.94, endSec: 2.3 },
  { word: "為", startSec: 2.3, endSec: 2.42 },
  { word: "迷途者", startSec: 2.42, endSec: 2.8 },
  { word: "指引", startSec: 2.8, endSec: 3.3 },
  { word: "方", startSec: 3.3, endSec: 3.6 },
  { word: "向", startSec: 3.88, endSec: 4.06 },
];

const FULL_TEXT = "夜色渐深，我的光芒为迷途者指引方向";

describe("splitDialogueAudio（DEC 实测基准）", () => {
  it("4 段台词切 4 镜、时刻精确", () => {
    const fragments = ["夜色渐深", "我的光芒", "为迷途者", "指引方向"];
    const spans = fragments.map((text, i) => {
      const span = locateSpan(HEARD, text); // 先容错定位（坑一坑二被消化）
      return { shotId: `s${i + 1}`, text, startSec: span.startSec, endSec: span.endSec };
    });
    const cuts = splitDialogueAudio(4.34, spans);
    expect(cuts).toEqual([
      { shotId: "s1", startSec: 0.0, endSec: 1.5 },
      { shotId: "s2", startSec: 1.84, endSec: 2.3 },
      { shotId: "s3", startSec: 2.3, endSec: 2.8 },
      { shotId: "s4", startSec: 2.8, endSec: 4.06 },
    ]);
    // 精度断言：每镜区间与实测逐字时刻逐位一致
    expect(cuts[0]!.endSec - cuts[0]!.startSec).toBeCloseTo(1.5);
    expect(cuts[1]!.startSec).toBeCloseTo(1.84); // 「我的」token 起点（坑二均分前的原始 token 边界）
    expect(cuts[3]!.endSec).toBeCloseTo(4.06); // 台词结束（音频 4.34s，尾部静默 0.28s 不进任何镜）
  });

  it("切不出（定位失败）→ 上游 locateSpan 报错不猜（链路协同语义）", () => {
    expect(() => locateSpan(HEARD, "你终于来了")).toThrow();
  });

  it("区间倒挂/越界/重叠/空 → 报错不猜", () => {
    expect(() => splitDialogueAudio(4.34, [])).toThrow();
    expect(() =>
      splitDialogueAudio(4.34, [{ shotId: "a", text: "x", startSec: 2.0, endSec: 1.0 }]),
    ).toThrow();
    expect(() =>
      splitDialogueAudio(4.34, [{ shotId: "a", text: "x", startSec: 0, endSec: 5.0 }]),
    ).toThrow();
    expect(() =>
      splitDialogueAudio(4.34, [
        { shotId: "a", text: "x", startSec: 0, endSec: 2.0 },
        { shotId: "b", text: "y", startSec: 1.5, endSec: 3.0 },
      ]),
    ).toThrow();
  });
});
