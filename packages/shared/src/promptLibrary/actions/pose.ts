/**
 * M3-6 · ③ 姿态类（全身诱惑姿态，单人可完成）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L377-391（EX01 §八·3）。
 * 准入门槛：全部为零柔韧门槛的日常诱惑姿态；凡需要舞蹈/体操功底、
 * 需要他人托举的姿态一律不在本类。用途：时间段落点 / 定格姿态 / 位移模式的终点状态。
 */

import type { ActionEntry } from "../index.js";

export const POSE_ACTIONS: ActionEntry[] = [
  {
    id: "pose-001",
    category: "pose",
    name: "侧卧扭臀（背向）",
    promptEn:
      "lying on her side with her back to the camera, lower leg extended, upper leg bent and raised, " +
      "pelvis tilted up and back, torso gently twisted, her hip curve presented in full to the camera",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["buttocks", "hips", "legs", "torso"],
    notes: "零柔韧门槛，可作定格姿态。",
  },
  {
    id: "pose-002",
    category: "pose",
    name: "侧卧抬腿",
    promptEn:
      "lying on her side, lower knee bent and planted, upper leg extended and slowly raised, " +
      "the leg line unfolding completely in the lift, torso leaning slightly back, her crotch facing the camera",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "torso", "pussy"],
    notes: "腿部线条在抬起中完全展开。",
  },
  {
    id: "pose-003",
    category: "pose",
    name: "仰卧抱膝单腿上抬",
    promptEn:
      "lying on her back, one knee drawn up to her chest and hugged by her arms, the other leg extended flat on the ground, " +
      "pelvis tilting gently toward the raised leg, presenting her inner thighs and crotch to the camera",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "arms", "pelvis", "pussy"],
    notes: "腿根与私处展示给镜头。",
  },
  {
    id: "pose-004",
    category: "pose",
    name: "俯卧抬腿",
    promptEn:
      "lying prone, her calves raised upward with ankles crossed and swaying gently, toes pointed, " +
      "glancing back at the camera over her shoulder — playful and alluring",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "ankles", "feet", "head"],
    notes: "配合回望镜头，俏皮又勾人。",
  },
  {
    id: "pose-005",
    category: "pose",
    name: "俯卧撑起后仰",
    promptEn:
      "lying prone, she pushes her upper body up on both arms, waist sinking down, " +
      "her back arching into a curve, head tilted back or turned to look at the camera, " +
      "her breasts hanging and swaying naturally with gravity",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["back", "arms", "breasts", "head"],
    notes: "乳房自然垂坠晃动。",
  },
  {
    id: "pose-006",
    category: "pose",
    name: "坐姿侧倾扭转",
    promptEn:
      "sitting with knees bent and legs falling together to one side, skirt riding up her thighs naturally, " +
      "torso twisted in the opposite direction, her spine wound into a spiral curve, " +
      "shoulder-back and waist-hip lines shown at once",
    intensityRange: ["L1", "L2", "L3"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["torso", "spine", "thighs", "waist"],
    notes: "脊椎拧出螺旋弧线，肩背与腰臀曲线同时呈现。",
  },
  {
    id: "pose-007",
    category: "pose",
    name: "分腿后仰支撑",
    promptEn:
      "seated, legs opening to both sides, hands planted on the ground behind her, torso leaning back, chest thrust out, " +
      "pelvis pushed gently forward, her wet pussy fully spread open",
    intensityRange: ["L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["legs", "arms", "torso", "pussy"],
    notes: "胸口挺出，骨盆轻轻前送。",
  },
  {
    id: "pose-008",
    category: "pose",
    name: "跪姿后仰",
    promptEn:
      "kneeling with knees parted, torso slowly arching backward, hands planted behind her or gripping her ankles, " +
      "pelvis pushed forward, the curves of her waist, belly and chest unfolding completely, her crotch presented forward",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["torso", "pelvis", "arms", "ankles"],
    notes: "腰腹与胸口曲线完全展开。",
  },
  {
    id: "pose-009",
    category: "pose",
    name: "俯身跪撑下压",
    promptEn:
      "starting on all fours, her chest sinking slowly toward the ground, pelvis held high, " +
      "waist dipping into a curve, buttocks facing the camera or turned slightly to the side",
    intensityRange: ["L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["chest", "pelvis", "waist", "buttocks"],
    notes: "骨盆保持高高翘起。",
  },
  {
    id: "pose-010",
    category: "pose",
    name: "站立前倾支撑",
    promptEn:
      "standing, body leaning forward, hands braced on a surface in front of her (table edge, headboard, wall), " +
      "back held straight, pelvis tilted back, her hip curve presented from behind",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["back", "arms", "pelvis", "buttocks"],
    notes: "支撑面可写桌沿、床头、墙面。",
  },
  {
    id: "pose-011",
    category: "pose",
    name: "靠墙骨盆前送",
    promptEn:
      "back against the wall, legs apart and planted, pelvis slowly pushed off the wall and forward, " +
      "waist and belly bowing into a curve, arms raised overhead or hands resting on the wall",
    intensityRange: ["L2", "L3", "L4"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: ["back", "pelvis", "waist", "arms"],
    notes: "双手可举过头顶或扶墙。",
  },
];
