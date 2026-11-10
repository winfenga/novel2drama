import { describe, it, expect } from "vitest";
import { DramaError } from "@text2drama/shared";
import { buildTimeline, readGaps } from "./timeline.js";
import type { TimelineGapDetails } from "./timeline.js";

/** buildTimeline 的入参类型（用 Parameters 取，测试 fixture 不重复声明契约） */
type BuildInput = Parameters<typeof buildTimeline>[0];
type ShotIn = BuildInput["shots"][number];
type LineIn = BuildInput["lines"][number];

/** 5s / 10s / 15s 走 17n+5 网格 → 124 / 243 / 362 帧 */
function baseInput(): BuildInput {
  return {
    episodeId: "ep_01",
    shots: [
      {
        shotId: "s1",
        shotCode: "SC-01",
        sceneCode: "SN-01",
        durationSec: 5,
        videoPath: "video/SC-01.mp4",
        taskType: "ref2va",
      },
      {
        shotId: "s2",
        shotCode: "SC-02",
        sceneCode: "SN-01",
        durationSec: 10,
        videoPath: "video/SC-02.mp4",
      },
    ],
    lines: [
      {
        dialogueLineId: "d1",
        text: "你终于来了。",
        speakerCode: "CH-01",
        globalStartSec: 1.2,
        globalEndSec: 4.35,
        shotId: "s1",
      },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 30,
    interpolateMul: 0,
  };
}

const shot = (over: Partial<ShotIn> = {}): ShotIn => ({
  shotId: "s1",
  shotCode: "SC-01",
  sceneCode: "SN-01",
  durationSec: 5,
  videoPath: "video/SC-01.mp4",
  ...over,
});

const line = (over: Partial<LineIn> = {}): LineIn => ({
  dialogueLineId: "d1",
  text: "你终于来了。",
  speakerCode: "CH-01",
  globalStartSec: 1,
  globalEndSec: 2,
  ...over,
});

function gapsOf(fn: () => unknown): TimelineGapDetails {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DramaError);
    const err = e as DramaError;
    expect(err.code).toBe("delivery_incomplete");
    return err.details as TimelineGapDetails;
  }
  throw new Error("期望抛 delivery_incomplete，实际没抛");
}

describe("M10-1 buildTimeline 全集绝对时间轴", () => {
  it("第 1 镜从 0 起，第 2 镜接着第 1 镜的 endSec（累加，不是各自从 0 起）", () => {
    const t = buildTimeline(baseInput());
    expect(t.shots[0]?.startSec).toBe(0);
    expect(t.shots[1]?.startSec).toBe(t.shots[0]?.endSec);
    // 124 帧 / 24fps
    expect(t.shots[0]?.endSec).toBeCloseTo(124 / 24, 10);
    expect(t.shots[1]?.endSec).toBeCloseTo(367 / 24, 10);
    // 第二镜绝不从 0 开始
    expect(t.shots[1]?.startSec).toBeGreaterThan(0);
  });

  it("帧数走 17n+5 网格：5s→124、10s→243；总帧数 = 各镜之和", () => {
    const t = buildTimeline(baseInput());
    expect(t.shots.map((s) => s.durationFrames)).toEqual([124, 243]);
    expect(t.totalFrames).toBe(367);
    expect(t.totalDurationSec).toBeCloseTo(367 / 24, 10);
  });

  it("插帧只改帧数不改物理时长：mul=2 时帧数翻倍、fps=48、endSec 不变", () => {
    const t1 = buildTimeline(baseInput());
    const input = { ...baseInput(), interpolateMul: 2 };
    const t2 = buildTimeline(input);
    expect(t2.fps).toBe(48);
    expect(t2.shots.map((s) => s.durationFrames)).toEqual([248, 486]);
    expect(t2.totalFrames).toBe(734);
    expect(t2.totalDurationSec).toBeCloseTo(t1.totalDurationSec, 10);
    expect(t2.shots[1]?.startSec).toBeCloseTo(t1.shots[1]?.startSec ?? -1, 10);
  });

  it("mul=1 与 mul=0 同口径（不插帧，交付帧率仍是 24）", () => {
    for (const mul of [0, 1]) {
      const t = buildTimeline({ ...baseInput(), interpolateMul: mul });
      expect(t.fps).toBe(24);
      expect(t.totalFrames).toBe(367);
    }
  });

  it("跨镜台词 shotIds 有多个（按时间区间重叠判定）", () => {
    const input = baseInput();
    input.lines = [
      {
        dialogueLineId: "d1",
        text: "我等了很久，等到天都黑了。",
        speakerCode: "CH-01",
        globalStartSec: 4,
        globalEndSec: 7,
        shotId: "s1",
      },
    ];
    input.audioDurationSec = 40;
    const t = buildTimeline(input);
    expect(t.lines[0]?.shotIds).toEqual(["s1", "s2"]);
  });

  it("台词按全集时间排序（SRT 无重叠依赖这个顺序）", () => {
    const input = baseInput();
    input.lines = [
      { dialogueLineId: "late", text: "后说。", speakerCode: "CH-02", globalStartSec: 6, globalEndSec: 7 },
      { dialogueLineId: "early", text: "先说。", speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 2 },
    ];
    const t = buildTimeline(input);
    expect(t.lines.map((l) => l.dialogueLineId)).toEqual(["early", "late"]);
  });

  it("taskType 原样透传；不给就不补默认值", () => {
    const t = buildTimeline(baseInput());
    expect(t.shots[0]?.taskType).toBe("ref2va");
    expect(t.shots[1]?.taskType).toBeUndefined();
  });

  // ── 缺口：整单抛，details 列出每一处 ──

  it("删掉某镜 videoPath → delivery_incomplete，details 含该 shotCode", () => {
    const input = { ...baseInput(), shots: [...baseInput().shots] };
    const second = input.shots[1];
    if (second === undefined) throw new Error("fixture 缺第二镜");
    input.shots[1] = { ...second, videoPath: undefined };
    const details = gapsOf(() => buildTimeline(input));
    const hit = details.gaps.find((g) => g.kind === "missing_video");
    expect(hit).toBeDefined();
    expect(hit?.shotCode).toBe("SC-02");
    expect(hit?.detail).toContain("SC-02");
  });

  it("有台词无 global 时间 → delivery_incomplete，details 含 dialogueLineId", () => {
    const input = baseInput();
    input.lines = [
      { dialogueLineId: "d9", text: "没有时间戳。", speakerCode: "CH-01", shotId: "s1" },
    ];
    const details = gapsOf(() => buildTimeline(input));
    const hit = details.gaps.find((g) => g.kind === "missing_global_time");
    expect(hit?.dialogueLineId).toBe("d9");
  });

  it("音频短于末镜 endSec → delivery_incomplete（差一帧以上才报）", () => {
    const input = { ...baseInput(), audioDurationSec: 10 };
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "audio_too_short")).toBe(true);

    // 差一帧以内不报
    const ok = { ...baseInput(), audioDurationSec: 367 / 24 - 1 / 48 };
    expect(() => buildTimeline(ok)).not.toThrow();
  });

  it("audioPath 为空 → missing_audio（不出无声成片）", () => {
    const input = { ...baseInput(), audioPath: "" };
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "missing_audio")).toBe(true);
  });

  it("零镜头 → no_shots", () => {
    const input = { ...baseInput(), shots: [] };
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "no_shots")).toBe(true);
  });

  it("台词区间落在所有镜头之外 → line_out_of_range", () => {
    const input = baseInput();
    input.lines = [
      { dialogueLineId: "d1", text: "错位。", speakerCode: "CH-01", globalStartSec: 99, globalEndSec: 100 },
    ];
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "line_out_of_range")).toBe(true);
  });

  it("台词 end < start → line_invalid_range", () => {
    const input = baseInput();
    input.lines = [
      { dialogueLineId: "d1", text: "倒挂。", speakerCode: "CH-01", globalStartSec: 4, globalEndSec: 2 },
    ];
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "line_invalid_range")).toBe(true);
  });

  it("空台词文本 → empty_dialogue_text", () => {
    const input = baseInput();
    input.lines = [
      { dialogueLineId: "d1", text: "   ", speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 2 },
    ];
    const details = gapsOf(() => buildTimeline(input));
    expect(details.gaps.some((g) => g.kind === "empty_dialogue_text")).toBe(true);
  });

  it("插帧后帧数非整数（mul=2.5 × 243 帧 = 607.5）→ 报出是哪一镜", () => {
    const input = { ...baseInput(), interpolateMul: 2.5 };
    const details = gapsOf(() => buildTimeline(input));
    const hit = details.gaps.find((g) => g.kind === "frame_misaligned");
    expect(hit?.shotCode).toBe("SC-02");
    expect(hit?.detail).toContain("607.5");
  });

  it("多处缺口一次列全（不是遇到第一个就停）", () => {
    const input = { ...baseInput(), audioPath: "" };
    input.shots = [
      { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5 },
      { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-02.mp4" },
    ];
    input.lines = [{ dialogueLineId: "d1", text: "没时间。", speakerCode: "CH-01" }];
    const details = gapsOf(() => buildTimeline(input));
    const kinds = new Set(details.gaps.map((g) => g.kind));
    expect(kinds.has("missing_video")).toBe(true);
    expect(kinds.has("missing_global_time")).toBe(true);
    expect(kinds.has("missing_audio")).toBe(true);
  });

  it("readGaps 只认 delivery_incomplete 且带 gaps 的错误", () => {
    const input = { ...baseInput(), audioPath: "" };
    const err = (() => {
      try {
        buildTimeline(input);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(readGaps(err)?.length).toBeGreaterThan(0);
    expect(readGaps(new Error("普通错误"))).toBeNull();
    expect(readGaps(new DramaError("invalid_param"))).toBeNull();
  });
});
