/**
 * M0-6 · 审计日志
 *
 * 依据 `docs/m0-spec.md` §5.4（冻结签名，一个字没改）、§6（只有 `dispatch()` 写审计）。
 * 存储形态：`$DRAMA_HOME/logs/tools-YYYYMMDD.jsonl`，追加写，按**本地时区**日期切分。
 *
 * 铁律：**本模块永不向调用方抛异常**。审计是旁路，业务不能因为日志落不下去而失败。
 * 这也是全项目唯一允许吞异常的地方（见 `docs/m0-spec.md` §8）。
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { AuditSource } from "@text2drama/shared";

export interface AuditEntry {
  ts: string; // ISO8601 UTC
  name: string;
  requestId: string;
  source: AuditSource;
  inputHash: string; // sha256(input JSON) 前 16 位 hex
  ok: boolean;
  code: string | null;
  elapsedMs: number;
}

export interface AuditLogger {
  /** 追加一行 jsonl；目录不存在自动建；失败不抛（审计不能拖垮业务），但要 console.error */
  write(entry: AuditEntry): void;
  read(opts?: { from?: string; to?: string; name?: string }): AuditEntry[];
  /** 30 天前的 tools-*.jsonl 删掉 */
  prune(olderThanDays?: number): number;
}

const FILE_PREFIX = "tools-";
const FILE_SUFFIX = ".jsonl";
const FILE_NAME_RE = /^tools-(\d{8})\.jsonl$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_KEEP_DAYS = 30;

/** 两位补零，避免 Intl / toISOString 的时区陷阱（后者永远走 UTC）*/
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 本地时区的 YYYYMMDD —— 按天切分要跟用的人眼里的「今天」对齐，不是 UTC 的今天 */
function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 纯日期（`2026-11-10` / `20261110`）没有时间部分，不做时区换算，直接当本地日期键 */
function parseDateOnly(v: string): string | undefined {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (!m) return undefined;
  const y = m[1];
  const mo = m[2];
  const da = m[3];
  if (y === undefined || mo === undefined || da === undefined) return undefined;
  return `${y}${mo}${da}`;
}

/** 带时间部分的输入才需要走到时区换算 */
function hasTimePart(v: string): boolean {
  return /[T\s]\d{2}:\d{2}/.test(v);
}

/** 任意时间字符串 → 本地日期键（用于文件名粗筛）；认不出来返回 undefined（则不做该项筛选）*/
function toDateKey(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  if (trimmed === "") return undefined;
  const dateOnly = parseDateOnly(trimmed);
  if (dateOnly !== undefined) return dateOnly;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return undefined;
  return dateKeyLocal(new Date(t));
}

export function hashInput(input: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    // 循环引用 / 带 toJSON 的恶意对象会让 JSON.stringify 抛错。
    // 审计摘要拿不到就算了，不能反过来把业务打断，用哨兵值占位。
    return "unhashable";
  }
  if (typeof json !== "string") {
    // JSON.stringify(undefined) / 函数 / symbol 的运行时返回值其实是 undefined
    return "unhashable";
  }
  return createHash("sha256").update(json, "utf8").digest("hex").slice(0, 16);
}

export function createAuditLogger(opts: { dir: string; now?: () => Date }): AuditLogger {
  const dir = opts.dir;
  const now: () => Date = opts.now ?? (() => new Date());

  function ensureDir(): void {
    mkdirSync(dir, { recursive: true });
  }

  function write(entry: AuditEntry): void {
    const day = dateKeyLocal(now());
    const file = join(dir, `${FILE_PREFIX}${day}${FILE_SUFFIX}`);
    const line = `${JSON.stringify(entry)}\n`;
    try {
      ensureDir();
      appendFileSync(file, line, "utf8");
    } catch (e) {
      // 【全项目唯一允许吞异常处】审计是旁路：磁盘满、权限不足、路径被占——
      // 这些都不该让一个本来成功的工具调用变成 500。留痕给运维即可。
      console.error(`[audit] write failed file=${file}`, e);
    }
  }

  function read(readOpts?: { from?: string; to?: string; name?: string }): AuditEntry[] {
    const out: AuditEntry[] = [];
    if (!existsSync(dir)) return out;

    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (e) {
      // 读目录失败同样不抛：查询接口拿到空列表比 500 更有用
      console.error(`[audit] readdir failed dir=${dir}`, e);
      return out;
    }

    const fromRaw = readOpts?.from;
    const toRaw = readOpts?.to;
    const nameFilter = readOpts?.name;

    const fromDay = toDateKey(fromRaw);
    const toDay = toDateKey(toRaw);

    // 精确时间边界只在输入带时间部分时启用：纯日期 `2026-11-10` 若拿去 Date.parse
    // 会被当成 UTC 零点，反而把本地当天的前 8 小时切掉，所以纯日期只走文件名粗筛。
    let fromMs: number | undefined;
    let toMs: number | undefined;
    if (fromRaw !== undefined && hasTimePart(fromRaw)) {
      const t = Date.parse(fromRaw);
      if (!Number.isNaN(t)) fromMs = t;
    }
    if (toRaw !== undefined && hasTimePart(toRaw)) {
      const t = Date.parse(toRaw);
      if (!Number.isNaN(t)) toMs = t;
    }

    const files: { day: string; file: string }[] = [];
    for (const n of names) {
      const m = FILE_NAME_RE.exec(n);
      if (!m) continue;
      const day = m[1];
      if (day === undefined) continue;
      if (fromDay !== undefined && day < fromDay) continue; // YYYYMMDD 字典序 == 时间序
      if (toDay !== undefined && day > toDay) continue;
      files.push({ day, file: n });
    }
    files.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    for (const { file } of files) {
      let raw: string;
      try {
        raw = readFileSync(join(dir, file), "utf8");
      } catch (e) {
        console.error(`[audit] read failed file=${file}`, e);
        continue;
      }
      let badLines = 0;
      for (const line of raw.split(/\r?\n/)) {
        if (line.trim() === "") continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          // 单行损坏（写一半被杀 / 手工误编辑）不能连累整份日志
          badLines += 1;
          continue;
        }
        if (typeof parsed !== "object" || parsed === null) {
          badLines += 1;
          continue;
        }
        const entry = parsed as AuditEntry;
        if (nameFilter !== undefined && entry.name !== nameFilter) continue;
        if (fromMs !== undefined || toMs !== undefined) {
          const tsMs = Date.parse(entry.ts);
          if (!Number.isNaN(tsMs)) {
            if (fromMs !== undefined && tsMs < fromMs) continue;
            if (toMs !== undefined && tsMs > toMs) continue;
          }
        }
        out.push(entry);
      }
      if (badLines > 0) {
        console.warn(`[audit] skipped ${badLines} malformed line(s) file=${file}`);
      }
    }

    return out;
  }

  function prune(olderThanDays = DEFAULT_KEEP_DAYS): number {
    const days = Number.isFinite(olderThanDays) ? olderThanDays : DEFAULT_KEEP_DAYS;
    if (!existsSync(dir)) return 0;

    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (e) {
      console.error(`[audit] prune readdir failed dir=${dir}`, e);
      return 0;
    }

    const cutoff = new Date(now().getTime() - Math.max(0, days) * DAY_MS);
    const cutoffDay = dateKeyLocal(cutoff);
    let removed = 0;
    for (const n of names) {
      const m = FILE_NAME_RE.exec(n);
      if (!m) continue;
      const day = m[1];
      if (day === undefined) continue;
      if (day >= cutoffDay) continue; // 正好 N 天前的那天保留，只删更早的
      try {
        unlinkSync(join(dir, n));
        removed += 1;
      } catch (e) {
        // 单个文件删不掉（被占用 / 权限）不阻断其余清理
        console.error(`[audit] prune unlink failed file=${n}`, e);
      }
    }
    return removed;
  }

  return { write, read, prune };
}
