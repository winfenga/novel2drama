import { describe, it, expect } from "vitest";
import { planSlots, type ActionSlot } from "./slots.js";
import { DramaError } from "@text2drama/shared";

function mkSlots(n: number): ActionSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    actor: "CH-01",
    action: `动作${i + 1}`,
  }));
}

describe("planSlots", () => {
  it("D=15 → 槽预算 9（封顶）、节拍 4", () => {
    const r = planSlots(mkSlots(9), 15);
    expect(r.slotBudget).toBe(9);
    expect(r.beatCount).toBe(4);
    expect(r.over).toBe(false);
    expect(r.beats[0]).toEqual({ index: 1, startSec: 0, endSec: 3.75 });
    expect(r.beats[3]!.endSec).toBe(15);
  });

  it("D=10 → 槽 6、节拍 3", () => {
    const r = planSlots(mkSlots(6), 10);
    expect(r.slotBudget).toBe(6);
    expect(r.beatCount).toBe(3);
  });

  it("D=6 → 槽 4（round(3.6)=4）、节拍 2", () => {
    const r = planSlots([], 6);
    expect(r.slotBudget).toBe(4);
    expect(r.beatCount).toBe(2);
    expect(r.usedSlots).toBe(0);
    expect(r.over).toBe(false);
  });

  it("超 9 槽预算 → over=true", () => {
    const r = planSlots(mkSlots(10), 15);
    expect(r.over).toBe(true);
    expect(r.usedSlots).toBe(10);
    expect(r.slotBudget).toBe(9);
  });

  it("节拍时间区间连续且覆盖 [0, D]", () => {
    const r = planSlots([], 12);
    expect(r.beats[0]!.startSec).toBe(0);
    expect(r.beats[r.beats.length - 1]!.endSec).toBe(12);
    for (let i = 1; i < r.beats.length; i++) {
      expect(r.beats[i]!.startSec).toBe(r.beats[i - 1]!.endSec);
    }
  });

  it("D 越界抛 DramaError(invalid_param)", () => {
    for (const bad of [4, 16, 7.5]) {
      expect(() => planSlots([], bad)).toThrow(DramaError);
    }
  });
});
