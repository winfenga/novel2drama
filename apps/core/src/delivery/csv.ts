/**
 * M10-4 · CSV 数据表（一行一镜）。
 *
 * 依据：`docs/api-contract.md` §8.5.7（L1195-1215）、`docs/m101314-spec.md` §2.2。
 *
 * 硬约束：
 * - 14 列，顺序固定（下面 `CSV_COLUMNS` 逐字照抄契约，一个不多一个不少）
 * - `startSec` / `endSec` / `durationSec` 三位小数
 * - `taskType` 小写（六个值之一）
 * - `chainSegment` 单段填 1（连链才递增，本轮不做连链）
 * - **UTF-8 with BOM**（`\uFEFF` 开头），否则 Excel 打开中文乱码
 * - 字段含逗号 / 引号 / 换行 → RFC4180 转义（整段加引号，内部 `"` 双写）
 */

import { DramaError } from "@text2drama/shared";
import type { EpisodeTimeline, TimelineLine, TimelineShot } from "./timeline.js";

/**
 * 列顺序固定，逐字照抄契约（`m101314-spec.md` §2.2 / `api-contract.md` L1198）：
 *
 * `shotId,shotCode,sceneCode,startSec,endSec,durationSec,videoFile,dialogue,
 *  dialogueStartSec,dialogueEndSec,voicedBy,taskType,chainSegment`
 *
 * ⚠️ 契约文字写「14 列」，但**逐字列出的只有 13 个**，且 api-contract L1199 的示例行
 * 也是 13 个字段。这里以**列名字面清单**为准（13 列）——补齐第 14 列等于发明契约外的字段。
 * 已在 `docs/worklog/M10.md` 记 `[CORRECTION #2]`，等主会话裁决。
 */
export const CSV_COLUMNS = [
  "shotId",
  "shotCode",
  "sceneCode",
  "startSec",
  "endSec",
  "durationSec",
  "videoFile",
  "dialogue",
  "dialogueStartSec",
  "dialogueEndSec",
  "voicedBy",
  "taskType",
  "chainSegment",
] as const;

/** BOM —— 首字节必须是它 */
export const UTF8_BOM = "\uFEFF";

/** 三位小数（`toFixed` 保证 5 → `5.000`，不会出现 `5` 或科学计数法） */
function sec3(sec: number): string {
  return sec.toFixed(3);
}

/** RFC4180：含逗号/引号/换行或首尾有空白 → 整段加引号，内部 `"` 双写 */
export function escapeCsvField(value: string): string {
  const needsQuote = /[",\r\n]/.test(value) || /^\s|\s$/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/** 该镜承担的台词：所有与之时间重叠的台词，按全集顺序拼接 */
function linesForShot(shot: TimelineShot, lines: TimelineLine[]): TimelineLine[] {
  return lines.filter(
    (l) => l.globalStartSec < shot.endSec - 1e-9 && l.globalEndSec > shot.startSec + 1e-9,
  );
}

export function renderCsv(t: EpisodeTimeline): string {
  if (t.shots.length === 0) {
    throw new DramaError("delivery_incomplete", {
      message: "该集没有任何镜头，生成不出 CSV",
      details: { episodeId: t.episodeId, reason: "no_shots" },
    });
  }

  // 音轨必须存在（CSV 不写音轨列，但缺音轨 = 时间轴不完整，宁可导不出来）
  if (t.audioPath.trim() === "") {
    throw new DramaError("delivery_incomplete", {
      message: "全集音轨缺失，拒绝导出 CSV",
      details: { episodeId: t.episodeId, reason: "missing_audio" },
    });
  }

  const rows: string[] = [CSV_COLUMNS.join(",")];

  for (const shot of t.shots) {
    const overlapping = linesForShot(shot, t.lines);
    // 多句落在同一镜：按全集顺序用空格拼（不按比例切文本——切文本是猜）
    const dialogue = overlapping.map((l) => l.text).join(" ");
    const dStart = overlapping.length > 0 ? Math.min(...overlapping.map((l) => l.globalStartSec)) : NaN;
    const dEnd = overlapping.length > 0 ? Math.max(...overlapping.map((l) => l.globalEndSec)) : NaN;
    const speaker = overlapping.length > 0 ? (overlapping[0]?.speakerCode ?? "") : "";

    const fields = [
      shot.shotId,
      shot.shotCode,
      shot.sceneCode,
      sec3(shot.startSec),
      sec3(shot.endSec),
      sec3(shot.endSec - shot.startSec),
      basename(shot.videoPath),
      dialogue,
      overlapping.length > 0 ? sec3(dStart) : "",
      overlapping.length > 0 ? sec3(dEnd) : "",
      speaker,
      // taskType 小写；拿不到就留空（不猜默认值）
      shot.taskType === undefined ? "" : shot.taskType.toLowerCase(),
      // 本轮不做连链，单段恒填 1
      "1",
    ];

    if (fields.length !== CSV_COLUMNS.length) {
      throw new DramaError("invalid_param", {
        message: `CSV 列数错位：期望 ${CSV_COLUMNS.length}，实际 ${fields.length}`,
        details: { episodeId: t.episodeId, shotId: shot.shotId },
      });
    }

    rows.push(fields.map(escapeCsvField).join(","));
  }

  return `${UTF8_BOM}${rows.join("\r\n")}\r\n`;
}
