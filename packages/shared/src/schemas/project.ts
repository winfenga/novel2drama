/**
 * M1-1 项目层实体：Project / SourceUnit / Episode / Scene / ProjectSettings + sniffSourceKind()
 *
 * 依据：m1-spec §3.2（裁决版）；字段形状权威 architecture.md §3 L116-169。
 * ProjectSettings 按 m1-spec §3.2 ⚖️ 裁决：只收程序要读的字段（§6.2.2 A/B/D 三组），UI-only 参数不进数据模型。
 *
 * 跨块引用边界（m1-spec §2「A 与 B 互不 import 对方的文件」）：
 * - dialogue.ts / character.ts 同属 A，直接 import。
 * - Scene.shots（Shot，B 块 shot.ts）与 Project.assets（Asset，C 块 asset.ts）不在 A 的可 import 范围内，
 *   schema 层以 `z.array(z.unknown())` 占位并导出字段名——精确元素 schema 由 B/C 在各自文件落地后，
 *   于 M1-8 收口时替换为真实 schema 引用（roundtrip 全图校验兜底）。此处不是发明新契约，是 spec 自身的并行边界。
 */

import { z } from "zod";
import { sourceKindSchema, episodeStatusSchema } from "./enums.js";
import type { SourceKind } from "./enums.js";
import { dialogueLineSchema } from "./dialogue.js";
import { characterSchema } from "./character.js";
import { shotSchema } from "./shot.js";
import { assetSchema } from "./asset.js";

// ── 源文本单元 ──
export const sourceUnitSchema = z.object({
  index: z.number(),
  title: z.string(),
  /** 源文本字符区间 [start, end] */
  range: z.tuple([z.number(), z.number()]),
  /** true = 按字数硬切出来的，不是自然单元 */
  synthetic: z.boolean(),
});
export type SourceUnit = z.infer<typeof sourceUnitSchema>;

// ── 源文本 ──
export const sourceTextSchema = z.object({
  fileName: z.string().optional(),
  text: z.string(),
  encoding: z.enum(["utf-8", "gbk"]),
  charCount: z.number(),
  /** 用户指定或嗅探结果 */
  sourceKind: sourceKindSchema,
  /** 嗅探出来的，可能与用户指定不同（供 GUI 提示） */
  detectedKind: sourceKindSchema.optional(),
  units: z.array(sourceUnitSchema),
});
export type SourceText = z.infer<typeof sourceTextSchema>;

// ── 项目设置（m1-spec §3.2 裁决结构，D15）──
export const projectSettingsSchema = z.object({
  // A 剧本（architecture L1001-1009）
  episodeCount: z.number().optional(),
  episodeDurationSec: z.number().default(90),
  /** enum 值文档没定全，先放宽 string，M3 再收紧（D15） */
  genre: z.string().optional(),
  tone: z.string().optional(),
  /** 0-1，默认 0.4 */
  dialogueRatio: z.number().min(0).max(1).default(0.4),
  language: z.string().default("zh"),
  // B 分镜（architecture L1011-1018）
  /** D，5-15 整数 */
  globalSegDurationSec: z.number().int().min(5).max(15),
  perShotOverride: z.record(z.string(), z.number()),
  shotSizeBias: z.enum(["balanced", "closeup", "wide"]),
  cameraStyle: z.enum(["cinematic", "viral", "documentary"]),
  allowSlowMotion: z.boolean(),
  // C 生成（architecture L1059-1081，项目级默认值；镜头级覆盖在 GenerationParams）
  resolution: z.string().default("1080x1920"),
  /** 24 | 30 */
  fps: z.number().refine((v) => v === 24 || v === 30, { error: "fps 只允许 24 或 30" }),
  aspect: z.string().default("9:16"),
  useVDN: z.boolean(),
  imageWorkflow: z.string().default("qwen21:t2i"),
  /** 0 = 不限 */
  llmTokenBudget: z.number(),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

// ── 分集 ──
export const episodeSchema = z.object({
  id: z.string(),
  index: z.number(),
  title: z.string(),
  /** 集纲 */
  summary: z.string(),
  /** 源文本字符区间 */
  sourceRange: z.tuple([z.number(), z.number()]),
  scenes: z.array(z.unknown()),
  status: episodeStatusSchema,
});
export type Episode = z.infer<typeof episodeSchema>;

// ── 场 ──
export const sceneSchema = z.object({
  id: z.string(),
  index: z.number(),
  location: z.string(),
  timeOfDay: z.string(),
  /** characterId 列表 */
  characters: z.array(z.string()),
  /** 动作描述 */
  action: z.string(),
  /** 台词挂在场级，用 shotId 关联到具体镜头 */
  dialogue: z.array(dialogueLineSchema),
  /** Shot（B 块 shot.ts）；A/B 互不 import，见文件头说明 */
  shots: z.array(shotSchema),
});
export type Scene = z.infer<typeof sceneSchema>;

// ── 项目 ──
export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: sourceTextSchema,
  settings: projectSettingsSchema,
  episodes: z.array(episodeSchema),
  characters: z.array(characterSchema),
  /** Asset（C 块 asset.ts）；A 不 import C，见文件头说明 */
  assets: z.array(assetSchema),
  llmUsage: z.object({
    tokensIn: z.number(),
    tokensOut: z.number(),
    budget: z.number(),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

// ── sniffSourceKind ──
// m1-spec §3.2 ⚖️ 裁决实现；连同正则一起导出，M1-1 测试覆盖每条分支。

/** 章节体：第X章/卷/回 */
export const NOVEL_RE = /(第[一二三四五六七八九十百千0-9]+[章卷回])/;
/** 剧本体：行首 场景/场次/INT./EXT./内景/外景 */
export const SCRIPT_RE = /^(场景|场次|INT\.|EXT\.|内景|外景)/m;
/** 条目体：行首 第X条 / "1. " / "1、 " */
export const OUTLINE_RE = /^(第[一二三四五六七八九十百千0-9]+条|[0-9]+[.、]\s)/m;

/**
 * 源文本类型嗅探（纯函数）。
 *
 * 分支顺序（m1-spec §3.2 ⚖️ 裁决）：
 * 1. 有章节标记 → novel
 * 2. 行首场景/场次标记 → script
 * 3. 行首条目标记（且此时必无章节标记，因分支 1 已返回）→ outline
 * 4. 以上都不中：平均段长 < 200 字 → story；否则 → other
 *
 * `news` 不自动嗅探（只在用户显式指定时出现）。
 */
export function sniffSourceKind(text: string): SourceKind {
  if (NOVEL_RE.test(text)) return "novel";
  if (SCRIPT_RE.test(text)) return "script";
  if (OUTLINE_RE.test(text)) return "outline";

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const totalLen = paragraphs.reduce((acc, p) => acc + p.trim().length, 0);
  const avgLen = paragraphs.length > 0 ? totalLen / paragraphs.length : 0;
  return avgLen < 200 ? "story" : "other";
}
