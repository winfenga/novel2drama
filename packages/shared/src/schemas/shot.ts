/**
 * 分镜实体（M1-3）。
 *
 * 归属：Block B（entities-2）。依据：m1-spec §3.7 + architecture.md L186-225 逐字段抄
 * + h3-prompt-rules §5.5（FacingConstraint 三要素裁决）。
 *
 * 内容策略的联合约束不在本文件重复实现：从 `nsfw.ts` 导入 `refineShotPolicy`
 * 复用（NSFW-P0 命门，m1-spec §3.6）。
 */

import { z } from "zod";
import {
  cameraMoveSchema,
  contentPolicySchema,
  mediaTypeSchema,
  moduleTypeSchema,
  intensityLevelSchema,
  shotSizeSchema,
  shotStatusSchema,
  taskTypeSchema,
} from "./enums.js";
import type {
  CameraMove,
  ContentPolicy,
  IntensityLevel,
  MediaType,
  ModuleType,
  ShotSize,
  ShotStatus,
  TaskType,
} from "./enums.js";
import { videoPromptSchema, imagePromptSetSchema } from "./prompt.js";
import type { ImagePromptSet, VideoPrompt } from "./prompt.js";
import { bodyStateGradientSchema, refineShotPolicy } from "./nsfw.js";
import type { BodyStateGradient } from "./nsfw.js";

// ── FacingConstraint：朝向三要素（h3 §5.5 裁决）──

export const facingConstraintSchema = z
  .object({
    toCamera: z.enum(["front", "three_quarter", "side", "back"]),
    // 侧向时必填（refine 拦）
    frameDirection: z.enum(["left", "right"]).optional(),
    pairRelation: z.enum(["face_to_face", "same_direction", "back_to_back", "behind"]).optional(),
  })
  .refine((f) => f.toCamera !== "side" || f.frameDirection !== undefined, {
    message: "toCamera 为 side 时 frameDirection 必填",
  });
export type FacingConstraint = z.infer<typeof facingConstraintSchema>;

// ── GenerationParams：镜头级可覆盖项（m1-spec §3.7 裁决，同 §3.2 C 组）──

export const generationParamsSchema = z
  .object({
    durationSec: z.number().int().min(5).max(15).optional(),
    resolution: z.string().optional(),
    fps: z.number().optional(),
    aspect: z.string().optional(),
    seed: z.number().optional(),
    // 0-1
    consistencyStrength: z.number().min(0).max(1).optional(),
    // C-2 两采参数
    steps: z.number().optional(),
    transitionStep: z.number().optional(),
    lowresScale: z.number().optional(),
    useVDN: z.boolean().optional(),
  })
  .strict();
export type GenerationParams = z.infer<typeof generationParamsSchema>;

// ── Shot ──

export const shotSchema = z
  .object({
    id: z.string(),
    index: z.number().int(),
    // D，5-15 整数秒（H3 约束，refine 拦）
    durationSec: z.number().int(),
    // 帧对齐后的实际时长（回显）
    actualDurationSec: z.number().optional(),

    // ── 画面事实 ──
    shotSize: shotSizeSchema,
    cameraMove: cameraMoveSchema,
    facing: facingConstraintSchema,
    // 第 0 秒初始空间位置（从事实重建，不沿用上镜画面）
    initialPosition: z.string(),
    // 画面描述（中文，给人看）
    description: z.string(),

    // ── 提示词（结构化，不是字符串）──
    taskType: taskTypeSchema,
    promptVideo: videoPromptSchema,
    promptImage: imagePromptSetSchema.optional(),
    negativePrompt: z.string(),

    // ── 内容策略 ──
    contentPolicy: contentPolicySchema,
    intensityLevel: intensityLevelSchema.optional(),
    moduleTypes: z.array(moduleTypeSchema).optional(),
    bodyState: z.array(bodyStateGradientSchema).optional(),
    mediaLock: mediaTypeSchema,

    // ── 引用（只有编号，不复述）──
    refCharacters: z.array(z.string()),
    refAssets: z.array(z.string()),
    pictureIndex: z.record(z.string(), z.string()),

    // ── 结果 ──
    params: generationParamsSchema,
    status: shotStatusSchema,
    candidates: z.array(z.string()),
    selectedAssetId: z.string().optional(),
    outputs: z.array(z.string()),
    // 0/1/2，2 = 不许出片
    riskScore: z.number().int().min(0).max(2).optional(),
  })
  .superRefine((shot, ctx) => {
    // durationSec：整数 5-15（H3 约束）
    if (!Number.isInteger(shot.durationSec) || shot.durationSec < 5 || shot.durationSec > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationSec"],
        message: "durationSec 必须是 5-15 的整数（H3 约束）",
      });
    }

    // policy refine：从 nsfw.ts 导入复用（NSFW-P0 命门）
    for (const violation of refineShotPolicy(shot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentPolicy"],
        message: violation,
      });
    }
  });
export type Shot = z.infer<typeof shotSchema>;

// re-export 联合策略字段的输入类型，供调用方做局部校验（不重定义，纯转发）
export type { VideoPrompt, ImagePromptSet, BodyStateGradient };
export type { ShotSize, CameraMove, TaskType, MediaType, ContentPolicy, IntensityLevel, ModuleType, ShotStatus };
