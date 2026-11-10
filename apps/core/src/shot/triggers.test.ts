import { describe, it, expect } from "vitest";
import { affectedChecks, type ChangeKind } from "./triggers.js";

/** spec §2.5 冻结映射表（core-principles §5.4.4 L313-320 逐条） */
const EXPECTED: Record<ChangeKind, { riskItems: number[]; audioStale: boolean; rerunCausality: boolean }> = {
  duration: { riskItems: [6, 8, 9, 10, 12], audioStale: false, rerunCausality: true },
  dialogue: { riskItems: [9, 13], audioStale: true, rerunCausality: true },
  asset: { riskItems: [13, 19], audioStale: false, rerunCausality: false },
  character: { riskItems: [3, 4, 19], audioStale: false, rerunCausality: false },
};

describe("affectedChecks 四类变更映射", () => {
  it("duration → [6,8,9,10,12]", () => {
    expect(affectedChecks("duration")).toEqual(EXPECTED.duration);
  });

  it("dialogue → [9,13] + audioStale=true", () => {
    expect(affectedChecks("dialogue")).toEqual(EXPECTED.dialogue);
  });

  it("asset → [13,19]", () => {
    expect(affectedChecks("asset")).toEqual(EXPECTED.asset);
  });

  it("character → [3,4,19]", () => {
    expect(affectedChecks("character")).toEqual(EXPECTED.character);
  });

  it("返回副本，不共享内部数组", () => {
    const a = affectedChecks("duration");
    a.riskItems.push(99);
    expect(affectedChecks("duration").riskItems).not.toContain(99);
  });
});
