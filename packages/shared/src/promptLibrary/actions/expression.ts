/**
 * M3-6 · ⑥ 神情类（表情与眼神的渐变）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L431-441（EX01 §八·6），逐条照录。
 * 按情绪阶梯组织，最后一条「渐变过程」是神情库核心（状态转移链，不是孤立表情）。
 * 神情类要渐变（与实演类的禁渐变互为补充，两者不在同一句话里混写）。
 * 属 SFW 安全子集（SFW_SAFE_CATEGORIES）之一。
 */

import type { ActionEntry } from "../index.js";

export const EXPRESSION_ACTIONS: ActionEntry[] = [
  {
    id: "expression-001",
    category: "expression",
    name: "清纯",
    promptEn:
      "her eyes clear and innocent, eyelids lowered shyly, a demure and well-behaved expression",
    intensityRange: ["L0", "L1", "L2"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "eyelids"],
    notes: "情绪阶梯起点。SFW 可用。",
  },
  {
    id: "expression-002",
    category: "expression",
    name: "迷离",
    promptEn:
      "her gaze gradually turning hazy and distant, eyes half-open half-closed, veiled in a thin mist",
    intensityRange: ["L1", "L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes"],
    notes: "渐变中段。SFW 可用。",
  },
  {
    id: "expression-003",
    category: "expression",
    name: "淫媚",
    promptEn:
      "seductive eyes like silk threads, gaze both alluring and wild, a bewitching curl at the corner of her mouth",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "mouth"],
    notes: "媚眼如丝。",
  },
  {
    id: "expression-004",
    category: "expression",
    name: "挑衅",
    promptEn:
      "her eyes carrying a teasing, provocative playfulness, a meaningful smile floating at the corner of her lips",
    intensityRange: ["L1", "L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "mouth"],
    notes: "意味深长的笑。SFW 可用。",
  },
  {
    id: "expression-005",
    category: "expression",
    name: "饥渴",
    promptEn:
      "her eyes brimming with wet, hungry desire, breathing growing heavier, eager and impatient",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "breathing"],
    notes: "急切。",
  },
  {
    id: "expression-006",
    category: "expression",
    name: "乖巧",
    promptEn:
      "she gazes at the camera obediently, a solicitous smile, devotion in her eyes",
    intensityRange: ["L0", "L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "mouth"],
    notes: "讨好的笑意、虔诚。SFW 可用。",
  },
  {
    id: "expression-007",
    category: "expression",
    name: "高潮感",
    promptEn:
      "gaze blurred and unfocused, cheeks flushed, lips slightly parted, lashes trembling, tears welling in her eyes",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "cheeks", "lips", "lashes"],
    notes: "脸颊潮红按「脸红定位式」写：耳尖→耳根→后颈，有顺序（nsfw-design §8.4）。",
  },
  {
    id: "expression-008",
    category: "expression",
    name: "失神",
    promptEn:
      "the dazed aftermath of climax — pupils dilated, gaze vacant and empty, " +
      "the lingering afterglow still hanging at the corner of her mouth",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "mouth"],
    notes: "高潮后的失神状态。",
  },
  {
    id: "expression-009",
    category: "expression",
    name: "渐变过程",
    promptEn:
      "her gaze stains from innocent to hazy with desire little by little, turning bewitching and seductive, " +
      "until finally her silk-threaded eyes lock onto the camera, pupils dilating slightly with lust",
    intensityRange: ["L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "pupils"],
    notes: "神情库的核心：清纯→迷离→淫媚的状态转移链，不是孤立表情。",
  },
];
