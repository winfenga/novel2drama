import { describe, it, expect } from "vitest";
import {
  runGate1Checks,
  runGate2Checks,
  runGate3Checks,
  shouldProceed,
  type Gate1Facts,
  type Gate2Facts,
  type Gate3Facts,
} from "./riskScore.js";

const g1ok: Gate1Facts = {
  subjects: ["林晚"],
  presentSubjects: ["林晚"],
  stateVariants: ["龙化"],
  presentVariants: ["龙化"],
};

const g2ok: Gate2Facts = {
  timecodes: [
    { index: 1, startSec: 0, endSec: 5 },
    { index: 2, startSec: 5, endSec: 15 },
  ],
  initialPositionRebuilt: true,
  slotsUsed: 6,
  slotBudget: 9,
  dialogueCharCount: 20,
  dialogueCharBudget: 25,
  cameraPerBeat: [1, 1, 1],
  cameraPerShot: 2,
  expressionCount: 3,
  faces: 3,
  maxFaces: 3,
  stateChanges: [{ name: "龙化", hasStartAnchor: true, hasEndAnchor: true }],
  assetRefs: ["CH-01", "SC-01"],
  assignedCodes: ["CH-01", "SC-01", "PR-01"],
};

const g3ok: Gate3Facts = {
  promptLanguageMatchesModel: true,
  durationWithinModelLimit: true,
  negativeBgmSubtitleOk: true,
};

describe("runGate1Checks（闸一 5 项）", () => {
  it("返回 ①-⑤ 五项；E4：①②⑤ 待 LLM 接入 score 1", () => {
    const items = runGate1Checks(g1ok);
    expect(items.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    for (const id of [1, 2, 5]) {
      const item = items.find((i) => i.id === id)!;
      expect(item.score).toBe(1);
      expect(item.detail).toBe("待 LLM 接入");
    }
  });

  it("③④ 纯规则：一致 → 0 分", () => {
    const items = runGate1Checks(g1ok);
    expect(items.find((i) => i.id === 3)!.score).toBe(0);
    expect(items.find((i) => i.id === 4)!.score).toBe(0);
  });

  it("③ 主体遗漏/多抽 → 2 分", () => {
    const items = runGate1Checks({ ...g1ok, presentSubjects: ["陈默"] });
    const item = items.find((i) => i.id === 3)!;
    expect(item.score).toBe(2);
    expect(item.detail).toContain("遗漏");
    expect(item.detail).toContain("多抽");
  });

  it("④ 状态变体缺失 → 2 分", () => {
    const items = runGate1Checks({ ...g1ok, presentVariants: ["离析"] });
    expect(items.find((i) => i.id === 4)!.score).toBe(2);
  });
});

describe("runGate2Checks（闸二 8 项）", () => {
  it("全合规 → 八项全 0", () => {
    const items = runGate2Checks(g2ok);
    expect(items).toHaveLength(8);
    expect(items.every((i) => i.score === 0)).toBe(true);
  });

  it("⑨ 台词超字数 → 2 分（spec 出口标准用例）", () => {
    const items = runGate2Checks({ ...g2ok, dialogueCharCount: 30, dialogueCharBudget: 25 });
    const item = items.find((i) => i.id === 9)!;
    expect(item.score).toBe(2);
    expect(item.detail).toContain("台词超字数");
  });

  it("⑥ 时间码有缺口 → 2 分", () => {
    const items = runGate2Checks({
      ...g2ok,
      timecodes: [
        { index: 1, startSec: 0, endSec: 5 },
        { index: 2, startSec: 8, endSec: 15 },
      ],
    });
    expect(items.find((i) => i.id === 6)!.score).toBe(2);
  });

  it("⑦ 初始位置未重建 → 2 分", () => {
    const items = runGate2Checks({ ...g2ok, initialPositionRebuilt: false });
    expect(items.find((i) => i.id === 7)!.score).toBe(2);
  });

  it("⑧ 动作槽超载 → 2 分", () => {
    const items = runGate2Checks({ ...g2ok, slotsUsed: 10, slotBudget: 9 });
    expect(items.find((i) => i.id === 8)!.score).toBe(2);
  });

  it("⑩ 运镜/表情过密 → 2 分", () => {
    const items = runGate2Checks({ ...g2ok, cameraPerBeat: [2, 1, 1] });
    expect(items.find((i) => i.id === 10)!.score).toBe(2);
    const items2 = runGate2Checks({ ...g2ok, cameraPerShot: 3 });
    expect(items2.find((i) => i.id === 10)!.score).toBe(2);
    const items3 = runGate2Checks({ ...g2ok, expressionCount: 4 });
    expect(items3.find((i) => i.id === 10)!.score).toBe(2);
  });

  it("⑪ 同镜人数超载 → 2 分", () => {
    const items = runGate2Checks({ ...g2ok, faces: 5, maxFaces: 3 });
    expect(items.find((i) => i.id === 11)!.score).toBe(2);
  });

  it("⑫ 状态变化缺起止锚点 → 2 分", () => {
    const items = runGate2Checks({
      ...g2ok,
      stateChanges: [{ name: "龙化", hasStartAnchor: true, hasEndAnchor: false }],
    });
    expect(items.find((i) => i.id === 12)!.score).toBe(2);
  });

  it("⑬ 资产引用错位 → 2 分", () => {
    const items = runGate2Checks({ ...g2ok, assetRefs: ["CH-01", "CH-99"] });
    expect(items.find((i) => i.id === 13)!.score).toBe(2);
  });
});

describe("runGate3Checks（闸三 7 项）", () => {
  it("⑭⑮⑯ 纯规则可判；E4：⑰-⑳ 待 LLM 接入 score 1", () => {
    const items = runGate3Checks(g3ok);
    expect(items).toHaveLength(7);
    for (const id of [14, 15, 16]) {
      expect(items.find((i) => i.id === id)!.score).toBe(0);
    }
    for (const id of [17, 18, 19, 20]) {
      const item = items.find((i) => i.id === id)!;
      expect(item.score).toBe(1);
      expect(item.detail).toBe("待 LLM 接入");
    }
  });

  it("⑭ 格式/语言不匹配 → 2 分", () => {
    const items = runGate3Checks({ ...g3ok, promptLanguageMatchesModel: false });
    expect(items.find((i) => i.id === 14)!.score).toBe(2);
  });

  it("⑮ 单镜上限未处理 → 2 分", () => {
    const items = runGate3Checks({ ...g3ok, durationWithinModelLimit: false });
    expect(items.find((i) => i.id === 15)!.score).toBe(2);
  });

  it("⑯ 负向/BGM/字幕策略错误 → 2 分", () => {
    const items = runGate3Checks({ ...g3ok, negativeBgmSubtitleOk: false });
    expect(items.find((i) => i.id === 16)!.score).toBe(2);
  });
});

describe("闸间单向流水", () => {
  it("闸一有 2 分 → 闸二不跑（shouldProceed=false）", () => {
    const g1 = runGate1Checks({ ...g1ok, presentSubjects: ["陈默"] });
    expect(shouldProceed(g1)).toBe(false);
  });

  it("闸一过 → 闸二可跑", () => {
    const g1 = runGate1Checks(g1ok);
    expect(shouldProceed(g1)).toBe(true);
  });

  it("闸二有 2 分 → 闸三不跑", () => {
    const g2 = runGate2Checks({ ...g2ok, dialogueCharCount: 100 });
    expect(shouldProceed(g2)).toBe(false);
  });
});
