/**
 * M13-1 · novel.kb（YAML front matter + 五章）渲染 / 解析 / 原子读写。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结），验收 §3.5 第 2、3 条。
 * 三条硬约束：
 * 1. `renderKb` 的第一行**必须是** `---`（front matter），**绝不允许**开场白/解释性文字；
 * 2. `parseKb` 失败必须抛 `DramaError("invalid_param")` 并说明**缺哪一节**，不许猜、不许给默认值；
 * 3. `writeKb` 走 temp + fsync + rename 原子写。实现参照 `config/save.ts`，但**不复用**：
 *    那是 0600/0700 的密钥语义，novel.kb 是普通项目内容，权限口径不同。
 */
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DramaError } from "@text2drama/shared";

/** novel.kb 文件名（与项目目录同层） */
export const NOVEL_KB_FILENAME = "novel.kb";

/** front matter 的 status 取值（契约 §3.3） */
export type NovelStatus = "Drafting" | "Filling" | "Polishing";

const STATUSES: readonly NovelStatus[] = ["Drafting", "Filling", "Polishing"];

export interface NovelCharacter {
  name: string;
  appearance: string;
  personality: string;
  nsfw: string;
  relations: string;
}

export interface NovelChapter {
  title: string;
  plot: string;
  nsfwBeats: string;
  done: boolean;
}

export interface NovelKb {
  project: string;
  lastUpdated: string; // YYYY-MM-DD
  status: NovelStatus;
  worldBuilding: string; // 章 1
  characters: NovelCharacter[]; // 章 2
  outline: string; // 章 3
  chapterPlan: NovelChapter[]; // 章 4
  glossary: { terms: string[]; banned: string[]; preferred: string[] }; // 章 5
}

/** 五章标题（渲染与解析共用，改这里等于改格式） */
export const SECTION_TITLES = [
  "## 1. 世界观与背景 (World Building)",
  "## 2. 角色档案 (Character Profiles)",
  "## 3. 故事大纲 (Story Outline)",
  "## 4. 章节规划 (Chapter Plan)",
  "## 5. 术语与描写偏好 (Glossary & Preferences)",
] as const;

function bad(message: string, hint?: string, cause?: unknown): DramaError {
  return new DramaError("invalid_param", {
    message,
    ...(hint === undefined ? {} : { hint }),
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * 裸标量判定：保守策略——带空格、以 YAML 保留字开头、或含任何标点歧义字符的值
 * 一律用 JSON 双引号转义。宁可多引号，也不让往返解析产生歧义。
 */
const AMBIGUOUS_HEAD = "-?:,[]{}#&*!|>'\"%@`";

function needsQuoting(value: string): boolean {
  if (value === "") return true;
  if (value.trim() !== value) return true;
  const first = value[0] ?? "";
  if (AMBIGUOUS_HEAD.includes(first)) return true;
  for (const ch of value) {
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") return true;
    if (":,[]{}#&*!|>'\"%@`".includes(ch)) return true;
  }
  return false;
}

function yamlScalar(value: string): string {
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

function unquoteYaml(value: string, where: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error("非字符串");
      return parsed;
    } catch (e) {
      throw bad(`${where}：双引号包裹的值不是合法 JSON 字符串（${value}）`, "值里含引号时请用 JSON 转义", e);
    }
  }
  return value;
}

function assertDate(value: string, where: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw bad(`${where}：last_updated 必须是 YYYY-MM-DD，收到「${value}」`);
  }
  const parts = value.split("-");
  const y = Number(parts[0] ?? "");
  const m = Number(parts[1] ?? "");
  const d = Number(parts[2] ?? "");
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw bad(`${where}：last_updated 不是真实存在的日期「${value}」`);
  }
}

/** 列表项分隔（术语章的三个清单用 JSON 数组承载，避免自定义转义规则） */
function renderList(items: readonly string[]): string {
  return JSON.stringify(items);
}

function parseList(raw: string, where: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw bad(`${where}：不是合法 JSON 数组（${raw}）`, "该行必须是 [\"项\",\"项\"] 形式", e);
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
    throw bad(`${where}：必须是字符串数组（${raw}）`);
  }
  return parsed as string[];
}

function escapeField(value: string): string {
  return yamlScalar(value);
}

function parseFieldValue(raw: string, where: string): string {
  return unquoteYaml(raw.trim(), where);
}

/**
 * 渲染成 markdown。**第一行恒为 `---`**，不含任何开场白、解释或协议头。
 *
 * 空白归一：`worldBuilding` / `outline` 两侧空行被去掉（内部换行保留），
 * 因此传给 `renderKb` 的值本身就是「已归一」的文本，`parseKb` 才能精确往返。
 */
export function renderKb(kb: NovelKb): string {
  const out: string[] = [];

  out.push("---");
  out.push(`project: ${escapeField(kb.project)}`);
  out.push(`last_updated: ${kb.lastUpdated}`);
  out.push(`status: ${kb.status}`);
  out.push("---");
  out.push("");
  out.push(`# Novel Knowledge Base: ${kb.project}`);
  out.push("");

  out.push(SECTION_TITLES[0]);
  out.push("");
  if (kb.worldBuilding !== "") out.push(kb.worldBuilding);
  out.push("");

  out.push(SECTION_TITLES[1]);
  out.push("");
  for (const c of kb.characters) {
    out.push(`### 角色：${escapeField(c.name)}`);
    out.push(`- 外貌：${escapeField(c.appearance)}`);
    out.push(`- 性格：${escapeField(c.personality)}`);
    out.push(`- NSFW 属性：${escapeField(c.nsfw)}`);
    out.push(`- 关系网：${escapeField(c.relations)}`);
    out.push("");
  }

  out.push(SECTION_TITLES[2]);
  out.push("");
  if (kb.outline !== "") out.push(kb.outline);
  out.push("");

  out.push(SECTION_TITLES[3]);
  out.push("");
  for (const ch of kb.chapterPlan) {
    out.push(`- [${ch.done ? "x" : " "}] ${escapeField(ch.title)}`);
    out.push(`  - 剧情：${escapeField(ch.plot)}`);
    out.push(`  - NSFW 留白点：${escapeField(ch.nsfwBeats)}`);
  }
  out.push("");

  out.push(SECTION_TITLES[4]);
  out.push("");
  out.push(`- 术语：${renderList(kb.glossary.terms)}`);
  out.push(`- 禁用：${renderList(kb.glossary.banned)}`);
  out.push(`- 推荐：${renderList(kb.glossary.preferred)}`);
  out.push("");

  return `${out.join("\n")}\n`;
}

function failMissing(what: string, hint?: string): never {
  throw bad(`novel.kb 缺少 ${what}`, hint ?? "请按 renderKb 的格式补齐该节，不做默认值猜测");
}

function trimBlank(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") start++;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end--;
  return lines.slice(start, end);
}

/**
 * 解析 markdown → NovelKb。
 *
 * 任何格式缺口（front matter 缺字段、五章缺节、角色缺字段、章节缺子项）都抛
 * `DramaError("invalid_param")`，message 指明**缺哪一节/哪一项**。**不猜、不给默认值。**
 */
export function parseKb(md: string): NovelKb {
  const lines: string[] = md.split(/\r?\n/u);

  // ── front matter ─────────────────────────────────────────────
  if (lines.length === 0 || (lines[0] ?? "").trim() !== "---") {
    throw bad(
      "novel.kb 第一行不是 `---`（缺少 YAML front matter）",
      "文件必须以 front matter 开头；任何开场白/解释文字都属于非法内容",
    );
  }
  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trim() === "---") {
      fmEnd = i;
      break;
    }
  }
  if (fmEnd < 0) failMissing("front matter 的结束分隔符 `---`");

  const fm = new Map<string, string>();
  for (let i = 1; i < fmEnd; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") continue;
    const idx = raw.indexOf(":");
    if (idx <= 0) {
      throw bad(`novel.kb 第 ${i + 1} 行不是 front matter 的 \`key: value\` 形式：${raw}`);
    }
    const key = raw.slice(0, idx).trim();
    fm.set(key, raw.slice(idx + 1).trim());
  }

  const project = fm.get("project");
  if (project === undefined) failMissing("front matter 字段 project");
  const lastUpdated = fm.get("last_updated");
  if (lastUpdated === undefined) failMissing("front matter 字段 last_updated");
  const statusRaw = fm.get("status");
  if (statusRaw === undefined) failMissing("front matter 字段 status");

  const projectName = unquoteYaml(project, "front matter project");
  assertDate(lastUpdated, "front matter");
  const status = STATUSES.find((s) => s === statusRaw);
  if (status === undefined) {
    throw bad(
      `front matter status 取值非法：「${statusRaw}」`,
      `只允许 ${STATUSES.join(" / ")}`,
    );
  }

  // ── 五章定位 ─────────────────────────────────────────────────
  const heads: number[] = [];
  for (const title of SECTION_TITLES) {
    const idx = lines.findIndex((l) => l.trim() === title);
    if (idx < 0) failMissing(`章节「${title}」`);
    heads.push(idx);
  }
  for (let i = 1; i < heads.length; i++) {
    const prev = heads[i - 1] ?? 0;
    const cur = heads[i] ?? 0;
    if (cur < prev) {
      throw bad(`novel.kb 章节顺序错乱：${SECTION_TITLES[i] ?? ""} 出现在前一章之前`);
    }
  }

  // front matter 结束到第 1 章之间只允许空行与一级标题——多一个字都算「开场白」
  for (let i = fmEnd + 1; i < (heads[0] ?? 0); i++) {
    const t = (lines[i] ?? "").trim();
    if (t === "") continue;
    if (t.startsWith("# Novel Knowledge Base:")) continue;
    throw bad(
      `novel.kb 第 ${i + 1} 行是 front matter 与第 1 章之间的多余文字：${t}`,
      "该区间只允许一级标题 `# Novel Knowledge Base: ...`（开场白/解释文字一律非法）",
    );
  }

  const bodyOf = (n: number): string[] => {
    const start = (heads[n - 1] ?? 0) + 1;
    const end = n < 5 ? (heads[n] ?? lines.length) : lines.length;
    return lines.slice(start, end);
  };

  // 第 1 章：世界观
  const worldLines = trimBlank(bodyOf(1));
  const worldBuilding = worldLines.join("\n");

  // 第 2 章：角色档案
  const characters: NovelCharacter[] = [];
  {
    const raw = trimBlank(bodyOf(2));
    let cur: { name: string; fields: Map<string, string>; at: number } | null = null;
    const flush = (): void => {
      if (cur === null) return;
      const need = ["外貌", "性格", "NSFW 属性", "关系网"] as const;
      for (const f of need) {
        if (!cur.fields.has(f)) {
          throw bad(
            `第 2 章角色「${cur.name}」缺少字段「${f}」`,
            `第 ${cur.at} 行开始的角色块必须含 - 外貌 / - 性格 / - NSFW 属性 / - 关系网`,
          );
        }
      }
      characters.push({
        name: cur.name,
        appearance: cur.fields.get("外貌") ?? "",
        personality: cur.fields.get("性格") ?? "",
        nsfw: cur.fields.get("NSFW 属性") ?? "",
        relations: cur.fields.get("关系网") ?? "",
      });
      cur = null;
    };

    for (const [offset, line] of raw.entries()) {
      if (line.trim() === "") continue;
      const lineNo = (heads[1] ?? 0) + 2 + offset; // 1-based 行号（heads 是 0-based 下标）
      const headMatch = /^### 角色：(.+)$/u.exec(line.trim());
      if (headMatch !== null) {
        flush();
        cur = {
          name: parseFieldValue(headMatch[1] ?? "", "第 2 章角色名"),
          fields: new Map<string, string>(),
          at: lineNo,
        };
        continue;
      }
      if (cur === null) {
        throw bad(`第 2 章出现不属于任何角色的内容：${line.trim()}`, "角色块必须以 `### 角色：<名>` 起头");
      }
      const fieldMatch = /^- (外貌|性格|NSFW 属性|关系网)：(.*)$/u.exec(line.trim());
      if (fieldMatch === null) {
        throw bad(`第 2 章角色「${cur.name}」下有无法识别的行：${line.trim()}`);
      }
      const key = fieldMatch[1] ?? "";
      cur.fields.set(key, parseFieldValue(fieldMatch[2] ?? "", `第 2 章「${cur.name}」的 ${key}`));
    }
    flush();
  }

  // 第 3 章：故事大纲
  const outline = trimBlank(bodyOf(3)).join("\n");

  // 第 4 章：章节规划
  const chapterPlan: NovelChapter[] = [];
  {
    const raw = trimBlank(bodyOf(4));
    let cur: { title: string; done: boolean; plot?: string; beats?: string } | null = null;
    const flush = (): void => {
      if (cur === null) return;
      if (cur.plot === undefined) throw bad(`第 4 章章节「${cur.title}」缺少「剧情」子项`);
      if (cur.beats === undefined) throw bad(`第 4 章章节「${cur.title}」缺少「NSFW 留白点」子项`);
      chapterPlan.push({ title: cur.title, plot: cur.plot, nsfwBeats: cur.beats, done: cur.done });
      cur = null;
    };
    for (const line of raw) {
      if (line.trim() === "") continue;
      const head = /^- \[([ xX])\] (.*)$/u.exec(line.trim());
      if (head !== null) {
        flush();
        const mark = head[1] ?? " ";
        cur = {
          title: parseFieldValue(head[2] ?? "", "第 4 章章节标题"),
          done: mark.toLowerCase() === "x",
        };
        continue;
      }
      if (cur === null) {
        throw bad(`第 4 章出现不属于任何章节的内容：${line.trim()}`, "章节必须写成 `- [ ] 标题`");
      }
      const sub = /^- (剧情|NSFW 留白点)：(.*)$/u.exec(line.trim());
      if (sub === null) {
        throw bad(`第 4 章章节「${cur.title}」下有无法识别的行：${line.trim()}`);
      }
      const key = sub[1] ?? "";
      const value = parseFieldValue(sub[2] ?? "", `第 4 章「${cur.title}」的 ${key}`);
      if (key === "剧情") cur.plot = value;
      else cur.beats = value;
    }
    flush();
  }

  // 第 5 章：术语与描写偏好
  let terms: string[] = [];
  let banned: string[] = [];
  let preferred: string[] = [];
  {
    const raw = trimBlank(bodyOf(5));
    const seen = new Set<string>();
    for (const line of raw) {
      if (line.trim() === "") continue;
      const m = /^- (术语|禁用|推荐)：(.*)$/u.exec(line.trim());
      if (m === null) {
        throw bad(`第 5 章有无法识别的行：${line.trim()}`, "只允许 `- 术语：` / `- 禁用：` / `- 推荐：`");
      }
      const key = m[1] ?? "";
      if (seen.has(key)) throw bad(`第 5 章「${key}」重复出现`);
      seen.add(key);
      const list = parseList(m[2] ?? "", `第 5 章「${key}」`);
      if (key === "术语") terms = list;
      else if (key === "禁用") banned = list;
      else preferred = list;
    }
    for (const key of ["术语", "禁用", "推荐"]) {
      if (!seen.has(key)) failMissing(`第 5 章的「${key}」清单`);
    }
  }

  return {
    project: projectName,
    lastUpdated,
    status,
    worldBuilding,
    characters,
    outline,
    chapterPlan,
    glossary: { terms, banned, preferred },
  };
}

/** novel.kb 的落地路径 */
export function kbPath(dir: string): string {
  return join(dir, NOVEL_KB_FILENAME);
}

/**
 * 原子写 novel.kb。**要么整份写成功，要么旧文件原样保留。**
 *
 * 顺序：mkdir → 同目录临时文件 → write → fsync → close → rename。
 * 失败时清掉临时文件（清理失败不掩盖原始错误）后原样上抛。
 *
 * 与 `config/save.ts` 的差异（故不复用）：novel.kb 是普通项目内容，不做 0600/0700
 * 密钥级权限收紧——它的权限语义跟随项目目录，改权限会破坏用户自己设的共享设置。
 *
 * @returns 写入的绝对路径
 */
export async function writeKb(dir: string, kb: NovelKb): Promise<string> {
  const target = kbPath(dir);
  const body = renderKb(kb);

  await mkdir(dir, { recursive: true });

  const temp = `${target}.${process.pid}.tmp`;
  try {
    const handle = await open(temp, "w");
    try {
      await handle.writeFile(body, "utf8");
      // 先 fsync 再 close：避免 rename 之后出现「文件名在、内容空」的崩溃窗口
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } catch (e) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw new DramaError("invalid_param", {
      message: `novel.kb 写盘失败：${target}`,
      cause: e,
    });
  }
  return target;
}

/**
 * 读 novel.kb 并解析。文件不存在 → `invalid_param`（不返回空壳、不猜默认值）。
 */
export async function readKb(dir: string): Promise<NovelKb> {
  const target = kbPath(dir);
  let md: string;
  try {
    md = await readFile(target, "utf-8");
  } catch (e) {
    throw new DramaError("invalid_param", {
      message: `读不到 novel.kb：${target}`,
      hint: "项目还没有初始化 novel.kb（阶段一结束后才应存在）",
      cause: e,
    });
  }
  return parseKb(md);
}
