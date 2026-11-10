/**
 * M6-3 · 动作槽与节拍。
 *
 * 依据：m267-spec §2.2（slots = min(9, round(D × 0.6))，beats = ceil(D / 4)）、
 * storyboard-rules.md §四 L205-206：一槽 = 一个主动作事件（谁→做什么→对谁→结果→
 * 必要物理/声音反馈）；节拍每 3-5 秒一个核心事件，反应拍/停顿计入。
 * E5 漂移裁决：本轮按通用 9 槽实现，NSFW 动作槽是 M3-5/M3-6 内容层的事。
 */

import { DramaError } from "@text2drama/shared";

/** 单个动作槽：一个主动作事件 */
export interface ActionSlot {
  index: number;
  /** 谁 */
  actor: string;
  /** 做什么 */
  action: string;
  /** 对谁 */
  target?: string;
  /** 结果 */
  result?: string;
  /** 必要物理/声音反馈 */
  feedback?: string;
}

/** 视觉节拍：每 3-5 秒一个核心事件 */
export interface VisualBeat {
  index: number;
  startSec: number;
  endSec: number;
}

export interface SlotPlanResult {
  /** 槽预算 min(9, round(D × 0.6)) */
  slotBudget: number;
  /** 节拍数 ceil(D / 4) */
  beatCount: number;
  /** 节拍时间区间（在 D 内均分） */
  beats: VisualBeat[];
  /** 实际填入的槽数（≤ slotBudget，超了不算超时——超时算 ⑧ 风险项） */
  usedSlots: number;
  over: boolean;
}

/**
 * 槽预算与节拍规划。slots 列表只数数量做校验，不重排内容（内容层是 M3 的事）。
 */
export function planSlots(slots: ActionSlot[], D: number): SlotPlanResult {
  if (!Number.isInteger(D) || D < 5 || D > 15) {
    throw new DramaError("invalid_param", {
      message: "D 必须是 5-15 的整数（H3 约束）",
      details: { D },
    });
  }

  const slotBudget = Math.min(9, Math.round(D * 0.6));
  const beatCount = Math.ceil(D / 4);

  const beats: VisualBeat[] = [];
  const beatLen = D / beatCount;
  for (let i = 0; i < beatCount; i++) {
    beats.push({
      index: i + 1,
      startSec: round2(i * beatLen),
      endSec: round2((i + 1) * beatLen),
    });
  }

  return {
    slotBudget,
    beatCount,
    beats,
    usedSlots: slots.length,
    over: slots.length > slotBudget,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
