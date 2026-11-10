/**
 * M3-6 · ⑤ 互动类（与镜头/观众的互动）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L414-429（EX01 §八·5），逐条照录。
 * 属 SFW 安全子集（SFW_SAFE_CATEGORIES）之一。
 */

import type { ActionEntry } from "../index.js";

export const INTERACT_ACTIONS: ActionEntry[] = [
  {
    id: "interact-001",
    category: "interact",
    name: "抛媚眼",
    promptEn:
      "tilting her head, she throws a seductive glance at the camera, her gaze lingering and inviting",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes", "head"],
    notes: "眼神勾人。SFW 可用。",
  },
  {
    id: "interact-002",
    category: "interact",
    name: "勾手指",
    promptEn:
      "she lifts her index finger and beckons toward the camera with a slow curl, inviting closer",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["hands", "fingers"],
    notes: "SFW 可用。",
  },
  {
    id: "interact-003",
    category: "interact",
    name: "咬唇",
    promptEn:
      "she bites gently on her lower lip, her gaze caught between refusal and invitation",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["lips", "eyes"],
    notes: "欲拒还迎。SFW 可用。",
  },
  {
    id: "interact-004",
    category: "interact",
    name: "舔唇",
    promptEn:
      "the tip of her tongue slides slowly across her lower lip or the corner of her mouth, wetting her lips",
    intensityRange: ["L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["tongue", "lips"],
    notes: "湿润唇瓣。L1 起可用。",
  },
  {
    id: "interact-005",
    category: "interact",
    name: "眨眼",
    promptEn:
      "she winks softly at the camera — playful and alluring at once",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["eyes"],
    notes: "俏皮又勾人。SFW 可用。",
  },
  {
    id: "interact-006",
    category: "interact",
    name: "凑近镜头",
    promptEn:
      "she leans slowly toward the camera, her face / chest / crotch drifting closer to the lens",
    intensityRange: ["L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["face", "chest", "crotch"],
    notes: "逼近部位按当前档位选择。",
  },
  {
    id: "interact-007",
    category: "interact",
    name: "膝行",
    promptEn:
      "she crawls on her knees toward the camera, gaze locked on the lens, knees parting as she moves, " +
      "her crotch coming into view and hidden again with each advance",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["knees", "eyes", "pussy"],
    notes: "眼神始终锁着镜头，私处若隐若现。",
  },
  {
    id: "interact-008",
    category: "interact",
    name: "回眸",
    promptEn:
      "with her back to the camera she turns her head slowly, glancing back over her shoulder with a seductive look",
    intensityRange: ["L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["head", "eyes"],
    notes: "注意与 Facing 规则联动：转身必须写进同一句。",
  },
  {
    id: "interact-009",
    category: "interact",
    name: "歪头",
    promptEn:
      "she tilts her head slightly, paired with her gaze — playful or seductive depending on the expression",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["head", "eyes"],
    notes: "SFW 可用。",
  },
  {
    id: "interact-010",
    category: "interact",
    name: "指着身体",
    promptEn:
      "her fingertips trace the curves of her own body, guiding the camera's gaze " +
      "(down her neck to her collarbones, from her nipple to her waistline, along her inner thigh to her crotch)",
    intensityRange: ["L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["neck", "collarbones", "nipples", "waist", "thighs", "crotch"],
    notes: "引导路径三选一按档位写。",
  },
  {
    id: "interact-011",
    category: "interact",
    name: "拉腿展示",
    promptEn:
      "lying down or sitting, she hugs one leg at the back of the knee and pulls it wide open, " +
      "presenting her crotch fully to the camera while her other hand traces slow circles near her inner thigh",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "knees", "crotch", "hands"],
    notes: "另一只手在腿根处缓缓画圈。",
  },
  {
    id: "interact-012",
    category: "interact",
    name: "轻吻",
    promptEn:
      "she presses a light kiss on a prop (such as a tail or her fingertip) held to her lips",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["lips", "prop"],
    notes: "道具如尾巴、手指。",
  },
  {
    id: "interact-013",
    category: "interact",
    name: "双手托腮",
    promptEn:
      "she rests her chin in both hands, gazing at the camera with an innocent yet alluring look",
    intensityRange: ["L0", "L1", "L2"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["face", "hands"],
    notes: "乖巧地托腮。SFW 可用。",
  },
  {
    id: "interact-014",
    category: "interact",
    name: "吐舌比耶",
    promptEn:
      "in a crouch with legs apart, she raises both hands beside her face in a peace sign, " +
      "tongue sticking out playfully",
    intensityRange: ["L0", "L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["tongue", "hands", "face"],
    notes: "俏皮手势。SFW 可用。",
  },
];
