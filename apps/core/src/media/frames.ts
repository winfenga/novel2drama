/**
 * M7-3 · 帧换算与回显。
 *
 * `length` 字段单位是帧，不是秒；GUI 必须换算并显示两者（architecture L1513-1545）。
 *
 * 取整方向裁决（主会话 2026-11-10，[BLOCKED]① 解除）：
 * 目标秒数向上对齐到最近的 17n+5 网格点（n 用 ceil），保证**实际出片 ≥ 用户要求**。
 * 依据：api-contract L970-976 换算表（5→124 / 10→243 / 15→362，误差全为 ±0.46s 内且
 * 5s/10s/15s 三档均为正偏差）与 GUI 示例 L1434「5.0 秒（约 124 帧）」；「向下对齐」字样
 * 仅适用于参考视频 probe 帧（L1559，见 refVideo.ts）与长视频分段（L1900），不适用于
 * 用户目标时长换算。architecture L1521 代码块的 floor 为文档笔误，已记 decision-log §二十。
 */

const FPS = 24;
/** H3 单镜上限 362 帧（15 秒），防御性封顶 */
const MAX_FRAMES = 362;

/** 秒 → H3 帧数：向上对齐到 17n+5 网格（n 用 ceil），封顶 362 */
export function secondsToFrames(seconds: number): number {
  const raw = Math.round(seconds * FPS);
  const n = Math.max(0, Math.ceil((raw - 5) / 17));
  return Math.min(17 * n + 5, MAX_FRAMES);
}

/** 帧数 → 实际秒数（用于回显真实时长 actualDurationSec） */
export function framesToSeconds(frames: number): number {
  return frames / FPS;
}
