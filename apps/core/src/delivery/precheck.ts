/**
 * M10-6 · 导出前 8 项校验。
 *
 * 依据：`docs/api-contract.md` §8.5.10（L1258-1267）逐条实现、`docs/m101314-spec.md` §2.2。
 *
 * 八条：
 * 1. 每一镜都有视频文件，且能读出真实帧数
 * 2. 每一句台词都有 `globalStartSec` / `globalEndSec`
 * 3. 音频总时长 ≥ 最后一镜的 `endSec`（差一帧以上就报错）
 * 4. 镜头时长都 ≥ 台词时长（底线，决策记录 §6.1）
 * 5. `offset` 累加等于上一镜 `offset + duration`，无空隙无重叠
 * 6. FCPXML 的 `duration` 分母统一为**交付帧率**（裁决 §22.2，不是写死 24）
 * 7. SRT 无重叠时间戳、无空文本块
 * 8. CSV 带 BOM
 *
 * `probeFrames` / `probeDuration` 由 deps 注入（测试 mock，零真实 ffprobe）。
 */

import { DramaError, GENERATION_FPS } from "@text2drama/shared";
import { renderCsv, UTF8_BOM } from "./csv.js";
import { renderFcpxml } from "./fcpxml.js";
import { buildSrtBlocks } from "./srt.js";
import type { EpisodeTimeline, TimelineShot } from "./timeline.js";

export interface PrecheckFailure {
  check: string;
  shotId?: string;
  detail: string;
}

export interface PrecheckResult {
  ok: boolean;
  failures: PrecheckFailure[];
}

/** 八项校验的名字（`failures[].check` 用它，测试与 GUI 按名字定位） */
export const PRECHECK_NAMES = {
  videoFrames: "每镜有视频且能读出真实帧数",
  dialogueGlobalTime: "每句台词都有全集起止时间",
  audioCoversEpisode: "音轨总时长 ≥ 末镜 endSec",
  shotCoversDialogue: "镜头时长 ≥ 台词时长",
  offsetContiguous: "offset 累加无空隙无重叠",
  fcpxmlFrameDenominator: "FCPXML duration 分母统一为交付帧率",
  srtBlocks: "SRT 无重叠时间戳、无空文本块",
  csvBom: "CSV 带 UTF-8 BOM",
} as const;

/** 一帧的时间容差（浮点秒比较用，避免 5.12 != 5.12 的假失败） */
const EPS = 1e-6;
/** 「差一帧以上就报错」：音轨允许比末镜短不超过一帧 */
const ONE_FRAME_EPS = 1 / GENERATION_FPS;

function describeFrames(actual: number, expected: number, shot: TimelineShot, fps: number): PrecheckFailure {
  // 常见根因：交付帧率下期望 2 倍帧数，但盘上还是生成帧 → 插帧没跑 / 跑到了别的镜
  const hint =
    actual < expected && Math.abs(actual * 2 - expected) < 0.5
      ? `（插帧没跑？${actual} 帧 @24fps，交付需要 ${expected} 帧 @${fps}fps）`
      : "";
  return {
    check: PRECHECK_NAMES.videoFrames,
    shotId: shot.shotId,
    detail: `镜头 ${shot.shotCode} 实际 ${actual} 帧，时间轴期望 ${expected} 帧${hint}`,
  };
}

export async function preExportChecks(
  t: EpisodeTimeline,
  deps: {
    probeFrames: (path: string) => Promise<number>;
    probeDuration: (path: string) => Promise<number>;
  },
): Promise<PrecheckResult> {
  const failures: PrecheckFailure[] = [];

  // ── 1. 每镜有视频文件，且能读出真实帧数 ──
  // 期望帧数按**交付帧率**算（插帧后的帧数），不是插帧前
  for (const shot of t.shots) {
    if (shot.videoPath.trim() === "") {
      failures.push({
        check: PRECHECK_NAMES.videoFrames,
        shotId: shot.shotId,
        detail: `镜头 ${shot.shotCode} 没有视频文件（videoPath 为空）`,
      });
      continue;
    }
    let actualFrames: number;
    try {
      actualFrames = await deps.probeFrames(shot.videoPath);
    } catch (e) {
      // 不吞：probe 失败本身就是要报的失败项，原因是读不出真实帧数
      failures.push({
        check: PRECHECK_NAMES.videoFrames,
        shotId: shot.shotId,
        detail:
          `镜头 ${shot.shotCode} 读不出真实帧数（${shot.videoPath}）：` +
          (e instanceof Error ? e.message : String(e)),
      });
      continue;
    }
    if (!Number.isFinite(actualFrames) || actualFrames <= 0) {
      failures.push({
        check: PRECHECK_NAMES.videoFrames,
        shotId: shot.shotId,
        detail: `镜头 ${shot.shotCode} 帧数非法：${String(actualFrames)}（${shot.videoPath}）`,
      });
      continue;
    }
    // 帧数必须精确相等：probe 出来的与时间轴差一帧，FCPXML 的 offset 就全错位到后面每一镜
    if (actualFrames !== shot.durationFrames) {
      failures.push(describeFrames(actualFrames, shot.durationFrames, shot, t.fps));
    }
  }

  // ── 2. 每句台词都有 globalStartSec / globalEndSec ──
  for (const line of t.lines) {
    if (!Number.isFinite(line.globalStartSec) || !Number.isFinite(line.globalEndSec)) {
      failures.push({
        check: PRECHECK_NAMES.dialogueGlobalTime,
        detail: `台词 ${line.dialogueLineId} 缺全集绝对时间（不接受 0.000 占位）`,
      });
    } else if (line.globalEndSec < line.globalStartSec) {
      failures.push({
        check: PRECHECK_NAMES.dialogueGlobalTime,
        detail:
          `台词 ${line.dialogueLineId} 结束 ${line.globalEndSec}s 早于开始 ${line.globalStartSec}s`,
      });
    }
  }

  // ── 3. 音频总时长 ≥ 末镜 endSec（差一帧以上就报错）──
  const lastShot = t.shots[t.shots.length - 1];
  const lastEndSec = lastShot === undefined ? t.totalDurationSec : lastShot.endSec;
  if (t.audioPath.trim() === "") {
    failures.push({
      check: PRECHECK_NAMES.audioCoversEpisode,
      detail: "全集音轨路径为空",
    });
  } else {
    try {
      const audioSec = await deps.probeDuration(t.audioPath);
      if (!Number.isFinite(audioSec) || audioSec <= 0) {
        failures.push({
          check: PRECHECK_NAMES.audioCoversEpisode,
          detail: `音轨时长非法：${String(audioSec)}（${t.audioPath}）`,
        });
      } else if (audioSec < lastEndSec - ONE_FRAME_EPS) {
        failures.push({
          check: PRECHECK_NAMES.audioCoversEpisode,
          detail:
            `音轨 ${audioSec}s 短于末镜 endSec ${lastEndSec}s` +
            `（差 ${(lastEndSec - audioSec).toFixed(3)}s，超过一帧）`,
        });
      }
    } catch (e) {
      failures.push({
        check: PRECHECK_NAMES.audioCoversEpisode,
        detail:
          `音轨读不出时长（${t.audioPath}）：` + (e instanceof Error ? e.message : String(e)),
      });
    }
  }

  // ── 4. 镜头时长都 ≥ 台词时长（底线，决策 §6.1）──
  // 跨镜台词是被支持的（SRT 里合并成一条），所以按**覆盖区间的并集**算：
  // 台词必须被镜头完整装下，差一帧以上就是「有词没画」→ 报错
  for (const line of t.lines) {
    const lineDur = line.globalEndSec - line.globalStartSec;
    if (!Number.isFinite(lineDur) || lineDur < 0) {
      failures.push({
        check: PRECHECK_NAMES.shotCoversDialogue,
        detail: `台词 ${line.dialogueLineId} 时长非法：${lineDur}s`,
      });
      continue;
    }
    let covered = 0;
    for (const shot of t.shots) {
      const lo = Math.max(shot.startSec, line.globalStartSec);
      const hi = Math.min(shot.endSec, line.globalEndSec);
      if (hi > lo) covered += hi - lo;
    }
    if (covered < lineDur - ONE_FRAME_EPS) {
      failures.push({
        check: PRECHECK_NAMES.shotCoversDialogue,
        detail:
          `台词 ${line.dialogueLineId} 长 ${lineDur.toFixed(3)}s，` +
          `镜头只覆盖 ${covered.toFixed(3)}s（缺 ${(lineDur - covered).toFixed(3)}s）`,
      });
    }
  }

  // ── 5. offset 累加无空隙无重叠 ──
  // 帧号是精确整数，累加必须严格接上；同时首镜必须从 0 起
  let cursor = 0;
  for (const shot of t.shots) {
    const expectedStartSec = cursor / t.fps;
    const drift = Math.abs(shot.startSec - expectedStartSec);
    if (drift > EPS) {
      failures.push({
        check: PRECHECK_NAMES.offsetContiguous,
        shotId: shot.shotId,
        detail:
          `镜头 ${shot.shotCode} 起点 ${shot.startSec}s ≠ 上一镜 offset+duration ${expectedStartSec}s` +
          `（${drift > 0 ? `空隙/重叠 ${drift.toFixed(6)}s` : "偏差"}）`,
      });
    }
    if (!Number.isInteger(shot.durationFrames) || shot.durationFrames <= 0) {
      failures.push({
        check: PRECHECK_NAMES.offsetContiguous,
        shotId: shot.shotId,
        detail: `镜头 ${shot.shotCode} 的 durationFrames 非正整数：${String(shot.durationFrames)}`,
      });
    }
    cursor += shot.durationFrames;
  }
  if (cursor !== t.totalFrames) {
    failures.push({
      check: PRECHECK_NAMES.offsetContiguous,
      detail: `各镜帧数之和 ${cursor} ≠ 时间轴 totalFrames ${t.totalFrames}`,
    });
  }
  if (Math.abs(t.totalDurationSec - cursor / t.fps) > EPS) {
    failures.push({
      check: PRECHECK_NAMES.offsetContiguous,
      detail:
        `totalDurationSec ${t.totalDurationSec}s ≠ totalFrames/fps ${cursor / t.fps}s`,
    });
  }

  // ── 6. FCPXML 的 duration 分母统一为交付帧率 ──
  // 渲染真产物再验，不靠「我认为它会这么写」
  const xml = renderFcpxml(t, { projectName: t.episodeId, assetBaseUrl: t.audioPath });
  if (!Number.isInteger(t.fps) || t.fps <= 0) {
    failures.push({
      check: PRECHECK_NAMES.fcpxmlFrameDenominator,
      detail: `交付帧率 ${t.fps} 不是正整数，分数时长会退化成小数秒`,
    });
  }
  for (const attr of findTimeAttributes(xml)) {
    // 合法形式只有两种：整数秒（start="0s"）与 帧号/交付帧率（123/24s）
    if (/^\d+s$/.test(attr.value)) continue;
    const frac = /^(\d+)\/(\d+)s$/.exec(attr.value);
    if (frac === null || Number(frac[2]) !== t.fps) {
      failures.push({
        check: PRECHECK_NAMES.fcpxmlFrameDenominator,
        detail:
          `FCPXML 的 ${attr.name}="${attr.value}" 不合法：` +
          `分母必须是交付帧率 ${t.fps}，且不能出现小数秒`,
      });
    }
  }
  const expectedFrameDuration = `100/${t.fps * 100}s`;
  if (!xml.includes(`frameDuration="${expectedFrameDuration}"`)) {
    failures.push({
      check: PRECHECK_NAMES.fcpxmlFrameDenominator,
      detail: `FCPXML 的 frameDuration 不是 ${expectedFrameDuration}`,
    });
  }

  // ── 7. SRT 无重叠时间戳、无空文本块 ──
  const blocks = buildSrtBlocks(t);
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (b === undefined) continue;
    if (b.text.trim() === "") {
      failures.push({
        check: PRECHECK_NAMES.srtBlocks,
        detail: `SRT 第 ${b.index} 块文本为空（台词 ${b.dialogueLineId}）`,
      });
    }
    if (b.endMs <= b.startMs) {
      failures.push({
        check: PRECHECK_NAMES.srtBlocks,
        detail: `SRT 第 ${b.index} 块时长非正（${b.startMs}→${b.endMs}ms）`,
      });
    }
    const prev = blocks[i - 1];
    if (prev !== undefined && b.startMs < prev.endMs) {
      failures.push({
        check: PRECHECK_NAMES.srtBlocks,
        detail:
          `SRT 第 ${b.index} 块起点 ${b.startMs}ms 早于第 ${prev.index} 块终点 ${prev.endMs}ms（时间戳重叠）`,
      });
    }
  }

  // ── 8. CSV 带 BOM ──
  // 同样渲染真产物再验首字符
  let csv: string;
  try {
    csv = renderCsv(t);
  } catch (e) {
    if (e instanceof DramaError) throw e;
    throw new DramaError("delivery_incomplete", {
      message: "CSV 渲染失败，导出中止",
      details: { cause: e instanceof Error ? e.message : String(e) },
    });
  }
  if (!csv.startsWith(UTF8_BOM)) {
    failures.push({
      check: PRECHECK_NAMES.csvBom,
      detail: "CSV 首字符不是 UTF-8 BOM（Excel 打开会乱码）",
    });
  }

  return { ok: failures.length === 0, failures };
}

/** 取 FCPXML 里所有时间属性（`duration` / `offset`）；`frameDuration` 在别处单独验 */
function findTimeAttributes(xml: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const m of xml.matchAll(/\b(duration|offset)="([^"]*)"/g)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) continue;
    out.push({ name, value });
  }
  return out;
}
