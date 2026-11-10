/**
 * M3-6 · 提示词动作库（promptLibrary）统一导出与检索。
 *
 * 依据：docs/m35-spec.md §2.5（D2=全结构化裁决）。
 * 内容来源：docs/excerpts/01_nsfw-template_全文.md L336-507（8 类动作库原文，
 * 逐条录入不缩写）；anatomy/negativeWords 来自 EX02 §9。
 *
 * 设计要点：
 * - 纯数据目录：只有常量与纯函数，无 IO、无网络。
 * - IntensityLevel / MediaType 直接复用 M1 的 schemas/enums.ts（不重复定义），
 *   通过本目录的 re-export 保持 promptLibrary 自洽导入路径。
 * - queryActions 零命中返回空数组是合法语义（调用方决定报错，库本身不抛）——
 *   m35-spec 总红线「不静默降级」不适用于检索：检索是过滤，不是拼装。
 * - SFW 安全子集：R1 风险对策的最小集（链路先通）。
 */

import type { IntensityLevel, MediaType } from "../schemas/enums.js";

// ── 类目与条目形状 ──

export type ActionCategory =
  | "undress"
  | "display"
  | "pose"
  | "perform"
  | "interact"
  | "expression"
  | "props"
  | "sound";

export interface ActionEntry {
  id: string;
  category: ActionCategory;
  /** 中文短名（EX01 原条目名，保留中文） */
  name: string;
  /** 英文 prompt 素材（EX01 原文逐条照录，不缩写、不改写） */
  promptEn: string;
  /** 适用强度档（按内容判断标注） */
  intensityRange: readonly IntensityLevel[];
  /** 适用介质 */
  mediaFit: readonly MediaType[];
  /** 涉及部位（检索用） */
  bodyParts: readonly string[];
  /** 原条目的技法备注（如「半裸比全裸更勾人」） */
  notes?: string;
}

// ── SFW 安全子集（R1 风险对策）──

export const SFW_SAFE_CATEGORIES = ["pose", "interact", "expression"] as const;
export type SfwSafeCategory = (typeof SFW_SAFE_CATEGORIES)[number];

// ── 类级常量（spec §2.5 录入纪律 3/4）──

/**
 * 实演类节奏总则（EX01 L395，覆盖全局惯性）。
 * 产出英文实演动作时必须带中速节奏词，禁慢禁快禁渐变。
 */
export const PERFORM_RHYTHM_RULES = {
  /** 英文节奏词白名单 */
  allowedPhrases: [
    "a steady, even rhythm",
    "a moderate, rhythmic tempo",
    "continuous rhythmic motions",
  ],
  /** 禁用的慢速词 */
  bannedSlowWords: ["slowly", "gently", "lingering"],
  /** 避免的快速词 */
  bannedFastWords: ["rapid", "fast", "furious"],
  /** 中文总则 */
  summary:
    "实演类是有节奏的重复运动——默认中速、节奏分明、连续稳定，从动作第一帧就进入节奏，贯穿所在时间段全程。" +
    "一禁慵懒拖长的慢动作（H3 天然倾向舒缓慢镜，节奏词不写就会被拉慢），二禁密集急促的快速抽动（用力过猛会变成机械抖动），" +
    "也禁止「由慢到快」的渐变结构（渐变是神情类的写法，不是动作节奏的写法）。",
} as const;

/**
 * 通用脱衣技法三条（EX01 L355-359，不绑定具体服装，可与任意条目组合）。
 * 作为独立导出：调用方可把这三条与任意脱衣/实演条目组合使用。
 */
export const GENERIC_TECHNIQUES: readonly ActionEntry[] = [
  {
    id: "generic-001",
    category: "undress",
    name: "半挂中间态",
    promptEn:
      "garments pulled halfway off and left hanging — off one shoulder, bunched at the waist, or caught at the ankle — " +
      "holding that half-undressed state instead of rushing to full nudity; half-naked is more alluring than fully naked",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["shoulders", "waist", "ankles"],
    notes: "半挂中间态：衣物褪到一半挂在手臂、腰间或脚踝，维持半脱状态，不急着脱光——半裸比全裸更勾人。",
  },
  {
    id: "generic-002",
    category: "undress",
    name: "隔布触摸",
    promptEn:
      "a hand slips inside her clothing, kneading her nipple or pressing against her crotch through the fabric; " +
      "the cloth is gradually soaked through with her fluids and clings to the shape beneath it",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["breasts", "crotch", "fabric"],
    notes: "隔布触摸：手掌滑入衣服内侧，隔着布料揉捏乳尖或按压私处，布料逐渐被体液浸湿、贴出轮廓。",
  },
  {
    id: "generic-003",
    category: "perform",
    name: "高潮爆发",
    promptEn:
      "at the climax beat, replace every lingering 'slowly' with 'suddenly' — suddenly yanked open, suddenly pulled down — " +
      "adding explosive force to the motion at the peak of the arc",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "高潮爆发：高潮段把「缓缓」替换为「突然」（突然扯开、突然掀落），增加动作爆发力。",
  },
];

// ── 八类聚合 ──

import { UNDRESS_ACTIONS } from "./actions/undress.js";
import { DISPLAY_ACTIONS } from "./actions/display.js";
import { POSE_ACTIONS } from "./actions/pose.js";
import { PERFORM_ACTIONS } from "./actions/perform.js";
import { INTERACT_ACTIONS } from "./actions/interact.js";
import { EXPRESSION_ACTIONS } from "./actions/expression.js";
import { PROPS_ACTIONS } from "./actions/props.js";
import { SOUND_ACTIONS } from "./actions/sound.js";

export const ALL_ACTIONS: readonly ActionEntry[] = [
  ...UNDRESS_ACTIONS,
  ...DISPLAY_ACTIONS,
  ...POSE_ACTIONS,
  ...PERFORM_ACTIONS,
  ...INTERACT_ACTIONS,
  ...EXPRESSION_ACTIONS,
  ...PROPS_ACTIONS,
  ...SOUND_ACTIONS,
];

// ── 检索 ──

export interface ActionQuery {
  category?: ActionCategory;
  atLevel?: IntensityLevel;
  media?: MediaType;
  bodyPart?: string;
}

/**
 * 按类目/强度/介质/部位过滤动作库。
 * 全部条件 AND 组合；零命中返回空数组（合法语义，调用方决定报错策略）。
 * bodyPart 大小写不敏感的子串匹配（检索词可能是 "breast" 命中 "breasts"）。
 */
export function queryActions(filter: ActionQuery): ActionEntry[] {
  return ALL_ACTIONS.filter((a) => {
    if (filter.category !== undefined && a.category !== filter.category) return false;
    if (filter.atLevel !== undefined && !a.intensityRange.includes(filter.atLevel)) return false;
    if (filter.media !== undefined && !a.mediaFit.includes(filter.media)) return false;
    if (filter.bodyPart !== undefined) {
      const needle = filter.bodyPart.toLowerCase();
      const hit = a.bodyParts.some((p) => p.toLowerCase().includes(needle));
      if (!hit) return false;
    }
    return true;
  });
}
