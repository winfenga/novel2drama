/**
 * M1 全项目共用枚举 —— 唯一定义处。
 *
 * 归属：Block A（entities-1）。B 块只 import、不修改本文件（m1-spec §2）。
 * 依据：m1-spec §3.1（裁决值，原文无枚举值，主会话已裁）。
 * 约定：常量数组 `as const` + `z.enum` + `type X = z.infer<...>` 三件套成对导出。
 */

import { z } from "zod";

// ── 源文本类型 ──
export const SOURCE_KINDS = ["novel", "story", "script", "outline", "news", "other"] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

// ── 情绪（8 维 + auto）──
export const EMOTIONS = [
  "auto", "happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm",
] as const;
export const emotionSchema = z.enum(EMOTIONS);
export type Emotion = z.infer<typeof emotionSchema>;

// ── 景别（五景别 + 特写两级拆开，storyboard-rules L368 裁决）──
export const SHOT_SIZES = [
  "extreme_long", "long", "full", "medium", "closeup", "extreme_closeup",
] as const;
export const shotSizeSchema = z.enum(SHOT_SIZES);
export type ShotSize = z.infer<typeof shotSizeSchema>;

// ── 运镜（h3-prompt-rules §5.1 官方词表 14 种；arc/pov 的用途拦截在 M6，schema 层不拦）──
export const CAMERA_MOVES = [
  "static", "push_in", "pull_out", "pan", "truck", "tilt", "pedestal",
  "tracking", "arc", "pov", "shake", "roll", "focus_shift", "handheld",
] as const;
export const cameraMoveSchema = z.enum(CAMERA_MOVES);
export type CameraMove = z.infer<typeof cameraMoveSchema>;

// ── 任务类型（六种）──
export const TASK_TYPES = ["t2va", "i2va", "l2va", "fl2va", "ref2va", "hybrid"] as const;
export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof taskTypeSchema>;

// ── 介质锁定 ──
export const MEDIA_TYPES = ["anime", "2.5D", "realistic", "illustration"] as const;
export const mediaTypeSchema = z.enum(MEDIA_TYPES);
export type MediaType = z.infer<typeof mediaTypeSchema>;

// ── 内容策略 ──
export const CONTENT_POLICIES = ["sfw", "nsfw"] as const;
export const contentPolicySchema = z.enum(CONTENT_POLICIES);
export type ContentPolicy = z.infer<typeof contentPolicySchema>;

// ── NSFW 强度档位 ──
export const INTENSITY_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export const intensityLevelSchema = z.enum(INTENSITY_LEVELS);
export type IntensityLevel = z.infer<typeof intensityLevelSchema>;

// ── NSFW 模块 ──
export const MODULE_TYPES = ["M1", "M2", "M3", "M4", "M5"] as const;
export const moduleTypeSchema = z.enum(MODULE_TYPES);
export type ModuleType = z.infer<typeof moduleTypeSchema>;

// ── 身体状态七维（nsfw-design §五 英文化裁决）──
export const BODY_STATE_DIMS = [
  "wetness", "engorgement", "erectness", "aperture", "compression", "breathing", "muscle_tone",
] as const;
export const bodyStateDimSchema = z.enum(BODY_STATE_DIMS);
export type BodyStateDim = z.infer<typeof bodyStateDimSchema>;

// ── 身体状态档位（0-4；数字枚举，z.enum 只收字符串，用 z.literal 联合表达）──
export const BODY_STATE_GRADES = [0, 1, 2, 3, 4] as const;
export const bodyStateGradeSchema = z.union(BODY_STATE_GRADES.map((g) => z.literal(g))) as z.ZodType<
  (typeof BODY_STATE_GRADES)[number]
>;
export type BodyStateGrade = z.infer<typeof bodyStateGradeSchema>;

// ── 资产种类 ──
export const ASSET_KINDS = ["image", "video", "audio", "portrait"] as const;
export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof assetKindSchema>;

// ── 资产角色 ──
export const ASSET_ROLES = [
  "identity", "wardrobe", "scene", "pose", "keyframe", "interactive",
] as const;
export const assetRoleSchema = z.enum(ASSET_ROLES);
export type AssetRole = z.infer<typeof assetRoleSchema>;

// ── 资产来源 ──
export const MEDIA_SOURCES = ["generated", "uploaded", "derived"] as const;
export const mediaSourceSchema = z.enum(MEDIA_SOURCES);
export type MediaSource = z.infer<typeof mediaSourceSchema>;

// ── 分集状态 ──
export const EPISODE_STATUSES = ["draft", "reviewed", "locked"] as const;
export const episodeStatusSchema = z.enum(EPISODE_STATUSES);
export type EpisodeStatus = z.infer<typeof episodeStatusSchema>;

// ── 分镜状态 ──
export const SHOT_STATUSES = ["pending", "generating", "done", "failed"] as const;
export const shotStatusSchema = z.enum(SHOT_STATUSES);
export type ShotStatus = z.infer<typeof shotStatusSchema>;

// ── 关键帧/媒体角色（architecture L1460 MediaRole，M7 推导用；Asset/Shot 都引用，故放这里）──
export const FRAME_ROLES = ["first", "last", "character", "scene", "auto"] as const;
export const frameRoleSchema = z.enum(FRAME_ROLES);
export type FrameRole = z.infer<typeof frameRoleSchema>;
