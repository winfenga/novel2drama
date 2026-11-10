/**
 * M3-6 · ⑧ 声音类（声音设计的元素）。
 * 来源：docs/excerpts/01_nsfw-template_全文.md L461-469（EX01 §八·8）。
 * 按 5 子类组织（环境/动作/身体/台词/音乐），每条标注归属落点：
 *   integrated（integrated_multimodal_description）/ soundscape（overall_soundscape）/ music（non_diegetic_music）。
 * 归属规则（EX01 L463）：台词与同期声写进 integrated；环境声、动作声、非语言人声汇总进
 * soundscape；观众向配乐写进 music。
 * 归属落点放在 notes 字段（ActionEntry 无专属归属字段，spec 冻结接口不扩）。
 */

import type { ActionEntry } from "../index.js";

export const SOUND_ACTIONS: ActionEntry[] = [
  {
    id: "sound-001",
    category: "sound",
    name: "环境声",
    promptEn:
      "water sounds, ocean waves, birdsong, insect chirps, wind, rain, crowd murmur, background music hum, electric buzz, street traffic",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "子类=环境声；归属=soundscape。",
  },
  {
    id: "sound-002",
    category: "sound",
    name: "动作声",
    promptEn:
      "rustle of fabric, clothes sliding off, buttons undoing, zippers, a small bell chiming, bed creaking, soft floorboard steps, water rippling",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "子类=动作声；归属=soundscape。",
  },
  {
    id: "sound-003",
    category: "sound",
    name: "身体声",
    promptEn:
      "breath growing heavier, soft gasps, moans lengthening and shifting in pitch, swallowing sounds, wet lip and tongue noises, " +
      "the sticky squelch of fluids rubbing, the wet gush of fingers moving inside, the splash of squirting, heartbeat",
    intensityRange: ["L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "子类=身体声；归属=soundscape（非语言人声）。",
  },
  {
    id: "sound-004",
    category: "sound",
    name: "台词声",
    promptEn:
      "voice quality — soft and clingy / husky and seductive / with a teasing smile / with a sobbing note / trembling / breathy whisper; " +
      "lip-sync written as mouth-jaw-breath coupling (see h3 §5.7); timbre phrases written outside the <d> tag",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "子类=台词声；归属=integrated（<d> 外写音色英文，如 a soft, clingy voice / a husky, seductive voice）。",
  },
  {
    id: "sound-005",
    category: "sound",
    name: "音乐",
    promptEn:
      "soft piano, strings, electronic beat, a languid melody, fading in at the climax or the ending; " +
      "write only instruments and dynamics, never mood words",
    intensityRange: ["L0", "L1", "L2", "L3", "L4", "L5"],
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],
    bodyParts: [],
    notes: "子类=音乐；归属=music（观众向配乐，禁抽象情绪词——h3 §5.8）。",
  },
];
