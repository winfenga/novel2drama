/**
 * M7-1 · 六值 task_type 推导。
 *
 * 判定顺序照抄 `architecture.md` L1463-1483（与引擎 conditioning.py resolve_task_type 对齐），
 * 一字不改：① 有参考素材 + 任一关键帧 → hybrid（最高优先级）；
 * ② 纯关键帧 fl2va/i2va/l2va；③ 只有参考 ref2va；④ 什么都没有 t2va。
 *
 * 类型从 shared import，不重定义（m267-spec §0「M1 遗产」）。
 */

import type { FrameRole, TaskType } from "@text2drama/shared";

export interface RefItem {
  role: FrameRole;
  kind: "image" | "video" | "audio";
}

export function deriveTaskType(refs: RefItem[]): TaskType {
  const hasFirst = refs.some((r) => r.role === "first");
  const hasLast = refs.some((r) => r.role === "last");
  const hasRefs = refs.some(
    (r) => r.role === "character" || r.role === "scene" || r.kind === "video" || r.kind === "audio",
  );

  // ① 硬约束：有参考素材时，只有 ref2va / hybrid 合法
  // ② 关键帧 + 参考素材同时存在 → hybrid（最高优先级）
  if (hasRefs && (hasFirst || hasLast)) return "hybrid";

  // ③ 无参考素材，纯关键帧路径
  if (hasFirst && hasLast) return "fl2va";
  if (hasFirst) return "i2va";
  if (hasLast) return "l2va";

  // ④ 有参考素材、无关键帧
  if (hasRefs) return "ref2va";

  // ⑤ 什么都没有
  return "t2va";
}
