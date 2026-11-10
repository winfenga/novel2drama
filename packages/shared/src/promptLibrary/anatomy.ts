/**
 * M3-6 · 解剖术语四列表 + 禁用代称映射。
 * 来源：docs/excerpts/02_qwen-i2i-nsfw-rules_全文.md §9（原 L203-255），逐条照录。
 * policy-nsfw.md 的解剖术语段落从本文件引用数据生成，不手抄（m35-spec §2.4）。
 *
 * 四列结构：直白术语 / 描述语用英文 / anime 加什么 / realistic 加什么。
 * 禁用代称映射核心逻辑：文学化词汇在扩散模型里没有语义映射，等于没写。
 * 唯一例外（EX02 L255）：文学词若作为画面里的可见文字出现（对白气泡、拟态文字），
 * 照语言决策 B 处理放进双引号——那是渲染内容，不是描述语。
 */

// ── 四列术语（anime / realistic 列可为空 = 该介质无需额外措辞）──

export interface AnatomyTerm {
  /** 直白术语（必须使用） */
  term: string;
  /** 描述语用英文 */
  promptEn: string;
  /** anime / 二次元介质加分措辞 */
  anime: string;
  /** realistic / 写实介质加分措辞 */
  realistic: string;
}

/** 女性躯体（EX02 §9.1，原 L207-219） */
export const FEMALE_ANATOMY: readonly AnatomyTerm[] = [
  { term: "阴阜", promptEn: "mons pubis", anime: "色块由浅至深的过渡带", realistic: "皮下脂肪形成的柔和隆起、次表面散射" },
  { term: "大阴唇", promptEn: "labia majora", anime: "轮廓线 + 中央闭合线", realistic: "饱满隆起、皮表细纹" },
  { term: "小阴唇", promptEn: "labia minora", anime: "分层色块、边缘细线", realistic: "湿润黏膜质感、皱褶边缘" },
  { term: "阴蒂 / 阴蒂包皮", promptEn: "clitoris / clitoral hood", anime: "小块高光、结构简化", realistic: "小幅隆起、局部充血色差" },
  { term: "阴道口", promptEn: "vaginal opening", anime: "暗部色块收束", realistic: "深度自阴影、湿度反射" },
  { term: "阴道（内部）", promptEn: "vagina", anime: "内壁分层色块", realistic: "黏膜反光、内壁皱褶" },
  { term: "会阴", promptEn: "perineum", anime: "明暗交界线", realistic: "色素过渡、皮肤张力" },
  { term: "阴毛", promptEn: "pubic hair", anime: "笔触密度与走向", realistic: "卷曲走向、疏密分布、逆光毛边" },
  { term: "乳房 / 乳头 / 乳晕", promptEn: "breasts / nipple / areola", anime: "高光块位置、色块分层", realistic: "重力形变、静脉隐现、乳头挺立纹理" },
];

/** 男性躯体（EX02 §9.2，原 L221-229） */
export const MALE_ANATOMY: readonly AnatomyTerm[] = [
  { term: "阴茎 / 柱身", promptEn: "penis / shaft", anime: "结构简化 + 高光带", realistic: "皮下血管、皮肤张力、挺立角度" },
  { term: "龟头", promptEn: "glans", anime: "色块分层、边缘线", realistic: "充血色差、湿润镜面高光" },
  { term: "冠状沟", promptEn: "coronal sulcus", anime: "细线描边", realistic: "结构凹槽形成的窄自阴影" },
  { term: "阴囊 / 睾丸", promptEn: "scrotum / testicles", anime: "简化起伏", realistic: "皮肤皱褶、重力垂坠形变" },
  { term: "勃起", promptEn: "erection", anime: "结构上扬角度", realistic: "充血颜色加深、表面张力与反光" },
];

/** 共用部位与体液（EX02 §9.3，原 L231-241；只有两列，anime/realistic 列为空） */
export const COMMON_ANATOMY: readonly AnatomyTerm[] = [
  { term: "锁骨 / 颈侧 / 后颈", promptEn: "collarbone / side of neck / nape", anime: "", realistic: "" },
  { term: "腰窝 / 髋骨 / 臀", promptEn: "lower back dimples / hip bone / buttocks", anime: "", realistic: "" },
  { term: "大腿内侧 / 下腹", promptEn: "inner thigh / lower abdomen", anime: "", realistic: "" },
  { term: "汗 / 唾液", promptEn: "sweat / saliva", anime: "", realistic: "" },
  { term: "润滑液、阴道分泌液", promptEn: "lubrication / vaginal fluid", anime: "", realistic: "" },
  { term: "精液", promptEn: "semen", anime: "", realistic: "" },
  { term: "潮红", promptEn: "flush", anime: "", realistic: "" },
];

export const ANATOMY_TABLE: readonly AnatomyTerm[] = [
  ...FEMALE_ANATOMY,
  ...MALE_ANATOMY,
  ...COMMON_ANATOMY,
];

// ── 禁用代称 → 替换表（EX02 §9.4，原 L243-255）──

export interface BannedEuphemism {
  /** ❌ 不要写（文学代称/婉称） */
  banned: string;
  /** ✅ 改成（直白解剖术语） */
  replacement: string;
}

export const BANNED_EUPHEMISMS: readonly BannedEuphemism[] = [
  { banned: "花蕾 / 花瓣 / 花径", replacement: "阴蒂 / 小阴唇 / 阴道" },
  { banned: "蜜壶 / 秘境 / 幽谷 / 源头", replacement: "阴道 / 阴道口" },
  { banned: "玉茎 / 肉刃 / 阳物", replacement: "阴茎" },
  { banned: "玉液 / 蜜汁", replacement: "阴道分泌的透明润滑液" },
  { banned: "酥胸 / 双峰", replacement: "乳房" },
  { banned: "那里 / 下面 / 私处 / 要紧处", replacement: "直接用解剖部位名" },
  { banned: "爱液拉丝（作整体形容）", replacement: "阴道分泌的透明黏稠润滑液呈细长拉丝状附着于阴唇间" },
];

/**
 * 按 promptEn 查术语（大小写不敏感精确匹配 promptEn 或拆分词项）。
 * 未命中返回 undefined —— 调用方决定报错策略。
 */
export function findAnatomyTerm(en: string): AnatomyTerm | undefined {
  const needle = en.toLowerCase().trim();
  return ANATOMY_TABLE.find(
    (t) => t.promptEn.toLowerCase() === needle || t.promptEn.toLowerCase().split(" / ").includes(needle),
  );
}
