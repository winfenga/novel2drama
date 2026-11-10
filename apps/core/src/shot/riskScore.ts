/**
 * M6-6 · 20 项风险分（三闸分组）。
 *
 * 依据：m267-spec §2.3、core-principles §5.4.1（L267-280 映射表：闸一 5 项 ①-⑤、
 * 闸二 8 项 ⑥-⑬、闸三 7 项 ⑭-⑳）、storyboard-rules §8.1（L508-551）。
 * 规则：
 * - 每闸只跑自己那组；任一 2 分 = 该闸不过
 * - 闸间单向流水：闸一有 2 分则闸二不跑（runGate2Checks 由调用方在流水编排层控制，
 *   本模块提供 shouldProceed 函数承载该裁决）
 * - E4 漂移裁决：LLM 依赖项（①②⑤⑰-⑳）本轮返回 score:1 + detail:"待 LLM 接入"，
 *   留接口待 M5 后接线
 */

export type RiskItem = { id: number; score: 0 | 1 | 2; detail: string };

// ── 闸一输入（Phase A 事实层）──

export interface Gate1Facts {
  /** ③ 本镜声明的主体（人物）列表 */
  subjects: string[];
  /** ③ 文本实际出现的主体列表 */
  presentSubjects: string[];
  /** ④ 已定义的状态变体列表 */
  stateVariants: string[];
  /** ④ 文本中出现的状态变体列表 */
  presentVariants: string[];
}

// ── 闸二输入（规划层）──

export interface Gate2Facts {
  /** ⑥ 各镜 [start, end] 时间码 */
  timecodes: { index: number; startSec: number; endSec: number }[];
  /** ⑦ 初始位置是否已从事实重建（M6-4 校验器结果） */
  initialPositionRebuilt: boolean;
  /** ⑧ 动作槽数与预算 */
  slotsUsed: number;
  slotBudget: number;
  /** ⑨ 台词字数与预算 */
  dialogueCharCount: number;
  dialogueCharBudget: number;
  /** ⑩ 运镜/表情：每节拍主运镜数、单镜运镜数、表情数 */
  cameraPerBeat: number[];
  cameraPerShot: number;
  expressionCount: number;
  /** ⑪ 同镜可见人脸数 */
  faces: number;
  maxFaces: number;
  /** ⑫ 状态变化列表（缺起止锚点则 2 分） */
  stateChanges: { name: string; hasStartAnchor: boolean; hasEndAnchor: boolean }[];
  /** ⑬ 资产引用是否全部使用已分配编号 */
  assetRefs: string[];
  assignedCodes: string[];
}

// ── 闸三输入（渲染层）──

export interface Gate3Facts {
  /** ⑭ 提示词语言与目标模型是否匹配 */
  promptLanguageMatchesModel: boolean;
  /** ⑮ 是否已按 Mmax 切分（D > Mmax 时 subShots ≥ 2） */
  durationWithinModelLimit: boolean;
  /** ⑯ 负向/BGM/字幕策略是否正确 */
  negativeBgmSubtitleOk: boolean;
}

const PENDING_DETAIL = "待 LLM 接入";

/**
 * 闸一 · 5 项（①-⑤）。①②⑤ 需要 LLM（E4：score 1 + 待接入）；③④ 纯规则。
 */
export function runGate1Checks(facts: Gate1Facts): RiskItem[] {
  const items: RiskItem[] = [
    { id: 1, score: 1, detail: PENDING_DETAIL }, // ① 证据缺口
    { id: 2, score: 1, detail: PENDING_DETAIL }, // ② 矛盾未裁决
    { id: 5, score: 1, detail: PENDING_DETAIL }, // ⑤ 时间线断裂
  ];

  // ③ 主体遗漏 / 多抽：声明的主体必须都在文本出现，出现的不得超出声明
  const missing = facts.subjects.filter((s) => !facts.presentSubjects.includes(s));
  const extra = facts.presentSubjects.filter((s) => !facts.subjects.includes(s));
  items.push({
    id: 3,
    score: missing.length + extra.length > 0 ? 2 : 0,
    detail:
      missing.length + extra.length > 0
        ? `主体遗漏: ${missing.join(",") || "无"}；多抽: ${extra.join(",") || "无"}`
        : "主体一致",
  });

  // ④ 状态变体缺失：文本出现的状态变体必须有定义
  const missingVariants = facts.presentVariants.filter((v) => !facts.stateVariants.includes(v));
  items.push({
    id: 4,
    score: missingVariants.length > 0 ? 2 : 0,
    detail: missingVariants.length > 0 ? `状态变体缺失: ${missingVariants.join(",")}` : "状态变体齐备",
  });

  return items.sort((a, b) => a.id - b.id);
}

/**
 * 闸二 · 8 项（⑥-⑬）。本轮全部纯规则可判。
 */
export function runGate2Checks(facts: Gate2Facts): RiskItem[] {
  const items: RiskItem[] = [];

  // ⑥ 时间码不闭合：连续、无缺口
  let timecodeBroken = false;
  for (let i = 0; i < facts.timecodes.length; i++) {
    const t = facts.timecodes[i]!;
    if (t.endSec <= t.startSec) timecodeBroken = true;
    if (i > 0) {
      const prev = facts.timecodes[i - 1]!;
      if (t.startSec !== prev.endSec) timecodeBroken = true;
    }
  }
  items.push({
    id: 6,
    score: timecodeBroken ? 2 : 0,
    detail: timecodeBroken ? "时间码不闭合（缺口/倒置）" : "时间码闭合",
  });

  // ⑦ 初始位置未从事实重建
  items.push({
    id: 7,
    score: facts.initialPositionRebuilt ? 0 : 2,
    detail: facts.initialPositionRebuilt ? "初始位置已从事实重建" : "初始位置未从事实重建",
  });

  // ⑧ 动作超 9 槽 / 超时长
  items.push({
    id: 8,
    score: facts.slotsUsed > facts.slotBudget ? 2 : 0,
    detail: facts.slotsUsed > facts.slotBudget ? `动作槽超载 ${facts.slotsUsed}/${facts.slotBudget}` : `动作槽 ${facts.slotsUsed}/${facts.slotBudget}`,
  });

  // ⑨ 台词超字数（建议值口径，storyboard-rules L203）
  items.push({
    id: 9,
    score: facts.dialogueCharCount > facts.dialogueCharBudget ? 2 : 0,
    detail: facts.dialogueCharCount > facts.dialogueCharBudget ? `台词超字数 ${facts.dialogueCharCount}/${facts.dialogueCharBudget}` : `台词 ${facts.dialogueCharCount}/${facts.dialogueCharBudget}`,
  });

  // ⑩ 运镜/表情过密：每节拍 ≤1 主运镜、单镜 ≤2、表情 ≤3
  const cameraOver = facts.cameraPerBeat.some((c) => c > 1) || facts.cameraPerShot > 2 || facts.expressionCount > 3;
  items.push({
    id: 10,
    score: cameraOver ? 2 : 0,
    detail: cameraOver ? "运镜/表情过密" : "运镜/表情在预算内",
  });

  // ⑪ 同镜人数超载
  items.push({
    id: 11,
    score: facts.faces > facts.maxFaces ? 2 : 0,
    detail: facts.faces > facts.maxFaces ? `同镜人脸超载 ${facts.faces}/${facts.maxFaces}` : `人脸 ${facts.faces}/${facts.maxFaces}`,
  });

  // ⑫ 状态变化缺起止锚点
  const missingAnchors = facts.stateChanges.filter((c) => !c.hasStartAnchor || !c.hasEndAnchor);
  items.push({
    id: 12,
    score: missingAnchors.length > 0 ? 2 : 0,
    detail: missingAnchors.length > 0 ? `状态变化缺起止锚点: ${missingAnchors.map((c) => c.name).join(",")}` : "状态变化锚点齐备",
  });

  // ⑬ 资产编号未固定 / 引用错位
  const badRefs = facts.assetRefs.filter((r) => !facts.assignedCodes.includes(r));
  items.push({
    id: 13,
    score: badRefs.length > 0 ? 2 : 0,
    detail: badRefs.length > 0 ? `资产引用错位: ${badRefs.join(",")}` : "资产引用一致",
  });

  return items.sort((a, b) => a.id - b.id);
}

/**
 * 闸三 · 7 项（⑭-⑳）。⑭⑮⑯ 纯规则；⑰-⑳ 需要 LLM/交付核对（E4：score 1 + 待接入）。
 */
export function runGate3Checks(facts: Gate3Facts): RiskItem[] {
  const items: RiskItem[] = [
    { id: 14, score: facts.promptLanguageMatchesModel ? 0 : 2, detail: facts.promptLanguageMatchesModel ? "格式/语言匹配" : "格式/语言不匹配" },
    { id: 15, score: facts.durationWithinModelLimit ? 0 : 2, detail: facts.durationWithinModelLimit ? "单镜上限已处理" : "模型单镜上限未处理" },
    { id: 16, score: facts.negativeBgmSubtitleOk ? 0 : 2, detail: facts.negativeBgmSubtitleOk ? "负向/BGM/字幕策略正确" : "负向/BGM/字幕策略错误" },
    { id: 17, score: 1, detail: PENDING_DETAIL }, // ⑰ 镜头外/心理描写进画面
    { id: 18, score: 1, detail: PENDING_DETAIL }, // ⑱ 事实被改写/新增剧情
    { id: 19, score: 1, detail: PENDING_DETAIL }, // ⑲ 资产图风格不统一
    { id: 20, score: 1, detail: PENDING_DETAIL }, // ⑳ 交付缺项
  ];
  return items.sort((a, b) => a.id - b.id);
}

/** 闸间单向流水：该闸有 2 分 → 下一闸不跑 */
export function shouldProceed(items: RiskItem[]): boolean {
  return !items.some((i) => i.score === 2);
}
