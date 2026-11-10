/**
 * M10-1 · 全集绝对时间轴。
 *
 * 依据：`docs/api-contract.md` §8.5.2（L1092-1104）、§8.5.8（L1217-1226）、
 * `execution-plan.md` M10-1、`docs/m101314-spec.md` §2.2 / §2.3。
 *
 * 铁律：
 * - 所有时间戳都是**全集绝对时间**：第 1 镜 0，第 N 镜 = 上一镜 endSec（累加，不是各自从 0 起）
 * - 任何缺口（有镜无视频 / 有台词无 global 时间 / 音频短于末镜 endSec）→ 整单抛
 *   `delivery_incomplete`，`details.gaps` 列出每一处。**不用 0.000 占位、不跳过**
 * - 帧数按**交付帧率**（`deliveryFps(interpolateMul)`）算；物理时长 = 生成帧数 / 24，
 *   插帧只改变帧数不改变时长
 */

import { DramaError, GENERATION_FPS, deliveryFps } from "@text2drama/shared";
import type { TaskType } from "@text2drama/shared";
import { secondsToFrames } from "../media/frames.js";

// ── 冻结签名（m101314-spec §2.2）──

export interface TimelineShot {
  shotId: string;
  shotCode: string; // "SC-01"
  sceneCode: string; // "SN-01"
  startSec: number; // 全集绝对
  endSec: number;
  durationFrames: number; // 交付帧率下的帧数
  videoPath: string; // 相对 "video/SC-01.mp4"
  /**
   * H3 的 task_type（六值，写入 CSV 用）。
   *
   * ⚠️ 契约 §2.2 的 TimelineShot 没有这个字段，但 CSV 的 14 列里**有** `taskType`，
   * 且 `buildTimeline` 的入参里也没有来源。这是契约的缺口，按「最小补充」只加**可选**字段：
   * 调用方（M14）手里有 `Shot.taskType`，直接透传；拿不到就留空（不猜、不填默认值）。
   */
  taskType?: TaskType;
}

export interface TimelineLine {
  dialogueLineId: string;
  text: string;
  speakerCode: string; // "CH-01"
  globalStartSec: number;
  globalEndSec: number;
  shotIds: string[]; // 跨镜台词会有多个
}

export interface EpisodeTimeline {
  episodeId: string;
  /** 交付帧率 = deliveryFps(interpolateMul)，不是 24 写死 */
  fps: number;
  interpolateMul: number;
  totalDurationSec: number;
  totalFrames: number;
  shots: TimelineShot[];
  lines: TimelineLine[];
  audioPath: string; // 全集连续一条
}

/** 缺口种类（details.gaps[].kind；每一条都指得出是哪个镜/哪句词） */
export type TimelineGapKind =
  | "no_shots"
  | "missing_video"
  | "frame_misaligned"
  | "missing_audio"
  | "audio_too_short"
  | "missing_global_time"
  | "line_invalid_range"
  | "empty_dialogue_text"
  | "line_out_of_range";

export interface TimelineGap {
  kind: TimelineGapKind;
  shotId?: string;
  shotCode?: string;
  dialogueLineId?: string;
  detail: string;
}

/** `delivery_incomplete` 的 details 形状（测试与调用方按这个形状读） */
export interface TimelineGapDetails {
  gaps: TimelineGap[];
}

/** 缺口秒数容差：一帧以内算「不短」（api-contract L1262「差一帧以上就报错」） */
const ONE_FRAME_EPS = 1 / GENERATION_FPS;

/**
 * 生成帧数 → 物理秒数。
 * 插帧是「帧数 × mul、帧率 × mul」，物理时长不变，所以恒用生成帧率换算。
 */
function framesToPhysicalSec(frames: number): number {
  return frames / GENERATION_FPS;
}

/**
 * 尖峰保护：`interpolateMul` 0/1 视为不插帧（`deliveryFps` 同一口径）；
 * ≥2 时插帧倍率即交付帧率分母，插帧后帧数必须仍为整数，否则半帧会被写进 FCPXML。
 */
function effectiveMul(interpolateMul: number): number {
  return interpolateMul < 2 ? 1 : interpolateMul;
}

/** 输入按 shot 顺序（`Shot.index` 升序，由调用方保证）逐镜累加；算不出时整单抛错 */
export function buildTimeline(input: {
  episodeId: string;
  shots: {
    shotId: string;
    shotCode: string;
    sceneCode: string;
    durationSec: number;
    videoPath?: string;
    taskType?: TaskType;
  }[];
  lines: {
    dialogueLineId: string;
    text: string;
    speakerCode: string;
    globalStartSec?: number;
    globalEndSec?: number;
    shotId?: string;
  }[];
  audioPath: string;
  audioDurationSec?: number;
  interpolateMul: number;
}): EpisodeTimeline {
  const gaps: TimelineGap[] = [];
  const mul = effectiveMul(input.interpolateMul);
  const fps = deliveryFps(input.interpolateMul);

  if (input.shots.length === 0) {
    gaps.push({ kind: "no_shots", detail: "该集没有任何镜头，无法建立时间轴" });
  }

  // ── 镜头：绝对时间累加 + 交付帧数 ──
  const shots: TimelineShot[] = [];
  let gridCursor = 0; // 生成帧游标（物理时长的唯一真值来源）
  let deliveryCursor = 0; // 交付帧游标（FCPXML offset 用）

  for (const s of input.shots) {
    const gridFrames = secondsToFrames(s.durationSec);
    if (!Number.isFinite(s.durationSec) || s.durationSec <= 0 || gridFrames <= 0) {
      gaps.push({
        kind: "frame_misaligned",
        shotId: s.shotId,
        shotCode: s.shotCode,
        detail: `镜头时长 ${String(s.durationSec)}s 换算不出帧数`,
      });
    }

    const deliveryFrames = gridFrames * mul;
    if (!Number.isInteger(deliveryFrames)) {
      // 半帧路径（如 303.75）：已裁决作废，不许四舍五入蒙过去
      gaps.push({
        kind: "frame_misaligned",
        shotId: s.shotId,
        shotCode: s.shotCode,
        detail:
          `镜头 ${s.shotCode} 插帧后帧数 ${gridFrames}×${mul}=${deliveryFrames} 不是整数` +
          `（插帧后必须整除，半帧会被写进 FCPXML）`,
      });
    }

    const startSec = framesToPhysicalSec(gridCursor);
    const endSec = framesToPhysicalSec(gridCursor + gridFrames);
    const videoPath = s.videoPath ?? "";
    if (videoPath.trim() === "") {
      gaps.push({
        kind: "missing_video",
        shotId: s.shotId,
        shotCode: s.shotCode,
        detail: `镜头 ${s.shotCode} 还没有视频文件（videoPath 为空）`,
      });
    }

    shots.push({
      shotId: s.shotId,
      shotCode: s.shotCode,
      sceneCode: s.sceneCode,
      startSec,
      endSec,
      durationFrames: deliveryFrames,
      videoPath,
      ...(s.taskType === undefined ? {} : { taskType: s.taskType }),
    });

    gridCursor += gridFrames;
    deliveryCursor += deliveryFrames;
  }

  const totalDurationSec = framesToPhysicalSec(gridCursor);

  // ── 台词：必须有全集绝对时间；跨镜时 shotIds 记多个 ──
  const lines: TimelineLine[] = [];
  const shotById = new Map<string, TimelineShot>();
  for (const s of shots) shotById.set(s.shotId, s);

  for (const l of input.lines) {
    if (l.text.trim() === "") {
      gaps.push({
        kind: "empty_dialogue_text",
        dialogueLineId: l.dialogueLineId,
        detail: `台词 ${l.dialogueLineId} 文本为空`,
      });
    }

    const start = l.globalStartSec;
    const end = l.globalEndSec;
    if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) {
      gaps.push({
        kind: "missing_global_time",
        dialogueLineId: l.dialogueLineId,
        ...(l.shotId === undefined ? {} : { shotId: l.shotId }),
        ...(l.shotId === undefined ? {} : { shotCode: shotById.get(l.shotId)?.shotCode ?? "" }),
        detail: `台词 ${l.dialogueLineId} 缺 globalStartSec / globalEndSec（不接受 0.000 占位）`,
      });
      continue;
    }
    if (end < start) {
      gaps.push({
        kind: "line_invalid_range",
        dialogueLineId: l.dialogueLineId,
        detail: `台词 ${l.dialogueLineId} 的 globalEndSec(${end}) < globalStartSec(${start})`,
      });
      continue;
    }

    // shotIds：显式 shotId ∪ 时间范围覆盖到的所有镜头（跨镜台词因此自然有多个）
    const shotIds: string[] = [];
    if (l.shotId !== undefined) {
      if (!shotById.has(l.shotId)) {
        gaps.push({
          kind: "line_out_of_range",
          dialogueLineId: l.dialogueLineId,
          shotId: l.shotId,
          detail: `台词 ${l.dialogueLineId} 指向不存在的镜头 ${l.shotId}`,
        });
      } else {
        shotIds.push(l.shotId);
      }
    }
    for (const s of shots) {
      if (start < s.endSec - 1e-9 && end > s.startSec + 1e-9) {
        if (!shotIds.includes(s.shotId)) shotIds.push(s.shotId);
      }
    }
    if (shotIds.length === 0) {
      gaps.push({
        kind: "line_out_of_range",
        dialogueLineId: l.dialogueLineId,
        detail:
          `台词 ${l.dialogueLineId} 的 [${start}, ${end}] 不落在任何镜头区间内` +
          `（全集时长 ${totalDurationSec}s）`,
      });
    }

    lines.push({
      dialogueLineId: l.dialogueLineId,
      text: l.text,
      speakerCode: l.speakerCode,
      globalStartSec: start,
      globalEndSec: end,
      shotIds,
    });
  }

  // 按全集时间排序，三件套共用同一顺序（SRT 无重叠检查依赖这一点）
  lines.sort(
    (a, b) =>
      a.globalStartSec - b.globalStartSec ||
      a.globalEndSec - b.globalEndSec ||
      a.dialogueLineId.localeCompare(b.dialogueLineId),
  );

  // ── 音频：一条全集连续音轨，长度不得短于末镜 endSec ──
  if (input.audioPath.trim() === "") {
    gaps.push({ kind: "missing_audio", detail: "全集音轨路径为空（audio/ 必须有一条连续音轨）" });
  } else if (input.audioDurationSec !== undefined) {
    if (!Number.isFinite(input.audioDurationSec)) {
      gaps.push({
        kind: "audio_too_short",
        detail: `音轨时长不是有限数：${String(input.audioDurationSec)}`,
      });
    } else if (input.audioDurationSec < totalDurationSec - ONE_FRAME_EPS) {
      gaps.push({
        kind: "audio_too_short",
        detail:
          `音轨 ${input.audioDurationSec}s 短于末镜 endSec ${totalDurationSec}s` +
          `（差 ${(totalDurationSec - input.audioDurationSec).toFixed(3)}s，超过一帧）`,
      });
    }
  }

  if (gaps.length > 0) {
    throw new DramaError("delivery_incomplete", {
      message: `时间轴有 ${gaps.length} 处缺口，拒绝导出`,
      details: { gaps } satisfies TimelineGapDetails,
    });
  }

  return {
    episodeId: input.episodeId,
    fps,
    interpolateMul: input.interpolateMul,
    totalDurationSec,
    totalFrames: deliveryCursor,
    shots,
    lines,
    audioPath: input.audioPath,
  };
}

/** 从 `delivery_incomplete` 的 details 里读缺口清单（类型收窄用，不做 fallback） */
export function readGaps(e: unknown): TimelineGap[] | null {
  if (!(e instanceof DramaError)) return null;
  const details = e.details as TimelineGapDetails | undefined;
  return details !== undefined && Array.isArray(details.gaps) ? details.gaps : null;
}
