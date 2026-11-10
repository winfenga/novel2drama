/**
 * M13-7 · 素材库（四类）检索 + 去作品化校验。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结）、§3.5 第 8 条；
 * 检索规则按 `prompts/writing/materials.md` §4。
 *
 * - `checkDeNovelized`：**只报不改**（materials.md §3.6 闸门）——返回违规项交人复核，
 *   非空即拒收。识别手段：① 内置身份词表（`IDENTITY_BLOCKLIST`，纯字符串匹配）；
 *   ② `《》` 书名号包裹（作品名/篇章名/系列名的结构特征，materials.md §3.1 禁令 1）。
 * - `retrieveMaterials`：按标签**求交**（materials.md §4.3「按标签求交，不做全文关键词匹配」），
 *   按 id 去重、稳定顺序、limit 截断（默认个位数 = 5）。
 *
 * ⚠️ 词表只存**虚构占位样例**，严禁收录真实作品名/角色名（去作品化纪律双向执行：
 * 库不收录真实 IP，本文件也不内置真实 IP）。
 */
import { DramaError } from "@text2drama/shared";

export type MaterialCategory = "body" | "machine" | "tentacle" | "status";

export interface MaterialEntry {
  id: string;
  category: MaterialCategory;
  tags: string[];
  body: string;
}

/** 内置身份词表：虚构占位样例，随素材库维护扩充（materials.md §3 三条禁令） */
export const IDENTITY_BLOCKLIST: readonly string[] = ["星穹学园", "绯月之章", "天启七号"];

/** 书名号包裹的专名（1-20 字，防整段误报） */
const BOOK_TITLE_RE = /《([^》]{1,20})》/gu;

function bad(message: string, hint?: string): DramaError {
  return new DramaError("invalid_param", { message, ...(hint === undefined ? {} : { hint }) });
}

/**
 * 去作品化校验：检查条目里残留的作品名/角色名/专有名词。
 *
 * @returns 违规项列表（形如 `body：命中身份词表「星穹学园」`），**不修改条目**；
 *          空数组 = 通过闸门。
 */
export function checkDeNovelized(entry: MaterialEntry): string[] {
  const violations: string[] = [];
  const fields: Array<[string, string]> = [
    ["id", entry.id],
    ["tags", entry.tags.join("、")],
    ["body", entry.body],
  ];

  for (const [field, value] of fields) {
    for (const marker of IDENTITY_BLOCKLIST) {
      if (value.includes(marker)) violations.push(`${field}：命中身份词表「${marker}」`);
    }
    BOOK_TITLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BOOK_TITLE_RE.exec(value)) !== null) {
      const title = m[1] ?? "";
      if (title !== "") violations.push(`${field}：书名号包裹的疑似作品名「${title}」`);
    }
  }

  return [...new Set(violations)];
}

const DEFAULT_LIMIT = 5;

/**
 * 按标签检索素材（阶段四 fill 调用）。
 *
 * 命中 = 条目 tags 覆盖**全部**请求标签（求交）；同一 id 单次只出现一次；
 * 返回顺序 = 库内顺序（稳定）；limit 截断前 N 条。
 *
 * @param limit 返回上限（默认 5）；非正整数抛 `invalid_param`。
 * @returns 命中条目；无命中返回空数组（「库中无匹配」的如实上报由调用方负责）
 */
export function retrieveMaterials(
  lib: MaterialEntry[],
  tags: string[],
  limit?: number,
): MaterialEntry[] {
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw bad(`limit 必须是正整数，收到 ${String(limit)}`);
  }

  const matched = lib.filter((e) => tags.every((t) => e.tags.includes(t)));
  const byId = new Map<string, MaterialEntry>();
  for (const e of matched) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  const out = [...byId.values()];
  return limit === undefined ? out : out.slice(0, limit);
}
