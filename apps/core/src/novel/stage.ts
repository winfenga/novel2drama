/**
 * M13-2~6 · 五阶段状态机（clarify → outline → draft → fill → polish）。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结）、§3.5 第 4 条。
 *
 * **硬约束（EX15 L59-69）**：澄清阶段**逐一提问，严禁一次性抛完**。
 * `nextQuestion` 每次只返回一个问题，全部问完才返回 `null`。
 *
 * 提问顺序（`prompts/writing/flow.md` §1.1）：背景 → 人物 → 素材模板推选。
 */
import { DramaError } from "@text2drama/shared";

/** 五阶段（契约 §3.3） */
export type NovelStage = "clarify" | "outline" | "draft" | "fill" | "polish";

/** 阶段推进顺序（advance 按此表走） */
export const STAGE_ORDER: readonly NovelStage[] = [
  "clarify",
  "outline",
  "draft",
  "fill",
  "polish",
] as const;

export interface StageState {
  stage: NovelStage;
  /** 澄清阶段已问过的问题 id（逐一提问，不一次抛完） */
  askedQuestions: string[];
  /** 澄清阶段已收集的答案 */
  answers: Record<string, string>;
  /** 未填的占位符 */
  pendingPlaceholders: string[];
}

/** 问题分组：先背景、再人物、最后素材模板（flow.md §1.1） */
export type ClarifyGroup = "background" | "character" | "material";

export interface ClarifyQuestion {
  id: string;
  group: ClarifyGroup;
  question: string;
  /** 为什么要问（给上层拼提示词用，不参与判定） */
  why: string;
}

/**
 * 澄清问题集（顺序即提问顺序，**一次只问一个**）。
 * id 是持久化主键，改名等于破坏已有 state，别动。
 */
export const CLARIFY_QUESTIONS: readonly ClarifyQuestion[] = [
  {
    id: "bg.time",
    group: "background",
    question: "故事发生在什么时间？",
    why: "时间决定社会结构与可用道具（古代无电路板，近未来才有寄生装置）",
  },
  {
    id: "bg.place",
    group: "background",
    question: "主要场景在哪些地点展开？",
    why: "地点决定能否出现 C 类隐秘调教（公共场合 vs 私人空间）",
  },
  {
    id: "bg.world",
    group: "background",
    question: "世界观设定是什么（现实／幻想／近未来／架空）？",
    why: "世界观决定身体设定与器物是否成立",
  },
  {
    id: "bg.conflict",
    group: "background",
    question: "核心冲突是什么？",
    why: "冲突决定 NSFW 场景的剧情驱动，避免廉价堆砌",
  },
  {
    id: "bg.tone",
    group: "background",
    question: "情感基调是什么（压抑／戏谑／绝望／甜腻）？",
    why: "基调决定笑声与用词层级",
  },
  {
    id: "char.appearance",
    group: "character",
    question: "主要角色的外貌特征是什么？",
    why: "外貌进 novel.kb 第 2 章，润色阶段要校验一致性",
  },
  {
    id: "char.personality",
    group: "character",
    question: "主要角色的性格与行为逻辑是什么？",
    why: "性格决定其求饶方式与反抗强度",
  },
  {
    id: "char.nsfw",
    group: "character",
    question: "角色的 NSFW 属性是什么（敏感点／性癖／倾向／生理极限）？",
    why: "决定占位符填充时的强度上限，越界即人物崩坏",
  },
  {
    id: "material.template",
    group: "material",
    question: "素材模板推选：本作要采用哪一类（触手 body／机械 machine／状态变更 status）？",
    why: "决定素材库检索的类别，避免填出与设定无关的器物",
  },
] as const;

function bad(message: string, hint?: string): DramaError {
  return new DramaError("invalid_param", { message, ...(hint === undefined ? {} : { hint }) });
}

function hasAnswer(state: StageState, id: string): boolean {
  return (state.answers[id] ?? "").trim() !== "";
}

/**
 * 取下**一个**待问问题；全部问完返回 `null`（= 澄清完成）。
 *
 * 已问过的（在 `askedQuestions` 里）与已答过的（`answers[id]` 非空）都跳过，因此
 * 调用方的正常用法是：`q = nextQuestion(s)` → 提问 → `s.askedQuestions.push(q.id)`
 * → 把答案写进 `s.answers[q.id]`。
 *
 * 传入未知 stage 不受影响——本函数只读 questions 与 answers。
 */
export function nextQuestion(state: StageState): ClarifyQuestion | null {
  const asked = new Set(state.askedQuestions);
  for (const q of CLARIFY_QUESTIONS) {
    if (asked.has(q.id)) continue;
    if (hasAnswer(state, q.id)) continue;
    return q;
  }
  return null;
}

/**
 * 各阶段的「完成闸门」答案键。
 *
 * clarify 的闸门是「所有澄清问题都已问且已答」；fill 的闸门是「没有未填占位符」；
 * 其余三阶段的闸门是**显式批准键**——不认「写过就算了」，必须有人确认。
 */
export const STAGE_GATE_KEYS = {
  outline: "outline.approved",
  draft: "draft.written",
  polish: "polish.approved",
} as const;

/** 当前阶段是否完成（完成才允许 advance，否则 advance 抛错） */
export function isStageComplete(state: StageState): boolean {
  switch (state.stage) {
    case "clarify":
      return nextQuestion(state) === null;
    case "outline":
      return hasAnswer(state, STAGE_GATE_KEYS.outline);
    case "draft":
      return hasAnswer(state, STAGE_GATE_KEYS.draft);
    case "fill":
      return state.pendingPlaceholders.length === 0;
    case "polish":
      return hasAnswer(state, STAGE_GATE_KEYS.polish);
    default: {
      const exhaustive: never = state.stage;
      void exhaustive;
      throw bad("未知的创作阶段", "NovelStage 只允许 clarify/outline/draft/fill/polish");
    }
  }
}

/**
 * 推进到下一阶段。**未完成不许推进**（抛 `invalid_param` 并说明缺什么），
 * 已完成最终阶段（polish）再推进同样抛错——不返回原地踏步的假成功。
 *
 * 推进时保留 `answers`（已收集的信息跨阶段复用）；`pendingPlaceholders` 由 draft 阶段
 * 结束时由调用方用 `placeholder.ts` 的结果填充，本函数不代劳、不猜。
 */
export function advance(state: StageState): StageState {
  if (!isStageComplete(state)) {
    switch (state.stage) {
      case "clarify": {
        const q = nextQuestion(state);
        throw bad(
          `澄清阶段还没完成：下一个待问问题是「${q?.question ?? ""}」`,
          "nextQuestion 返回 null 才算澄清完成",
        );
      }
      case "fill":
        throw bad(
          `填充阶段还有 ${state.pendingPlaceholders.length} 个占位符未填：${state.pendingPlaceholders.join(" / ")}`,
          "fillPlaceholder 全部填完（或显式保留）才能进 polish",
        );
      default:
        throw bad(
          `阶段 ${state.stage} 还没完成：缺少批准标记「${STAGE_GATE_KEYS[state.stage]}」`,
          "把确认结果写进 answers 的闸门键再推进",
        );
    }
  }

  const idx = STAGE_ORDER.indexOf(state.stage);
  if (idx < 0) throw bad(`未知的创作阶段：${state.stage}`);
  if (idx === STAGE_ORDER.length - 1) {
    throw bad("已经在最终阶段 polish，无法再推进", "定稿后走交付，不再 advance");
  }
  const next = STAGE_ORDER[idx + 1];
  if (next === undefined) throw bad("阶段表损坏：找不到下一阶段");

  return {
    stage: next,
    askedQuestions: [...state.askedQuestions],
    answers: { ...state.answers },
    pendingPlaceholders: [...state.pendingPlaceholders],
  };
}

/** 造一个干净的状态（测试与阶段一初始化共用） */
export function initialStageState(stage: NovelStage = "clarify"): StageState {
  return { stage, askedQuestions: [], answers: {}, pendingPlaceholders: [] };
}
