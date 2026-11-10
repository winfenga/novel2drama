/**
 * M1-2 台词实体：DialogueLine / CharTiming
 *
 * 依据：m1-spec §3.3（裁决版）；字段形状权威 architecture.md L172-184 + decision-log §6.2/§6B。
 * refine：strength ∈ [0,1]、durationFactor ∈ [0.5,2.0]、actualSec > 0、
 *         globalEndSec >= globalStartSec、charTimings 内 endSec >= startSec 且按 startSec 升序。
 *
 * spec 未给 strength 默认值、「emotion="auto" 时 strength 可省」为运行时语义，
 * schema 层 strength 必填（0-1）；「可省」由调用方在 emotion==="auto" 时自行传 0，
 * 不在 schema 层做条件省略——m1-spec 未裁此分支，不自行发明（记入日志）。
 */

import { z } from "zod";
import { emotionSchema, type Emotion } from "./enums.js";

// ── ASR 逐字时间戳（decision-log §6B）──
export const charTimingSchema = z.object({
  char: z.string(),
  startSec: z.number(),
  endSec: z.number(),
});
export type CharTiming = z.infer<typeof charTimingSchema>;

// ── 台词（配音的最小单位）──
export const dialogueLineSchema = z
  .object({
    /** 全局唯一，配音产物按这个 id 存 */
    id: z.string(),
    index: z.number(),
    /** characterId */
    speakerId: z.string(),
    text: z.string(),
    emotion: emotionSchema,
    /** 0-1 */
    strength: z.number().min(0).max(1),
    /** 0.5-2.0 */
    durationFactor: z.number().min(0.5).max(2.0),
    /** 落在哪个镜头；undefined = 尚未分配到镜头 */
    shotId: z.string().optional(),
    /** 配音产物 */
    audioAssetId: z.string().optional(),
    /** TTS 实测时长（算帧数用这个，不是估算） */
    actualSec: z.number().positive().optional(),
    /** 改过 text/emotion 后置 true，提示需重配 */
    audioStale: z.boolean().optional(),
    /** 全集绝对时间轴（execution-plan M10-1 前置，ARCH L1104） */
    globalStartSec: z.number().optional(),
    globalEndSec: z.number().optional(),
    /** ASR 逐字时间戳 */
    charTimings: z.array(charTimingSchema).optional(),
  })
  .refine((v) => v.globalEndSec === undefined || v.globalStartSec === undefined || v.globalEndSec >= v.globalStartSec, {
    error: "globalEndSec 必须 >= globalStartSec",
  })
  .refine(
    (v) =>
      v.charTimings === undefined ||
      v.charTimings.every((t, i) => t.endSec >= t.startSec && (i === 0 || t.startSec >= (v.charTimings?.[i - 1]?.startSec ?? 0))),
    { error: "charTimings 内 endSec >= startSec 且须按 startSec 升序" },
  );

export type DialogueLine = z.infer<typeof dialogueLineSchema>;

/** emotion 是否为显式情绪（非 auto）——运行时判据，schema 层不拦（m1-spec 未裁 auto 时 strength 省略的 schema 行为） */
export function hasExplicitEmotion(emotion: Emotion): boolean {
  return emotion !== "auto";
}
