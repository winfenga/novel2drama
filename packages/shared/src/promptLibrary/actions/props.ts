/**
 * M3-6 · ⑦ 道具类（图片中道具的使用）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L443-459（EX01 §八·7），逐条照录。
 * 每条是「初始持有 → 动作 → 用途」的三段式（如书：原本捧着 → 合上放到一旁 → 开始脱衣）。
 */

import type { ActionEntry } from "../index.js";

export const PROPS_ACTIONS: ActionEntry[] = [
  {
    id: "props-001",
    category: "props",
    name: "书",
    promptEn:
      "originally holding a book — she closes it and sets it aside, then begins to undress and touch herself",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "book"],
    notes: "三段式：捧着→合上放到一旁→开始脱衣自慰。",
  },
  {
    id: "props-002",
    category: "props",
    name: "手机",
    promptEn:
      "originally taking a selfie — she lowers the phone, turns to face the camera, and begins to undress",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "phone"],
    notes: "放下手机→转身面对镜头→开始脱衣。",
  },
  {
    id: "props-003",
    category: "props",
    name: "耳机",
    promptEn:
      "she takes off her headphones and hangs them around her neck, then begins to tease",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["neck", "hands", "headphones"],
    notes: "摘下挂在颈间。",
  },
  {
    id: "props-004",
    category: "props",
    name: "项链",
    promptEn:
      "she takes off her necklace and lays it aside, then begins to undress",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["neck", "hands", "necklace"],
    notes: "「摘掉」的仪式性动作，开启脱衣。",
  },
  {
    id: "props-005",
    category: "props",
    name: "花束",
    promptEn:
      "originally holding a bouquet — she lets go and lets the flowers fall, then begins to seduce",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "bouquet"],
    notes: "松开手让花落下。",
  },
  {
    id: "props-006",
    category: "props",
    name: "choker/项圈",
    promptEn:
      "her fingertips hook the choker and pull it up gently, or catch on its metal fastener",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["neck", "fingers", "choker"],
    notes: "轻轻拉起、勾住金属扣件。",
  },
  {
    id: "props-007",
    category: "props",
    name: "尾巴",
    promptEn:
      "reaching behind she pulls out the tail (as if withdrawing an anal plug), holds it up before her eyes and sways it, " +
      "brings it to her lips for a light kiss, then slowly inserts it back",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["buttocks", "hands", "tail", "lips"],
    notes: "模拟肛塞拔出→举到眼前晃动→轻吻→塞回，四段。",
  },
  {
    id: "props-008",
    category: "props",
    name: "丝袜",
    promptEn:
      "the removed stocking can be hooked on a toe and flicked, twirled, or crumpled into a ball and brought to her nose for a soft sniff",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["feet", "hands", "stockings"],
    notes: "勾起、甩动、揉成一团凑到鼻尖轻嗅。",
  },
  {
    id: "props-009",
    category: "props",
    name: "铃铛",
    promptEn:
      "a small bell rings crisply with each of her movements, adding a sound element to the scene",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["bell"],
    notes: "增加声音元素，落点 overall_soundscape。",
  },
  {
    id: "props-010",
    category: "props",
    name: "项链/手表",
    promptEn:
      "necklace or watch removed as a ritual gesture that opens the strip-tease",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["neck", "wrists", "hands"],
    notes: "与 props-004 合并语义，保留仪式性动作口径。",
  },
  {
    id: "props-011",
    category: "props",
    name: "扇子/伞",
    promptEn:
      "classical-style prop — a fan or umbrella half-covering her face, slowly lowered to reveal it",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "illustration"],
    bodyParts: ["face", "hands", "fan"],
    notes: "古风道具，半遮面、缓缓放下露出脸。",
  },
  {
    id: "props-012",
    category: "props",
    name: "按摩棒/假阳具",
    promptEn:
      "taken out of its packaging or a drawer, held up to show the camera, then slowly lowered between her legs",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "toy", "crotch"],
    notes: "展示→送向腿间。",
  },
  {
    id: "props-013",
    category: "props",
    name: "润滑液",
    promptEn:
      "clear lubricant squeezed out and spread over her fingers, her cleavage or between her legs, " +
      "the liquid stringing and glistening",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "cleavage", "crotch"],
    notes: "液体拉丝泛光。",
  },
  {
    id: "props-014",
    category: "props",
    name: "冰棒/棒棒糖",
    promptEn:
      "taken into her mouth, licked and bobbed in a motion mimicking fellatio, syrup running down from the corner of her mouth",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["mouth", "lips", "tongue"],
    notes: "模拟口交动作，糖水顺着嘴角流下。",
  },
  {
    id: "props-015",
    category: "props",
    name: "镜子",
    promptEn:
      "facing a mirror she admires her own naked body, fingertips gliding across the glass, " +
      "meeting her own reflected gaze",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["whole body", "fingers", "eyes"],
    notes: "与镜中的自己对视。",
  },
];
