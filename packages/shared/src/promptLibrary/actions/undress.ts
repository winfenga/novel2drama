/**
 * M3-6 · ① 脱衣类（从穿着到全裸的过程）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L342-359（EX01 §八·1），
 * 逐条照录，promptEn 为原文的英文落实（身体部位、方向、幅度逐项写清）。
 */

import type { ActionEntry } from "../index.js";

export const UNDRESS_ACTIONS: ActionEntry[] = [
  {
    id: "undress-001",
    category: "undress",
    name: "解扣",
    promptEn:
      "her fingertips slowly undo the first button of her shirt, then the second, then the third, " +
      "the fabric parting bit by bit to bare her collarbones and chest",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["collarbones", "chest", "hands"],
    notes: "动作→过程→结果：从第一颗扣子逐颗解到布料敞开。",
  },
  {
    id: "undress-002",
    category: "undress",
    name: "拉肩带",
    promptEn:
      "her fingertips hook the strap and slide it slowly down along her shoulder, " +
      "revealing the round curve of her shoulder and her collarbone",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["shoulders", "collarbones", "hands"],
    notes: "指尖轻轻勾住肩带，顺着香肩缓缓往下拉。",
  },
  {
    id: "undress-003",
    category: "undress",
    name: "拉领口",
    promptEn:
      "her fingers hook the edge of the collar and pull it down slowly, " +
      "exposing her collarbones, her cleavage and the upper swell of her chest",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["collarbones", "cleavage", "chest"],
    notes: "指尖勾住衣领边沿，缓缓往下拉。",
  },
  {
    id: "undress-004",
    category: "undress",
    name: "解系带",
    promptEn:
      "reaching behind her back / at her waist / at the collar she finds the ribbon ties, undoes them, " +
      "and the ribbon slips loose and falls away",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["back", "waist", "collar"],
    notes: "反手摸到背后/腰间/领口，解开系带，丝带滑落。",
  },
  {
    id: "undress-005",
    category: "undress",
    name: "褪裙",
    promptEn:
      "she hooks the hem of her skirt and slides it slowly down along her legs, " +
      "the skirt slipping off and pooling at her ankles",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "ankles", "skirt"],
    notes: "裙摆滑落堆在脚踝。",
  },
  {
    id: "undress-006",
    category: "undress",
    name: "脱内裤",
    promptEn:
      "she hooks her fingers into the waistband of her panties and slides them down along her thighs, " +
      "past her knees, her calves, her ankles, finally stepping out of one leg or flicking them off with the tip of her foot to one side, " +
      "revealing her wet pussy",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["thighs", "knees", "ankles", "pussy"],
    notes: "经过膝盖、小腿、脚踝，最后从一只脚脱出或用脚尖勾起甩到一旁。",
  },
  {
    id: "undress-007",
    category: "undress",
    name: "脱丝袜",
    promptEn:
      "she hooks her fingers into the top of her stocking and rolls it slowly down her thigh, her calf, her ankle, " +
      "revealing her bare foot",
    intensityRange: ["L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["thighs", "calves", "ankles", "feet"],
    notes: "顺着大腿、小腿、脚踝缓缓往下卷。",
  },
  {
    id: "undress-008",
    category: "undress",
    name: "脱上衣",
    promptEn:
      "she pulls her top up from the hem and off over her head, or undoes it so it slides off her shoulders, " +
      "revealing her upright breasts",
    intensityRange: ["L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["breasts", "torso", "arms"],
    notes: "掀起脱过头顶或解开扣子从肩头滑落两种写法。",
  },
  {
    id: "undress-009",
    category: "undress",
    name: "褪整件衣物",
    promptEn:
      "she lets the whole garment slide off her body and pool at her feet, completing full nudity",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["whole body"],
    notes: "完成全裸的收束动作。",
  },
  {
    id: "undress-010",
    category: "undress",
    name: "散落细节",
    promptEn:
      "her discarded clothes lie scattered on the floor — the skirt pooled at her feet, " +
      "her panties caught at one ankle, her stockings crumpled in a heap",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["ankles", "floor"],
    notes: "衣物散落在地的状态描述（裙摆在脚边、内裤挂在脚踝、丝袜蜷成一团）。",
  },
];
