import { describe, it, expect, vi } from "vitest";
import { PRECHECK_NAMES, preExportChecks } from "./precheck.js";
import { buildTimeline } from "./timeline.js";
import type { EpisodeTimeline } from "./timeline.js";

/** 两镜：5s(124帧) + 10s(243帧)，共 367 帧 */
function makeTimeline(interpolateMul = 0): EpisodeTimeline {
  return buildTimeline({
    episodeId: "ep_01",
    shots: [
      { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4", taskType: "ref2va" },
      { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 10, videoPath: "video/SC-02.mp4", taskType: "hybrid" },
    ],
    lines: [
      { dialogueLineId: "d1", text: "你终于来了。", speakerCode: "CH-01", globalStartSec: 1.2, globalEndSec: 4.35 },
      { dialogueLineId: "d2", text: "我等了很久。", speakerCode: "CH-02", globalStartSec: 6, globalEndSec: 9 },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 100,
    interpolateMul,
  });
}

/** 全 mock：probe 按路径表返回，绝不碰真实 ffprobe / 文件系统 */
function makeDeps(opts?: {
  frames?: (path: string) => number;
  duration?: (path: string) => number;
  framesThrows?: boolean;
  durationThrows?: boolean;
}) {
  const frames = vi.fn(async (path: string) => {
    if (opts?.framesThrows === true) throw new Error("ffprobe 挂了");
    return opts?.frames?.(path) ?? (path.includes("SC-01") ? 124 : 243);
  });
  const duration = vi.fn(async (path: string) => {
    if (opts?.durationThrows === true) throw new Error("ffprobe 挂了");
    return opts?.duration?.(path) ?? 100;
  });
  return { probeFrames: frames, probeDuration: duration };
}

function checksOf(r: { failures: { check: string }[] }): Set<string> {
  return new Set(r.failures.map((f) => f.check));
}

describe("M10-6 preExportChecks 八项", () => {
  it("全部满足 → ok=true，failures 为空", async () => {
    const r = await preExportChecks(makeTimeline(), makeDeps());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("八项名字齐备，正好 8 条", () => {
    expect(Object.keys(PRECHECK_NAMES)).toHaveLength(8);
    expect(new Set(Object.values(PRECHECK_NAMES)).size).toBe(8);
  });

  // ── 1. 每镜有视频且能读出真实帧数 ──
  it("第 1 项：帧数对不上 → 报该镜（插帧没跑会被点名）", async () => {
    const deps = makeDeps({ frames: (p) => (p.includes("SC-01") ? 124 : 0) });
    const r = await preExportChecks(makeTimeline(), deps);
    expect(r.ok).toBe(false);
    expect(checksOf(r).has(PRECHECK_NAMES.videoFrames)).toBe(true);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.videoFrames);
    expect(f?.shotId).toBe("s2");
  });

  it("第 1 项：probe 抛错 → 转成失败项（不吞、不静默当 0）", async () => {
    const r = await preExportChecks(makeTimeline(), makeDeps({ framesThrows: true }));
    expect(r.ok).toBe(false);
    const f = r.failures.filter((x) => x.check === PRECHECK_NAMES.videoFrames);
    expect(f).toHaveLength(2);
    expect(f[0]?.detail).toContain("ffprobe 挂了");
  });

  it("第 1 项：videoPath 为空 → 直接报没有视频文件", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      shots: t.shots.map((s, i) => (i === 0 ? { ...s, videoPath: "" } : s)),
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    expect(r.failures[0]?.detail).toContain("没有视频文件");
  });

  it("第 1 项：期望帧数按交付帧率（mul=2 时期望 248/486，给 124/243 即失败）", async () => {
    const t = makeTimeline(2);
    expect(t.shots.map((s) => s.durationFrames)).toEqual([248, 486]);
    // probe 返回生成帧数（插帧前）→ 应报错
    const r = await preExportChecks(t, makeDeps());
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.videoFrames);
    expect(f?.detail).toContain("插帧没跑");
    // probe 返回插帧后的帧数 → 通过
    const okDeps = makeDeps({ frames: (p) => (p.includes("SC-01") ? 248 : 486) });
    const r2 = await preExportChecks(t, okDeps);
    expect(r2.ok).toBe(true);
  });

  // ── 2. 每句台词都有全集起止 ──
  it("第 2 项：台词时间非法 → 报", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      lines: t.lines.map((l, i) => (i === 0 ? { ...l, globalStartSec: Number.NaN } : l)),
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    expect(checksOf(r).has(PRECHECK_NAMES.dialogueGlobalTime)).toBe(true);
  });

  // ── 3. 音轨时长 ≥ 末镜 endSec ──
  it("第 3 项：音轨短于末镜 → 报（差一帧以上）", async () => {
    const r = await preExportChecks(makeTimeline(), makeDeps({ duration: () => 10 }));
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.audioCoversEpisode);
    expect(f?.detail).toContain("短于末镜");
  });

  it("第 3 项：音轨短不到一帧 → 放过", async () => {
    const t = makeTimeline();
    const r = await preExportChecks(t, makeDeps({ duration: () => t.totalDurationSec - 1 / 48 }));
    expect(r.ok).toBe(true);
  });

  it("第 3 项：probeDuration 抛错 → 转成失败项", async () => {
    const r = await preExportChecks(makeTimeline(), makeDeps({ durationThrows: true }));
    expect(r.ok).toBe(false);
    expect(checksOf(r).has(PRECHECK_NAMES.audioCoversEpisode)).toBe(true);
  });

  // ── 4. 镜头时长 ≥ 台词时长 ──
  it("第 4 项：台词比覆盖它的镜头还长 → 报", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      // 台词尾巴伸到全集之外（没有镜头覆盖）
      lines: [{ ...t.lines[0]!, globalEndSec: t.totalDurationSec + 5 }],
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.shotCoversDialogue);
    expect(f?.detail).toContain("只覆盖");
  });

  it("第 4 项：跨镜台词只要被镜头完整覆盖就不报", async () => {
    const t = buildTimeline({
      episodeId: "ep_01",
      shots: [
        { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "v/SC-01.mp4" },
        { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 5, videoPath: "v/SC-02.mp4" },
      ],
      lines: [
        { dialogueLineId: "d1", text: "跨镜的一句。", speakerCode: "CH-01", globalStartSec: 4, globalEndSec: 7 },
      ],
      audioPath: "a.wav",
      audioDurationSec: 100,
      interpolateMul: 0,
    });
    expect(t.lines[0]?.shotIds).toEqual(["s1", "s2"]);
    const r = await preExportChecks(t, makeDeps({ frames: () => 124 }));
    expect(r.ok).toBe(true);
  });

  // ── 5. offset 累加无空隙无重叠 ──
  it("第 5 项：某镜起点被拉开 → 报空隙", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      shots: t.shots.map((s, i) => (i === 1 ? { ...s, startSec: s.startSec + 2 } : s)),
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    expect(checksOf(r).has(PRECHECK_NAMES.offsetContiguous)).toBe(true);
  });

  it("第 5 项：totalFrames 与各镜之和不一致 → 报", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = { ...t, totalFrames: t.totalFrames + 1 };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.offsetContiguous);
    expect(f?.detail).toContain("≠ 时间轴 totalFrames");
  });

  // ── 6. FCPXML 分母统一为交付帧率 ──
  it("第 6 项：mul=2 时分母必须是 48（不是写死 24）", async () => {
    const t = makeTimeline(2);
    const deps = makeDeps({ frames: (p) => (p.includes("SC-01") ? 248 : 486) });
    const r = await preExportChecks(t, deps);
    expect(r.ok).toBe(true);
    expect(r.failures.some((f) => f.check === PRECHECK_NAMES.fcpxmlFrameDenominator)).toBe(false);
  });

  it("第 6 项：交付帧率非整数 → FCPXML 出现小数秒，报第 6 项", async () => {
    const t = makeTimeline(2);
    // 造一个脏 fps：renderFcpxml 会写出 248/24.5s —— 小数秒正是要拦的
    const broken: EpisodeTimeline = { ...t, fps: 24.5 };
    const deps = makeDeps({ frames: (p) => (p.includes("SC-01") ? 248 : 486) });
    const r = await preExportChecks(broken, deps);
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.fcpxmlFrameDenominator);
    expect(f?.detail).toContain("小数秒");
  });

  // ── 7. SRT 无重叠无空块 ──
  it("第 7 项：两条台词同起点 → 截断后成 0 长块，报", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      lines: [
        { ...t.lines[0]!, dialogueLineId: "a", globalStartSec: 1, globalEndSec: 4 },
        { ...t.lines[0]!, dialogueLineId: "b", globalStartSec: 1, globalEndSec: 4 },
      ],
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.check === PRECHECK_NAMES.srtBlocks);
    expect(f?.detail).toContain("非正");
  });

  it("第 7 项：正常接续的台词不报重叠", async () => {
    const t = makeTimeline();
    const r = await preExportChecks(t, makeDeps());
    expect(r.failures.some((f) => f.check === PRECHECK_NAMES.srtBlocks)).toBe(false);
  });

  it("第 7 项：空字幕文本 → 报", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      lines: [{ ...t.lines[0]!, text: "   " }],
    };
    const r = await preExportChecks(bad, makeDeps());
    expect(r.ok).toBe(false);
    expect(checksOf(r).has(PRECHECK_NAMES.srtBlocks)).toBe(true);
  });

  // ── 8. CSV 带 BOM ──
  it("第 8 项：正常时间轴产物带 BOM → 不报", async () => {
    const r = await preExportChecks(makeTimeline(), makeDeps());
    expect(r.failures.some((f) => f.check === PRECHECK_NAMES.csvBom)).toBe(false);
  });

  it("八项失败一次性全列（不是遇到第一个就返回）", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      shots: t.shots.map((s, i) => (i === 0 ? { ...s, videoPath: "" } : s)),
      lines: [{ ...t.lines[0]!, globalEndSec: t.totalDurationSec + 10 }],
    };
    const r = await preExportChecks(bad, makeDeps({ duration: () => 1 }));
    expect(r.failures.length).toBeGreaterThan(2);
    expect(checksOf(r).size).toBeGreaterThan(2);
  });
});
