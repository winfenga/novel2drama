/**
 * M10-2 · FCPXML（主交付）。
 *
 * 依据：`docs/api-contract.md` §8.5.4（L1120-1157）、§8.5.5（L1159-1171）、
 * `docs/m101314-spec.md` §2.2。
 *
 * 四条硬约束：
 * 1. `frameDuration="100/${fps*100}s"` —— fps **跟随交付帧率**（24→`100/2400s`，48→`100/4800s`）
 * 2. 时长写成**分数** `${frames}/${fps}s`，**绝不用小数秒**（`5.125s` 在 24 镜后会偏一帧）
 * 3. `offset` 累加（第 N 镜 offset = 前面所有镜 duration 之和）
 * 4. 音频**单独一条 lane（`lane="-1"`）整条铺满**，不切碎（切点处气口/混响会被切断，
 *    换镜头顺序切点全废，跨镜台词前后音对不上）
 */

import type { EpisodeTimeline } from "./timeline.js";

export interface FcpxmlOptions {
  projectName: string;
  /** 素材根：可以是 `file:///...`，也可以是 Windows 绝对路径 `D:\...`（会被转成 file URL） */
  assetBaseUrl: string;
}

/** XML 五实体转义：`& < > " '` 全转 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * URI 里必须百分号编码的字符（只编码会破坏 URI 解析的，中文等保留原样——
 * FCPXML 是 UTF-8，剪映/FCP 都吃得下；把中文全编码反而没法人工核对路径）。
 */
function encodeUriPath(p: string): string {
  return p.replace(/%/g, "%25").replace(/ /g, "%20").replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/**
 * 本地路径 → file URL。
 * - `D:\a\b` / `D:/a/b` → `file:///D:/a/b`（盘符后补斜杠）
 * - `\\server\share\x` → `file://server/share/x`
 * - `/a/b` → `file:///a/b`
 * - 已是 `file://` → 只归一化反斜杠
 * - 相对路径原样返回（调用方没给绝对根时，宁可暴露相对路径也不编一个假盘符）
 */
export function toFileUrl(p: string): string {
  const raw = p.replace(/\\/g, "/");

  if (/^file:\/\//i.test(raw)) return raw;

  // UNC：\\server\share → //server/share
  if (raw.startsWith("//")) return `file:${encodeUriPath(raw)}`;

  // Windows 盘符
  const drive = /^([A-Za-z]):(\/|$)/.exec(raw);
  if (drive !== null) {
    const rest = raw.slice(2);
    return `file:///${drive[1]}:${encodeUriPath(rest.startsWith("/") ? rest : `/${rest}`)}`;
  }

  // POSIX 绝对路径
  if (raw.startsWith("/")) return `file://${encodeUriPath(raw)}`;

  return encodeUriPath(raw);
}

/** 拼接素材根与相对路径，避免双斜杠 */
function joinUrl(base: string, rel: string): string {
  const b = base.replace(/\\/g, "/").replace(/\/+$/, "");
  const r = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return r === "" ? b : `${b}/${r}`;
}

/** 分数时长 —— 分母恒为交付帧率，不做约分（契约要求「分母统一」） */
function frac(frames: number, fps: number): string {
  return `${frames}/${fps}s`;
}

export function renderFcpxml(t: EpisodeTimeline, opts: FcpxmlOptions): string {
  const fps = t.fps;
  const base = toFileUrl(opts.assetBaseUrl);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<!DOCTYPE fcpxml>");
  lines.push('<fcpxml version="1.9">');
  lines.push("  <resources>");
  lines.push(
    `    <format id="r1" name="${escapeXml(`FFVideoFormat1080x1920p${fps}`)}" ` +
      `frameDuration="100/${fps * 100}s" width="1080" height="1920"/>`,
  );

  // 视频素材：一镜一个 asset，id 从 a1 起
  t.shots.forEach((s, i) => {
    lines.push(
      `    <asset id="a${i + 1}" name="${escapeXml(s.shotCode)}" ` +
        `src="${escapeXml(joinUrl(base, s.videoPath))}" ` +
        `start="0s" duration="${frac(s.durationFrames, fps)}" format="r1" hasVideo="1"/>`,
    );
  });

  // 音频素材：全集连续一条（不是每镜一个文件）
  const audioId = `a${t.shots.length + 1}`;
  lines.push(
    `    <asset id="${audioId}" name="${escapeXml(`${t.episodeId}_voice`)}" ` +
      `src="${escapeXml(joinUrl(base, t.audioPath))}" ` +
      `start="0s" duration="${frac(t.totalFrames, fps)}" hasAudio="1"/>`,
  );
  lines.push("  </resources>");

  lines.push("  <library>");
  lines.push(`    <event name="${escapeXml(opts.projectName)}">`);
  lines.push(`      <project name="${escapeXml(opts.projectName)}">`);
  lines.push(`        <sequence format="r1" duration="${frac(t.totalFrames, fps)}" tcStart="0s">`);
  lines.push("          <spine>");

  // 视频轨：offset 累加，无空隙无重叠
  let offsetFrames = 0;
  t.shots.forEach((s, i) => {
    lines.push(
      `            <asset-clip ref="a${i + 1}" offset="${frac(offsetFrames, fps)}" ` +
        `duration="${frac(s.durationFrames, fps)}" start="0s"/>`,
    );
    offsetFrames += s.durationFrames;
  });

  // 音频轨：单独 lane，整条铺满，不切碎
  lines.push(
    `            <asset-clip ref="${audioId}" lane="-1" offset="${frac(0, fps)}" ` +
      `duration="${frac(t.totalFrames, fps)}" start="0s"/>`,
  );

  lines.push("          </spine>");
  lines.push("        </sequence>");
  lines.push("      </project>");
  lines.push("    </event>");
  lines.push("  </library>");
  lines.push("</fcpxml>");
  lines.push("");

  return lines.join("\n");
}
