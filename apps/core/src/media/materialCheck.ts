/**
 * M7-2 · 素材校验（渲染前）。
 *
 * 唯一的一张校验表：`architecture.md` L1499-1511。其他位置若出现同类表格，以本表为准。
 * 显式 taskType 与素材构成冲突 → invalid_task_type_for_media，不改路（ARCH L1495）。
 *
 * 表格行序说明：「同一 role 标两次（两张首帧）」与「每镜 D_n 5-15」两行是「任意 task_type」行；
 * D_n 校验需要时长参数，不在本函数签名内（由调用方另查 invalid_param），此处只做素材维度。
 */

import type { TaskType } from "@text2drama/shared";
import type { RefItem } from "./deriveTaskType.js";

export interface MaterialCheckResult {
  ok: boolean;
  /** 不 ok 时的错误码（shared ERROR_CODES 已有码表） */
  code?: string;
  detail?: string;
}

const okResult: MaterialCheckResult = { ok: true };
const fail = (code: string, detail: string): MaterialCheckResult => ({ ok: false, code, detail });

function isKeyframe(r: RefItem): boolean {
  return r.role === "first" || r.role === "last";
}

/** 参考素材：character/scene 角色，或 video/audio 介质（与 deriveTaskType 的 hasRefs 口径一致） */
function isReferenceMaterial(r: RefItem): boolean {
  return r.role === "character" || r.role === "scene" || r.kind === "video" || r.kind === "audio";
}

/** 参考素材限额（ref2va 行原文）：图 ≤6，音频 ≤2，视频 ≤1 */
function checkRefQuota(refs: RefItem[]): MaterialCheckResult | null {
  const images = refs.filter((r) => r.kind === "image").length;
  const audios = refs.filter((r) => r.kind === "audio").length;
  const videos = refs.filter((r) => r.kind === "video").length;
  if (images > 6) return fail("invalid_param", `参考图 ${images} 张，超出上限 6`);
  if (audios > 2) return fail("invalid_param", `参考音频 ${audios} 条，超出上限 2`);
  if (videos > 1) return fail("invalid_param", `参考视频 ${videos} 条，超出上限 1`);
  return null;
}

export function checkMaterials(taskType: TaskType, refs: RefItem[]): MaterialCheckResult {
  // 「任意」行：同一 role 标两次（两张首帧）→ duplicate_frame_role（first/last 只能各一张）
  const firstCount = refs.filter((r) => r.role === "first").length;
  const lastCount = refs.filter((r) => r.role === "last").length;
  if (firstCount > 1) return fail("duplicate_frame_role", "first 帧标了多张（只能一张）");
  if (lastCount > 1) return fail("duplicate_frame_role", "last 帧标了多张（只能一张）");

  const keyframes = refs.filter(isKeyframe);
  const materials = refs.filter(isReferenceMaterial);

  switch (taskType) {
    case "t2va":
      // 无任何媒体
      if (refs.length > 0) {
        return fail("invalid_task_type_for_media", "t2va 不允许携带任何媒体素材");
      }
      return okResult;

    case "i2va":
    case "l2va": {
      // 恰好 1 个首/尾帧，无参考素材
      const need: "first" | "last" = taskType === "i2va" ? "first" : "last";
      const wanted = keyframes.filter((r) => r.role === need);
      if (wanted.length === 0) {
        return fail("missing_reference_image", `${taskType} 需要恰好 1 张 ${need} 帧`);
      }
      if (materials.length > 0 || keyframes.some((r) => r.role !== need)) {
        return fail("invalid_task_type_for_media", `${taskType} 不允许参考素材或另一端关键帧`);
      }
      return okResult;
    }

    case "fl2va": {
      // 恰好 1 首 + 1 尾，无参考素材
      if (firstCount === 0 || lastCount === 0) {
        return fail("missing_reference_image", "fl2va 需要恰好 1 张 first + 1 张 last 帧");
      }
      if (materials.length > 0) {
        return fail("invalid_task_type_for_media", "fl2va 不允许参考素材");
      }
      return okResult;
    }

    case "ref2va": {
      // 媒体 ≥1，图 ≤6，音频 ≤2，视频 ≤1，无关键帧
      if (materials.length === 0) return fail("missing_reference_media", "ref2va 需要至少 1 件参考素材");
      if (keyframes.length > 0) {
        return fail("invalid_task_type_for_media", "ref2va 不允许关键帧（有关键帧应走 hybrid）");
      }
      const quota = checkRefQuota(materials);
      return quota ?? okResult;
    }

    case "hybrid": {
      // 关键帧 ≥1 且 参考素材 ≥1（两类缺一不可）；参考素材沿用 ref2va 限额
      if (keyframes.length === 0) return fail("hybrid_needs_keyframe", "走 hybrid 但一个关键帧都没给");
      if (materials.length === 0) return fail("hybrid_needs_reference", "走 hybrid 但一件参考素材都没给");
      const quota = checkRefQuota(materials);
      return quota ?? okResult;
    }
  }
}
