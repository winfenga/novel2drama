/**
 * M10-7 · 纯拼成片（本轮新增，原 WBS 漏项）。
 *
 * 依据：`docs/decision-log.md` §22.4 + §21（拼接 = 纯拼 + 音轨）、
 * `docs/api-contract.md` §8.5.3（L1106-1118 产物含 `ep01.mp4`）、`docs/m101314-spec.md` §2.2。
 *
 * **无转场、不烧字幕、不加 BGM**——三者都是已裁决的「不做」。
 *
 * 做法：`-f concat -safe 0 -i list.txt` 拼视频段 + 贴全集音轨。
 * **失败不许留半成品**：先写 `outPath.tmp`，成功后 rename；失败先删 tmp 再抛。
 */

import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DramaError } from "@text2drama/shared";
import type { EpisodeTimeline } from "./timeline.js";

export interface ConcatResult {
  mp4Path: string;
  totalFrames: number;
  bytes: number;
}

/** concat 列表文件名（与 outPath 同目录，避免跨盘 rename） */
export const CONCAT_LIST_NAME = "concat_list.txt";

/**
 * concat demuxer 的列表内容：`file '<路径>'`，单引号内的 `'` 要写成 `'\''`。
 * 路径统一成正斜杠——ffmpeg 在 Windows 上也认，反斜杠会被当转义符。
 */
export function renderConcatList(paths: string[]): string {
  if (paths.length === 0) {
    throw new DramaError("delivery_incomplete", {
      message: "没有任何视频段可拼",
      details: { reason: "no_shots" },
    });
  }
  const rows = paths.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  return `${rows.join("\n")}\n`;
}

/**
 * 相对的素材路径落到**成片所在目录**下。
 *
 * `videoPath` 是相对路径（`video/SC-01.mp4`），而 concat demuxer 解析相对路径的口径
 * 依赖 cwd，跨机器不保稳。成片目录按 api-contract §8.5.3 的布局就是 `video/` 的父目录，
 * 所以在拼之前统一解析成绝对路径，与 cwd 无关。
 */
export function resolveAssetPath(baseDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(baseDir, p);
}

/** ffmpeg 参数：concat 视频 + 全集音轨，重编码到统一规格（各镜可能分辨率/帧率不一） */
export function buildFfmpegArgs(opts: {
  listPath: string;
  audioPath: string;
  outTmpPath: string;
  fps: number;
}): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    opts.listPath,
    "-i",
    opts.audioPath,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-r",
    String(opts.fps),
    "-shortest",
    // mp4 必须 faststart 才能边下边播
    "-movflags",
    "+faststart",
    opts.outTmpPath,
  ];
}

/**
 * 拼成片。
 *
 * `run` 由 deps 注入（测试 mock，零真实子进程）。
 * 流程：写 list.txt → 跑 ffmpeg 到 `outPath.tmp` → 成功才 rename 到 outPath。
 * 任何一步失败：删 tmp / list，抛 `video2x_failed`（错误码表里唯一的「子进程失败」码）。
 */
export async function concatEpisode(opts: {
  t: EpisodeTimeline;
  outPath: string;
  ffmpegPath: string;
  run: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}): Promise<ConcatResult> {
  const { t, outPath, ffmpegPath, run } = opts;

  if (t.shots.length === 0) {
    throw new DramaError("delivery_incomplete", {
      message: "该集没有任何镜头，拼不出成片",
      details: { episodeId: t.episodeId, reason: "no_shots" },
    });
  }
  if (t.audioPath.trim() === "") {
    throw new DramaError("delivery_incomplete", {
      message: "全集音轨缺失，拒绝拼片（不出无声成片）",
      details: { episodeId: t.episodeId, reason: "missing_audio" },
    });
  }

  const missing = t.shots.filter((s) => s.videoPath.trim() === "");
  if (missing.length > 0) {
    throw new DramaError("delivery_incomplete", {
      message: `${missing.length} 个镜头没有视频文件，拒绝拼片`,
      details: {
        episodeId: t.episodeId,
        gaps: missing.map((s) => ({ kind: "missing_video", shotId: s.shotId, shotCode: s.shotCode })),
      },
    });
  }

  const outDir = dirname(outPath);
  const tmpPath = `${outPath}.tmp`;
  const listPath = join(outDir, CONCAT_LIST_NAME);

  await mkdir(outDir, { recursive: true });
  await writeFile(
    listPath,
    renderConcatList(t.shots.map((s) => resolveAssetPath(outDir, s.videoPath))),
    "utf8",
  );

  const args = buildFfmpegArgs({
    listPath,
    audioPath: resolveAssetPath(outDir, t.audioPath),
    outTmpPath: tmpPath,
    fps: t.fps,
  });

  try {
    await run(ffmpegPath, args);
  } catch (e) {
    // 失败：先清 tmp 与 list，再抛（不许留半成品；也不许吞掉真实原因）
    await rm(tmpPath, { force: true });
    await rm(listPath, { force: true });
    const reason = e instanceof Error ? e.message : String(e);
    throw new DramaError("video2x_failed", {
      message: `ffmpeg 拼接失败：${reason}`,
      details: { episodeId: t.episodeId, cmd: ffmpegPath, args, stderr: reason },
      cause: e,
    });
  }

  // 成功后才 rename（同目录，原子替换）
  try {
    const st = await stat(tmpPath);
    await rename(tmpPath, outPath);
    await rm(listPath, { force: true });
    return { mp4Path: outPath, totalFrames: t.totalFrames, bytes: st.size };
  } catch (e) {
    await rm(tmpPath, { force: true });
    await rm(listPath, { force: true });
    throw new DramaError("video2x_failed", {
      message: `拼接产物落盘失败（tmp 已清理，未产生 ${outPath}）`,
      details: { episodeId: t.episodeId, outPath, cause: e instanceof Error ? e.message : String(e) },
      cause: e,
    });
  }
}
