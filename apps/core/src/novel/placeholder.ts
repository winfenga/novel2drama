/**
 * M13-4/5 · 占位符扫描 / 任务化 / 回填。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结）、§3.5 第 4 条。
 *
 * 占位符格式（本文件冻结口径）：`[NSFW: <场景类型>: <描述>]`，
 * 场景类型 ∈ A/B/C1/C2，与 `promptlib/retrieval.ts` 的 `TkSceneType` 对齐，大小写不敏感。
 * **不带场景类型的占位符直接抛错**——类型缺失不许猜（不静默降级总红线），
 * 否则 fill 阶段的 S3/S4 检索会拿错词库。
 *
 * 回填纪律：阶段五前必须全部填满或显式保留（显式保留 = 把该占位符的 raw 原文
 * 作为对应 index 的值传回 Map）。缺一个就抛 `invalid_param` 并列出全部缺项，
 * 绝不留空、绝不静默跳过。
 */
import { DramaError } from "@text2drama/shared";

import type { TkSceneType } from "../promptlib/retrieval.js";

export interface NsfwPlaceholder {
  raw: string; // 原文 "[NSFW: A: 场景描述]"
  index: number; // 第几个，从 0 连续
  sceneType: "A" | "B" | "C1" | "C2";
  description: string;
  filled: boolean;
}

const SCENE_TYPES: readonly TkSceneType[] = ["A", "B", "C1", "C2"];

/** 占位符整体正则：`[NSFW: ...]`，内部不嵌套方括号 */
const PLACEHOLDER_RE = /\[NSFW:\s*([^\]]*?)\s*\]/gu;

function bad(message: string, hint?: string): DramaError {
  return new DramaError("invalid_param", { message, ...(hint === undefined ? {} : { hint }) });
}

function parseInner(
  inner: string,
  at: number,
): { sceneType: NsfwPlaceholder["sceneType"]; description: string } {
  const m = /^(A|B|C1|C2)\s*[:：]\s*(.*)$/iu.exec(inner.trim());
  if (m === null) {
    throw bad(
      `第 ${at + 1} 个字符处的占位符缺场景类型：${inner.trim()}`,
      "占位符必须写成 `[NSFW: <A|B|C1|C2>: 描述]`；类型缺失不许猜",
    );
  }
  const sceneType = (m[1] ?? "").toUpperCase() as NsfwPlaceholder["sceneType"];
  if (!SCENE_TYPES.includes(sceneType)) {
    throw bad(`占位符场景类型非法：${sceneType}`, `只允许 ${SCENE_TYPES.join(" / ")}`);
  }
  const description = (m[2] ?? "").trim();
  if (description === "") {
    throw bad(`第 ${at + 1} 个字符处的占位符描述为空`, "`[NSFW: A: 描述]` 的描述不能留空");
  }
  return { sceneType, description };
}

/** 扫描结果 + 原文位置（回填按位置替换，不靠 indexOf，避免重复 raw 错位） */
interface Span {
  p: NsfwPlaceholder;
  start: number;
  end: number;
}

function scanAll(text: string): Span[] {
  const spans: Span[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    const raw = m[0];
    const { sceneType, description } = parseInner(m[1] ?? "", m.index);
    spans.push({
      p: { raw, index, sceneType, description, filled: false },
      start: m.index,
      end: m.index + raw.length,
    });
    index += 1;
  }
  return spans;
}

/**
 * 扫描正文中的全部占位符，编号从 0 连续（按出现顺序）。
 *
 * `filled` 恒为 `false`：扫到的都是未填占位符；填没填由状态层维护
 * （`fillPlaceholder` 替换后原占位符即消失，重新扫描自然只剩未填的）。
 */
export function scanPlaceholders(text: string): NsfwPlaceholder[] {
  return scanAll(text).map((s) => s.p);
}

/** 需求确认字段（flow.md §1.4 阶段四第 1 步）：调教手段 / 角色心理状态 / 快感程度 */
const CONFIRM_FIELDS = ["调教手段", "角色心理状态", "快感程度"] as const;

/** 每个占位符独立子任务：先确认需求再填（契约 §3.3 注释原话） */
export function placeholderTask(p: NsfwPlaceholder): { question: string; requiredFields: string[] } {
  const question =
    `占位符 #${p.index}（${p.sceneType} 类）：${p.description}。` +
    `填充前先确认需求：${CONFIRM_FIELDS.join("、")}分别是什么？`;
  return { question, requiredFields: [...CONFIRM_FIELDS] };
}

/**
 * 把各占位符的填充值写回正文。
 *
 * 硬约束（契约 §3.3）：
 * 1. 扫描到的每个占位符都必须有值（缺一个即抛错，列出全部缺项）；
 * 2. 值不能为空字符串（不许留空）；
 * 3. Map 里出现扫描结果中不存在的编号 → 抛错（调用方 bug，不静默忽略）；
 * 4. 显式保留 = 把该占位符的 raw 原文作为值传回（结果里该占位符原样保留）。
 *
 * 按原文位置从后往前替换，重复 raw 文本也不会错位。
 */
export function fillPlaceholder(text: string, values: Map<number, string>): string {
  const spans = scanAll(text);

  for (const idx of values.keys()) {
    if (!spans.some((s) => s.p.index === idx)) {
      throw bad(
        `fillPlaceholder 收到不存在的占位符编号 ${idx}`,
        "Map 的 key 必须来自 scanPlaceholders 返回的 index",
      );
    }
  }

  const missing: string[] = [];
  for (const s of spans) {
    const v = values.get(s.p.index);
    if (v === undefined || v.trim() === "") {
      missing.push(`#${s.p.index} ${s.p.raw}`);
    }
  }
  if (missing.length > 0) {
    throw bad(
      `有 ${missing.length} 个占位符未填：${missing.join("、")}`,
      "阶段五前必须全部填满或显式保留——显式保留 = 把 raw 原文作为该 index 的值传回",
    );
  }

  let out = text;
  for (const s of [...spans].reverse()) {
    const v = values.get(s.p.index);
    if (v === undefined) throw bad("内部错误：已校验过的占位符拿不到值");
    out = out.slice(0, s.start) + v + out.slice(s.end);
  }
  return out;
}
