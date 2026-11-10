/**
 * M10 · 交付模块出口（三件套 + 校验 + 纯拼成片）。
 *
 * 依据：`docs/m101314-spec.md` §2.1 文件归属。M14 从 `delivery/index.js` 取用，
 * 不直接 import 各子模块文件，便于后续替换实现。
 */

export {
  buildTimeline,
  readGaps,
} from "./timeline.js";
export type {
  EpisodeTimeline,
  TimelineGap,
  TimelineGapDetails,
  TimelineGapKind,
  TimelineLine,
  TimelineShot,
} from "./timeline.js";

export { escapeXml, renderFcpxml, toFileUrl } from "./fcpxml.js";
export type { FcpxmlOptions } from "./fcpxml.js";

export { buildSrtBlocks, formatSrtTime, renderSrt, SRT_WRAP_CHARS, wrapSubtitle } from "./srt.js";
export type { SrtBlock } from "./srt.js";

export { CSV_COLUMNS, escapeCsvField, renderCsv, UTF8_BOM } from "./csv.js";

export { PRECHECK_NAMES, preExportChecks } from "./precheck.js";
export type { PrecheckFailure, PrecheckResult } from "./precheck.js";

export {
  buildFfmpegArgs,
  concatEpisode,
  CONCAT_LIST_NAME,
  renderConcatList,
  resolveAssetPath,
} from "./concat.js";
export type { ConcatResult } from "./concat.js";

export { deliver } from "./deliver.js";
export type { DeliveryFile, DeliveryFormat, DeliveryResult } from "./deliver.js";
