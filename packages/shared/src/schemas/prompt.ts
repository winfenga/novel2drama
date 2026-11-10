/**
 * 视频提示词判别联合 + 图提示词（M1-4）。
 *
 * 归属：Block B（entities-2）。依据：m1-spec §3.5 + architecture.md L237-266
 * + h3-prompt-rules §2/§7.1/§7.2。
 *
 * 壳的判据是「有无参考归因段」，不是 task_type 的简单函数：
 *   ref2va / hybrid 必为六段壳；fl2va 虽挂关键帧锚点但无参考归因，走三字段壳。
 * `suggestShell` 只是组装时的建议，不是校验判据（判别联合以 shell 字段为准）。
 */

import { z } from "zod";
import type { TaskType } from "./enums.js";

// ── 六段壳（ref2va / hybrid）──

export const sixSectionShellSchema = z
  .object({
    shell: z.literal("six-section"),
    // 六个正文字段，顺序固定
    subjectDefinitions: z.string(),
    summary: z.string(),
    // retentionAnalysis 的枚举内容校验（fully_preserved 等）是 M4 校验器的活，schema 层只验非空
    retentionAnalysis: z.string().min(1),
    detailedDescription: z.string(),
    overallSoundscape: z.string(),
    nonDiegeticMusic: z.string(),
    // 附加行（不属于六段，位于最末）——必填
    exclusionLine: z.string().min(1),
  })
  // strict：六段壳字段是封闭集合，交叉赋值（three-field 塞六段字段）必须被拒
  // （m1-spec §4 验收用例 8「交叉失败」，主会话 2026-11-10 裁决补 strict）
  .strict();
export type SixSectionShell = z.infer<typeof sixSectionShellSchema>;

// ── 三字段壳（t2va / i2va / l2va / fl2va）──

export const threeFieldShellSchema = z
  .object({
    shell: z.literal("three-field"),
    // i2va 及变体有；t2va 无
    instructionLine: z.string().optional(),
    integratedMultimodalDescription: z.string(),
    overallSoundscape: z.string(),
    nonDiegeticMusic: z.string(),
    // 附加行——必填
    exclusionLine: z.string().min(1),
  })
  // strict：同六段壳，封闭字段集（验收用例 8）
  .strict();
export type ThreeFieldShell = z.infer<typeof threeFieldShellSchema>;

// ── 判别联合 ──

export const videoPromptSchema = z.discriminatedUnion("shell", [
  sixSectionShellSchema,
  threeFieldShellSchema,
]);
export type VideoPrompt = z.infer<typeof videoPromptSchema>;

// ── 图提示词（h3 §7.1 两段式）──

export const imagePromptSetSchema = z
  .object({
    // 单段连续文本
    positive: z.string(),
    // 逗号短语列表
    negative: z.string(),
    // 有值则 ratioFollow 必为 ""（refine 拦，h3 §7.2 互斥规则）
    whRatio: z.string().optional(),
    ratioFollow: z.string().optional(),
  })
  .refine(
    (p) => !(p.whRatio !== undefined && p.whRatio !== "" && p.ratioFollow !== undefined && p.ratioFollow !== ""),
    { message: "whRatio 与 ratioFollow 互斥：whRatio 有值时 ratioFollow 必须缺省或为空串" },
  );
export type ImagePromptSet = z.infer<typeof imagePromptSetSchema>;

// ── suggestShell：组装建议，不是校验判据 ──

/**
 * 按 taskType 给出壳的建议：ref2va / hybrid → six-section，其余 → three-field。
 * 注意：这只是提示词组装时的建议。真正的判据是「有无参考归因段」——
 * fl2va 挂关键帧锚点仍走三字段壳（architecture L264），壳以 VideoPrompt.shell 为准。
 */
export function suggestShell(taskType: TaskType): "six-section" | "three-field" {
  return taskType === "ref2va" || taskType === "hybrid" ? "six-section" : "three-field";
}
