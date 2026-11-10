/**
 * M13 · 写作侧 prompt 拼装（S1/S2/S5/S6 从 prompts/writing/ 读，S3/S4 从 themes/tk.md 锚点切）。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结）、§3.5 第 6 条。
 *
 * 段映射（decision-log §十九，**检索逻辑复用 `promptlib/retrieval.ts` 的 `tkSegmentsFor`，
 * 本文件绝不重写**）：
 * - draft  → [S1]（只给流程骨架）
 * - fill   → [S1 + S3/S4 按场景类型裁剪]
 * - polish → [S2, S5]
 *
 * 硬约束：
 * 1. 单次附加 TK 段 ≤ 2（`assertTkBudget`，超了抛错）；
 * 2. 段落读不到 / 锚点缺失 → 抛 `invalid_param`，**不许静默跳过**；
 * 3. S3 的子段裁剪（S3-symbols 是否注入）按场景类型过滤——C 类禁 ♡/❤、纯 A 无快感符号
 *    （retrieval.ts 注释口径：「裁剪粒度在 tk.md 锚点内」）。
 */
import { DramaError } from "@text2drama/shared";

import { loadPromptFile } from "../promptlib/overrides.js";
import {
  MAX_SEGMENTS_PER_CALL,
  tkSegmentsFor,
  type TkSceneType,
  type TkSegment,
} from "../promptlib/retrieval.js";
import { renderKb, type NovelKb } from "./kb.js";

/** 写作阶段（与 retrieval.ts 的 TkStage 结构一致） */
export type WritingStage = "draft" | "fill" | "polish";

function bad(message: string, hint?: string): DramaError {
  return new DramaError("invalid_param", { message, ...(hint === undefined ? {} : { hint }) });
}

/** TK 段软上限守卫（decision-log §十九）。单独导出以便直接单测。 */
export function assertTkBudget(segs: readonly TkSegment[]): void {
  if (segs.length > MAX_SEGMENTS_PER_CALL) {
    throw bad(
      `单次调用附加的 TK 段超过上限：${segs.length} 段 > ${MAX_SEGMENTS_PER_CALL}`,
      "tkSegmentsFor 的返回长度必须 ≤ 2；超限说明检索映射被改坏了",
    );
  }
}

/**
 * 读写作侧段：整文件内容去掉锚点注释行。
 * 文件缺失由 `loadPromptFile` 抛错；锚点缺失抛 `invalid_param`（不静默降级）。
 */
function readWritingSegment(rel: string, anchor: string, roots: readonly string[]): string {
  const full = loadPromptFile(rel, roots);
  const lines = full.split(/\r?\n/);
  if (!lines.some((l) => l.trim() === anchor)) {
    throw bad(`提示词文件 ${rel} 缺少写作段锚点 ${anchor}`, "写作段文件必须以 `<!-- writing-segment:<id> -->` 标记段落");
  }
  return lines.filter((l) => l.trim() !== anchor).join("\n").trim();
}

/** 收集 tk.md 的全部子段锚点（文件出现顺序） */
function collectTkAnchors(tkText: string): string[] {
  const anchors: string[] = [];
  for (const line of tkText.split(/\r?\n/)) {
    const m = /^<!-- tk-segment:(S3|S4)-([\w-]+) -->\s*$/u.exec(line);
    if (m !== null) anchors.push(`${m[1]}-${m[2]}`);
  }
  return anchors;
}

/** 按场景类型挑选 S3/S4 的子段 id（顺序 = tk.md 文件顺序） */
function pickTkSubSegments(
  seg: "S3" | "S4",
  sceneTypes: readonly TkSceneType[],
  anchors: readonly string[],
): string[] {
  const prefix = seg === "S3" ? "S3-" : "S4-";
  let ids = anchors.filter((a) => a.startsWith(prefix));
  if (seg === "S3") {
    const hasB = sceneTypes.includes("B");
    const hasC = sceneTypes.includes("C1") || sceneTypes.includes("C2");
    // C 类禁 ♡/❤（§十八）、纯 A 无快感符号段 → 不注入 S3-symbols
    if (!(hasB && !hasC)) ids = ids.filter((a) => a !== "S3-symbols");
  }
  return ids;
}

/**
 * 按锚点 id 切出 tk.md 的段内容（顺序 = 文件顺序，锚点注释行本身被剔除）。
 * 请求的锚点缺失 → 抛 `invalid_param`。导出以便直接单测「缺锚点必抛」。
 */
export function readTkSegments(tkText: string, ids: readonly string[]): string[] {
  const content = new Map<string, string>();
  const order: string[] = [];
  let current: string | null = null;
  const buf: string[] = [];
  for (const line of tkText.split(/\r?\n/)) {
    const m = /^<!-- tk-segment:(S3|S4)-([\w-]+) -->\s*$/u.exec(line);
    if (m !== null) {
      if (current !== null) content.set(current, buf.join("\n").trim());
      current = `${m[1]}-${m[2]}`;
      order.push(current);
      buf.length = 0;
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) content.set(current, buf.join("\n").trim());

  const missing = ids.filter((id) => !order.includes(id));
  if (missing.length > 0) {
    throw bad(`tk.md 缺少 TK 段锚点：${missing.join(" / ")}`, "锚点格式 `<!-- tk-segment:S3-xxx -->`");
  }
  return order.filter((id) => ids.includes(id)).map((id) => content.get(id) ?? "");
}

const STAGE_LABELS: Record<WritingStage, string> = {
  draft: "初稿（draft）",
  fill: "NSFW 场景专项实现（fill）",
  polish: "整体润色与一致性（polish）",
};

function resolveSegment(
  seg: TkSegment,
  sceneTypes: readonly TkSceneType[],
  roots: readonly string[],
): string {
  switch (seg) {
    case "S1":
      return readWritingSegment("writing/flow.md", "<!-- writing-segment:S1 -->", roots);
    case "S2":
      return readWritingSegment("writing/conventions.md", "<!-- writing-segment:S2 -->", roots);
    case "S5":
      return readWritingSegment("writing/punctuation.md", "<!-- writing-segment:S5 -->", roots);
    case "S6":
      return readWritingSegment("writing/materials.md", "<!-- writing-segment:S6 -->", roots);
    case "S3":
    case "S4": {
      const tkText = loadPromptFile("themes/tk.md", roots);
      const ids = pickTkSubSegments(seg, sceneTypes, collectTkAnchors(tkText));
      const parts = readTkSegments(tkText, ids);
      return parts.join("\n\n---\n\n");
    }
    default: {
      const exhaustive: never = seg;
      void exhaustive;
      throw bad("未知的 TK 段", "TkSegment 只允许 S1-S6");
    }
  }
}

/**
 * 按阶段拼装一次 LLM 调用的写作指令。
 *
 * 输出结构：阶段标题 + `renderKb(kb)`（novel.kb 权威序列化）+ 各段内容，
 * 块间以 `\n\n---\n\n` 分隔（与 compliance/assembleSkill 的分隔约定一致）。
 *
 * 段内容来自覆盖查找根（项目 → 用户 → 内置）：写作侧段走 `writing/*.md`，
 * TK 段（S3/S4）走 `themes/tk.md` 锚点；任何一段读不到都抛错。
 */
export function composeWritingPrompt(opts: {
  stage: WritingStage;
  kb: NovelKb;
  sceneTypes?: ("A" | "B" | "C1" | "C2")[];
  roots: string[];
}): string {
  const { stage, kb, sceneTypes = [], roots } = opts;
  if (roots.length === 0) {
    throw bad("roots 为空：提示词覆盖查找根（项目 → 用户 → 内置）至少要有一个");
  }

  const segs = tkSegmentsFor(stage, sceneTypes);
  assertTkBudget(segs);

  const blocks: string[] = [`# 小说创作 · ${STAGE_LABELS[stage]}`];
  blocks.push(renderKb(kb).trim());
  for (const seg of segs) {
    blocks.push(resolveSegment(seg, sceneTypes, roots));
  }
  return `${blocks.join("\n\n---\n\n")}\n`;
}
