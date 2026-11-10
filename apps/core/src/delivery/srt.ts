/**
 * M10-3 · SRT 字幕。
 *
 * 依据：`docs/api-contract.md` §8.5.6（L1173-1193）、`docs/m101314-spec.md` §2.2。
 *
 * 三条约定：
 * 1. 时间戳是**全集绝对时间**，与 FCPXML 完全一致（`HH:MM:SS,mmm`）
 * 2. **一条字幕 = 一句台词**，跨镜头的合并成一条（`shotIds.length > 1` 时不拆）
 * 3. 超 **20 字**自动折行，用 `\N`（SRT 软换行），按句意断，不硬切
 *
 * 另外两条底线：无重叠时间戳、无空文本块。
 */

import { DramaError } from "@text2drama/shared";
import type { EpisodeTimeline, TimelineLine } from "./timeline.js";

/** 软换行上限（汉字按字符计） */
export const SRT_WRAP_CHARS = 20;

/** 句意断点：中英文标点（断在标点**后面**） */
const CLAUSE_RE = /[^，。！？、；：,.!?;:…—]*[，。！？、；：,.!?;:…—]*/g;

/** 秒 → `HH:MM:SS,mmm`（四舍五入到毫秒，与 CSV 三位小数同口径） */
export function formatSrtTime(sec: number): string {
  const totalMs = Math.round(sec * 1000);
  const clamped = Math.max(0, totalMs);
  const ms = clamped % 1000;
  const totalSec = Math.floor(clamped / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w: number): string => String(n).padStart(w, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/**
 * 超 20 字折行。
 *
 * 先按标点切句，再按目标宽度（`ceil(len / ceil(len/20))`）贪心装行：
 * 断点优先落在目标位置 ±4 字内的标点上（按句意断），附近没标点才在目标处断。
 * 无标点的长串只能硬断——中文没空格可切，这是唯一的确定性做法。
 */
export function wrapSubtitle(text: string, limit: number = SRT_WRAP_CHARS): string[] {
  const flat = text.replace(/\r?\n/g, "").trim();
  if (flat === "") return [];
  if (flat.length <= limit) return [flat];

  // 切句：句段自带尾随标点，空段丢弃；切不动就整串当一个句段（后面硬断）
  const clauses = (flat.match(CLAUSE_RE) ?? [flat]).filter((c) => c !== "");
  const src = clauses.length > 0 ? clauses : [flat];

  // 行数按字数定，目标宽度 = 均分后的宽度 → 行不会一长一短
  const maxLines = Math.max(1, Math.ceil(flat.length / limit));
  const target = Math.max(1, Math.ceil(flat.length / maxLines));

  const out: string[] = [];
  let buf = "";
  for (const clause of src) {
    let rest = clause;
    // 单个句段自己就超长：先把它硬断成 limit 段
    while (rest.length > limit) {
      if (buf !== "") {
        out.push(buf);
        buf = "";
      }
      out.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (rest === "") continue;
    // 加上这句会超过目标宽度 → 在句段边界收行（按句意断）
    if (buf !== "" && buf.length + rest.length > target) {
      out.push(buf);
      buf = rest;
    } else {
      buf += rest;
    }
  }
  if (buf !== "") out.push(buf);

  // 末行成孤字（< 4 字）且前一行装得下 → 并回前一行
  if (out.length >= 2) {
    const last = out[out.length - 1] ?? "";
    const prevIdx = out.length - 2;
    const prev = out[prevIdx] ?? "";
    if (last.length < 4 && prev.length + last.length <= limit) {
      out.splice(prevIdx, 2, prev + last);
    }
  }
  return out;
}

/** 一条台词 → SRT 正文（软换行用 `\N`） */
function subtitleBody(text: string): string {
  return wrapSubtitle(text).join("\\N");
}

/** SRT 时间块（precheck 第 7 项用它验「无重叠 / 无空块」） */
export interface SrtBlock {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  dialogueLineId: string;
}

/** 构造字幕块：一条台词一块，跨镜台词合并（不按镜头切） */
export function buildSrtBlocks(t: EpisodeTimeline): SrtBlock[] {
  const lines = [...t.lines].sort(
    (a, b) => a.globalStartSec - b.globalStartSec || a.dialogueLineId.localeCompare(b.dialogueLineId),
  );

  const blocks: SrtBlock[] = [];
  lines.forEach((l: TimelineLine, i: number) => {
    const next = lines[i + 1];
    const startMs = Math.round(l.globalStartSec * 1000);
    let endMs = Math.round(l.globalEndSec * 1000);
    // 字幕块不得重叠：结束时间不越过下一条的开始（播放器会因此吞字/闪字）
    if (next !== undefined) {
      endMs = Math.min(endMs, Math.round(next.globalStartSec * 1000));
    }
    if (endMs < startMs) endMs = startMs;

    blocks.push({
      index: blocks.length + 1,
      startMs,
      endMs,
      text: subtitleBody(l.text),
      dialogueLineId: l.dialogueLineId,
    });
  });
  return blocks;
}

export function renderSrt(t: EpisodeTimeline): string {
  const blocks = buildSrtBlocks(t);

  if (blocks.length === 0) {
    throw new DramaError("delivery_incomplete", {
      message: "该集没有任何台词，生成不出 SRT",
      details: { episodeId: t.episodeId, reason: "no_dialogue_lines" },
    });
  }

  const chunks: string[] = [];
  for (const b of blocks) {
    if (b.text.trim() === "" || b.endMs <= b.startMs) {
      throw new DramaError("delivery_incomplete", {
        message: `字幕块 ${b.index} 为空或时长为 0（台词 ${b.dialogueLineId}）`,
        details: {
          episodeId: t.episodeId,
          dialogueLineId: b.dialogueLineId,
          startMs: b.startMs,
          endMs: b.endMs,
        },
      });
    }
    chunks.push(`${b.index}\n${msToSrt(b.startMs)} --> ${msToSrt(b.endMs)}\n${b.text}\n`);
  }

  // 块之间空一行，末尾空行（SRT 规范）
  return `${chunks.join("\n")}\n`;
}

function msToSrt(ms: number): string {
  return formatSrtTime(ms / 1000);
}
