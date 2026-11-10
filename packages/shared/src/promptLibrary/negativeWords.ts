/**
 * M3-6 · 负面提示词六类骨架。
 * 来源：docs/h3-prompt-rules.md §7.8（原 EX08 i2i-enhancer-rules §8，原 L151-168），
 * 与 nsfw-design §10.1 的 SFW/NSFW 差异表。
 *
 * 写法硬约束（h3 §7.8）：
 * 1. 短语列表：逗号分隔的名词/名词短语，不是句子，单段无换行
 * 2. 同语言：与正向保持一致
 * 3. 不写否定词：直接写「多余手指」，不要写「没有多余手指」
 * 4. 不与正向重复：负面只兜正向管不住的崩坏面
 * 5. 按介质取词：介质漂移类词必须与目标介质相反
 *
 * SFW 裁剪纪律：删掉 ④ 整类（NEGATIVE_WORDS_SFW）。
 * 至少覆盖 ①③⑥（通用崩坏面）。
 */

// ── 六类骨架 ──

export type NegativeCategory =
  | "media_drift"
  | "hand_breakage"
  | "limb_structure"
  | "organ_contact"
  | "face_identity"
  | "technical";

export interface NegativeWordGroup {
  category: NegativeCategory;
  /** 类名（中文说明） */
  label: string;
  /** 示例词（写作时按介质/任务取用，不是全量塞） */
  words: readonly string[];
}

/** ① 介质漂移：按介质取词（anime 任务防跑写实；realistic 任务防跑二次元） */
export const NEGATIVE_MEDIA_DRIFT: NegativeWordGroup = {
  category: "media_drift",
  label: "① 介质漂移",
  words: [
    // anime 任务用：
    "3D渲染", "CG渲染", "写实摄影", "半写实", "欧美厚涂", "油画笔触", "写实皮肤纹理", "毛孔",
    // realistic 任务用：
    "线条描边", "平涂色块", "卡通描边", "赛璐璐上色", "二次元",
  ],
};

/** ② 手部崩坏：最高频崩点；构图已排除手部时仍要保留（防手部误入镜的闸） */
export const NEGATIVE_HAND_BREAKAGE: NegativeWordGroup = {
  category: "hand_breakage",
  label: "② 手部崩坏",
  words: [
    "多余手指", "六指", "手指融合", "爪状手", "畸形手", "手部糊连", "断裂手指", "手掌穿模", "手部与身体黏连",
  ],
};

/** ③ 肢体结构：防多肢与穿模 */
export const NEGATIVE_LIMB_STRUCTURE: NegativeWordGroup = {
  category: "limb_structure",
  label: "③ 肢体结构",
  words: [
    "多余肢体", "多余的手臂", "多余的腿", "肢体融合", "肢体穿插", "镜像错位", "缺失肢体", "断肢",
  ],
};

/** ④ 器官与接触：防器官错位——只在 NSFW 使用，SFW 整类删除；器官局部特写时必须写满并补两条 */
export const NEGATIVE_ORGAN_CONTACT: NegativeWordGroup = {
  category: "organ_contact",
  label: "④ 器官与接触",
  words: [
    "畸形生殖器", "器官错位", "器官缺失", "插入关系断裂", "接触点悬空", "色块界限错位",
    // 器官局部特写补词（裁剪纪律）：
    "结构对称性错误", "解剖分界模糊",
  ],
};

/** ⑤ 面部与身份：防脸崩（SFW 用时去掉 R18 语境词——本骨架不含语境词，取词时按场景裁） */
export const NEGATIVE_FACE_IDENTITY: NegativeWordGroup = {
  category: "face_identity",
  label: "⑤ 面部与身份",
  words: [
    "面部崩坏", "换脸", "五官错位", "双眼不对称", "瞳孔异色", "脖子过长", "头身比失衡", "手过大", "肤色断层",
  ],
};

/** ⑥ 画面技术：防工程痕迹 */
export const NEGATIVE_TECHNICAL: NegativeWordGroup = {
  category: "technical",
  label: "⑥ 画面技术",
  words: [
    "低分辨率", "模糊", "噪点", "过度锐化", "锯齿", "拼接痕迹", "接缝", "色带", "水印", "签名", "文字", "logo", "边框", "黑边",
  ],
};

/** 六类全集（NSFW 用；④ 必须写满） */
export const NEGATIVE_WORDS_NSFW: readonly NegativeWordGroup[] = [
  NEGATIVE_MEDIA_DRIFT,
  NEGATIVE_HAND_BREAKAGE,
  NEGATIVE_LIMB_STRUCTURE,
  NEGATIVE_ORGAN_CONTACT,
  NEGATIVE_FACE_IDENTITY,
  NEGATIVE_TECHNICAL,
];

/** SFW 子集：删 ④ 整类（nsfw-design §10.1 差异表） */
export const NEGATIVE_WORDS_SFW: readonly NegativeWordGroup[] = NEGATIVE_WORDS_NSFW.filter(
  (g) => g.category !== "organ_contact",
);
