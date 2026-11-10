/**
 * M3-6 · ② 展示类（主动把裸体呈现给镜头）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L361-375（EX01 §八·2），
 * 逐条照录（露乳、挤乳沟、揉乳、捏乳尖、露背、露腰、露腿、露足、露臀、掀裙、M腿打开、掰开、全裸展示）。
 */

import type { ActionEntry } from "../index.js";

export const DISPLAY_ACTIONS: ActionEntry[] = [
  {
    id: "display-001",
    category: "display",
    name: "露乳",
    promptEn:
      "she arches her chest forward and cups both breasts with her hands, presenting them to the camera, " +
      "her nipples standing erect",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["breasts", "nipples", "hands"],
    notes: "挺起胸膛，双手托起乳房向镜头展示。",
  },
  {
    id: "display-002",
    category: "display",
    name: "挤乳沟",
    promptEn:
      "her hands cup her breasts from both sides and slowly press them toward each other, " +
      "the cleavage deepening as her nipples draw close together",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["breasts", "cleavage", "nipples", "hands"],
    notes: "双手从两侧托起乳房，缓缓向中间挤压。",
  },
  {
    id: "display-003",
    category: "display",
    name: "揉乳",
    promptEn:
      "her hands grip her breasts, kneading and squeezing them, the soft flesh overflowing between her fingers, " +
      "the nipples stiffening erect against her palms",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["breasts", "nipples", "hands"],
    notes: "乳肉从指缝间溢出，乳尖在掌心挺立变硬。",
  },
  {
    id: "display-004",
    category: "display",
    name: "捏乳尖",
    promptEn:
      "her thumb and forefinger pinch each nipple, rolling and tugging gently; " +
      "the nipples engorge and stiffen, and she lets out a soft moan",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["nipples", "breasts", "hands"],
    notes: "拇指与食指捻住乳尖轻轻揉搓、拉扯，她发出轻哼。",
  },
  {
    id: "display-005",
    category: "display",
    name: "露背/露肩",
    promptEn:
      "she turns around or pulls her clothing down, revealing the smooth line of her back or the round curve of her shoulder",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["back", "shoulders"],
    notes: "转身或拉下衣物两种写法。",
  },
  {
    id: "display-006",
    category: "display",
    name: "露腰/露腹",
    promptEn:
      "she lifts her top or pulls her clothing lower, baring her flat stomach and the curve of her waist",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["waist", "abdomen"],
    notes: "露出平坦的小腹与腰肢曲线。",
  },
  {
    id: "display-007",
    category: "display",
    name: "露腿",
    promptEn:
      "she lifts her skirt or slides her clothing off, revealing her long, slender thighs",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["thighs", "legs"],
    notes: "掀起裙摆或褪下衣物。",
  },
  {
    id: "display-008",
    category: "display",
    name: "露足",
    promptEn:
      "she lifts one foot, presenting her bare foot, her toes curling and stretching, " +
      "the arch of her foot tensing into a graceful curve",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["feet", "toes", "ankles"],
    notes: "脚趾舒展蜷缩，足弓绷出弧度。",
  },
  {
    id: "display-009",
    category: "display",
    name: "露臀",
    promptEn:
      "she turns her back to the camera, bends forward pushing her hips up, " +
      "and pulls her buttocks apart with both hands, exposing her asshole and the wet folds of her pussy from behind",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["buttocks", "anus", "pussy"],
    notes: "俯身撅臀，双手掰开臀瓣。",
  },
  {
    id: "display-010",
    category: "display",
    name: "掀裙",
    promptEn:
      "her fingertips hook the hem of her skirt and lift it up slowly, " +
      "revealing her thighs and her panties — or nothing underneath at all",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["thighs", "panties", "skirt"],
    notes: "露出大腿与内裤（或里面什么都没穿）。",
  },
  {
    id: "display-011",
    category: "display",
    name: "M 腿打开",
    promptEn:
      "she sits or lies down and raises her legs, knees bending open into an M shape, " +
      "her hands hooking the backs of her knees from inside and pulling them wide apart, " +
      "presenting her wet pussy fully to the camera",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["pussy", "legs", "knees", "hands"],
    notes: "双手从内侧勾住膝弯向外拉开，把湿润的私处完全呈现给镜头。",
  },
  {
    id: "display-012",
    category: "display",
    name: "掰开",
    promptEn:
      "lying down or crouching, she spreads her labia apart with both hands, " +
      "revealing the glistening, wet interior, inviting the camera to look",
    intensityRange: ["L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["labia", "pussy", "hands"],
    notes: "露出湿润泛光的内部，邀请镜头观看。",
  },
  {
    id: "display-013",
    category: "display",
    name: "全裸展示",
    promptEn:
      "fully naked, she stands / kneels / lies with her limbs naturally relaxed, " +
      "presenting every part of her body to the camera without covering anything",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["whole body"],
    notes: "四肢自然舒展，不遮挡。",
  },
];
