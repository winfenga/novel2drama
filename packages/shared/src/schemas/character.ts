/**
 * M1-5 角色与音色：Character / VoiceProfile
 *
 * 依据：m1-spec §3.4（裁决版）；字段形状权威 architecture.md L270-288 + nsfw-design §13.3。
 * refine：VoiceProfile.defaultEmotion 不许为 "auto"（m1-spec §3.4 + 验收矩阵 #11）。
 */

import { z } from "zod";
import { emotionSchema } from "./enums.js";

// ── 音色绑定（让 agent 不必每次手动背音色表）──
export const voiceProfileSchema = z
  .object({
    /** voices/ 下的文件名（不含扩展名） */
    voiceId: z.string(),
    /** 参考音频绝对路径 */
    refAudioPath: z.string(),
    language: z.enum(["ZH", "EN", "JA", "ES", "AR"]),
    /** "auto" 不许做默认值 —— refine 拦 */
    defaultEmotion: emotionSchema,
    durationFactor: z.number(),
    createdAt: z.number(),
  })
  .refine((v) => v.defaultEmotion !== "auto", { error: 'VoiceProfile.defaultEmotion 不允许为 "auto"' });
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

// ── 角色 ──
export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  gender: z.string().optional(),
  age: z.string().optional(),
  appearance: z.string().optional(),
  outfit: z.string().optional(),
  personality: z.string().optional(),
  /** 定妆照 */
  portraitAssetId: z.string().optional(),
  voiceProfile: voiceProfileSchema.optional(),
  /** 角色一致性锚点 */
  consistencySeed: z.number().optional(),
  /**
   * NSFW 属性占位（nsfw-design §13.3 扩展；M2 合规闸门要用）。
   * 写作侧属性（敏感点/性癖等）属 M13，M1 只占位这两项（m1-spec D16）。
   */
  nsfwProfile: z
    .object({
      /** 外形负面约束（writing-conventions §5） */
      appearanceConstraints: z.array(z.string()),
      voiceStyle: z.string().optional(),
    })
    .optional(),
});
export type Character = z.infer<typeof characterSchema>;
