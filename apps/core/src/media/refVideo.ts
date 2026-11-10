/**
 * M7-4 · 参考视频策略（reference_video_policy = official_2_to_15s）。
 *
 * 参考项目处理照抄 architecture L1557-1563：
 * probe 帧 → 17n+5 向下对齐 → 封顶 362 帧；超 15s 截断记 sourceVideoTruncated。
 * 这是 http 200 的**非错误标记**（shared errors.ts 头注），不做 DramaError。
 */

const FPS = 24;
/** H3 单镜上限 362 帧（15 秒） */
const MAX_FRAMES = 362;

export interface RefVideoResult {
  frames: number;
  truncated: boolean;
}

/** 17n+5 向下对齐 + 封顶 362；超 15s 截断并记 sourceVideoTruncated */
export function alignRefVideo(durationSec: number): RefVideoResult {
  const probedFrames = durationSec > 0 ? Math.round(durationSec * FPS) : 0;
  if (probedFrames <= 0) return { frames: 0, truncated: false };
  // 17n+5 向下对齐
  const n = Math.max(0, Math.floor((probedFrames - 5) / 17));
  const aligned = 17 * n + 5;
  // 封顶 362 帧
  const capped = Math.min(aligned, MAX_FRAMES);
  const truncated = capped > 0 && aligned > capped;
  return { frames: capped, truncated };
}
