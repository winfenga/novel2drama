/**
 * M6-1 · 时长级联 9 公式（纯函数）。
 *
 * 依据：m267-spec §2.2（签名冻结）、storyboard-rules.md §四 L200-225 逐项。
 * D 是唯一主变量，所有派生量都是 D 的函数；改 D 必须重算一切。
 */

import { DramaError } from "@text2drama/shared";

export interface CascadeInput {
  /** 生效时长：perShotOverride[shotId] ?? globalSegDurationSec */
  D: number;
  /** 前序镜头的 D 列表（算时间码用） */
  priorDurations: number[];
  /** 目标模型单镜上限（H3 = 15） */
  Mmax: number;
}

export interface CascadeResult {
  index: number;
  startSec: number;
  endSec: number;
  /** D > Mmax 时切几个子镜 */
  subShots: number;
  /** 台词字数上限（建议值）floor(D × 2.5) */
  dialogueCharBudget: number;
  /** 台词字数硬上限 floor(D × 3) */
  dialogueCharHard: number;
  /** 动作槽 min(9, round(D × 0.6)) */
  slots: number;
  /** 视觉节拍 ceil(D / 4) */
  beats: number;
  /** 每节拍主运镜上限（=1）+ 单镜复杂运镜上限（≤2） */
  cameraBudget: { perBeat: 1; perShot: 2 };
  /** 表情数上限 1-3 */
  expressionBudget: [1, 3];
  /** 同镜人脸数上限（默认 3） */
  maxFaces: number;
}

/** D 合法性：5-15 整数（越界抛 invalid_param） */
function assertValidDuration(D: number): void {
  if (!Number.isInteger(D) || D < 5 || D > 15) {
    throw new DramaError("invalid_param", {
      message: "D 必须是 5-15 的整数（H3 约束）",
      details: { D },
    });
  }
}

/**
 * 九个派生量逐项照公式（storyboard-rules §四）：
 * 1 时间码累积：start = Σ priorD，end = start + D
 * 2 子镜切分：D ≤ Mmax 单镜；否则 k = ceil(D / Mmax)
 * 3 台词预算：floor(D × 2.5) 建议 / floor(D × 3) 硬上限
 * 4 动作槽：min(9, round(D × 0.6))
 * 5 节拍：ceil(D / 4)
 * 6 运镜预算：每节拍 ≤1 主运镜、单镜 ≤2
 * 7 表情 1-3；8 同镜人脸 ≤3；9 转场/声音点在调用方对齐时间码
 */
export function cascade(input: CascadeInput): CascadeResult {
  assertValidDuration(input.D);
  if (!Number.isInteger(input.Mmax) || input.Mmax < 1) {
    throw new DramaError("invalid_param", {
      message: "Mmax 必须是正整数",
      details: { Mmax: input.Mmax },
    });
  }

  const D = input.D;
  const startSec = input.priorDurations.reduce((sum, d) => sum + d, 0);

  return {
    index: input.priorDurations.length + 1,
    startSec,
    endSec: startSec + D,
    subShots: D > input.Mmax ? Math.ceil(D / input.Mmax) : 1,
    dialogueCharBudget: Math.floor(D * 2.5),
    dialogueCharHard: Math.floor(D * 3),
    slots: Math.min(9, Math.round(D * 0.6)),
    beats: Math.ceil(D / 4),
    cameraBudget: { perBeat: 1, perShot: 2 },
    expressionBudget: [1, 3],
    maxFaces: 3,
  };
}
