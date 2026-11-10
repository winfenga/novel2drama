import { describe, it, expect } from "vitest";
import { dialogueBudget, minLineCount } from "./dialogueBudget.js";
import { DramaError } from "@text2drama/shared";

function lines(nChars: number): { text: string }[] {
  // 单条台词，总字数 = nChars
  return [{ text: "字".repeat(nChars) }];
}

describe("dialogueBudget", () => {
  it("未超建议值 → over=false, suggestion=null", () => {
    const r = dialogueBudget(lines(20), 10); // 建议 25、硬 30
    expect(r).toEqual({
      charCount: 20, hardCap: 30, suggestCap: 25,
      over: false, suggestion: null,
    });
  });

  it("超建议值但在硬上限内 → extend 建议", () => {
    const r = dialogueBudget(lines(28), 10); // 25 < 28 ≤ 30
    expect(r.over).toBe(true);
    expect(r.suggestion).toEqual({ kind: "extend", targetD: 12 }); // ceil(28/2.5)=12
  });

  it("超硬上限 → split 两镜", () => {
    const r = dialogueBudget(lines(35), 10); // 35 > 30
    expect(r.over).toBe(true);
    expect(r.suggestion).toEqual({ kind: "split", splitInto: 2 });
  });

  it("20 句台词 D=5 → over=true + suggestion.split", () => {
    // 20 条台词、每条 10 字 = 200 字，硬上限 floor(5×3)=15
    const many = Array.from({ length: 20 }, () => ({ text: "一二三四五六七八九十" }));
    const r = dialogueBudget(many, 5);
    expect(r.charCount).toBe(200);
    expect(r.over).toBe(true);
    expect(r.suggestion).toEqual({ kind: "split", splitInto: 2 });
  });

  it("D=15 超硬上限 → split（15 已是上限，无法 extend）", () => {
    const r = dialogueBudget(lines(50), 15); // 硬上限 45
    expect(r.over).toBe(true);
    expect(r.suggestion).toEqual({ kind: "split", splitInto: 2 });
  });

  it("多台词累计字数", () => {
    const r = dialogueBudget([{ text: "你好" }, { text: "再见朋友" }], 5);
    expect(r.charCount).toBe(6);
    expect(r.hardCap).toBe(15);
    expect(r.over).toBe(false);
  });

  it("D 越界抛 DramaError(invalid_param)", () => {
    for (const bad of [4, 16, 7.5]) {
      expect(() => dialogueBudget(lines(10), bad)).toThrow(DramaError);
    }
  });

  it("minLineCount：ceil(N/3) 条数下限", () => {
    expect(minLineCount(1)).toBe(1);
    expect(minLineCount(3)).toBe(1);
    expect(minLineCount(4)).toBe(2);
    expect(minLineCount(200)).toBe(67);
  });
});
