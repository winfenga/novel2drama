import { describe, it, expect } from "vitest";
import { DramaError } from "@text2drama/shared";
import { buildSrtBlocks, formatSrtTime, renderSrt, wrapSubtitle } from "./srt.js";
import { buildTimeline } from "./timeline.js";

function tl(
  lines: {
    dialogueLineId: string;
    text: string;
    speakerCode: string;
    globalStartSec: number;
    globalEndSec: number;
  }[],
) {
  return buildTimeline({
    episodeId: "ep_01",
    shots: [
      { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4" },
      { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 10, videoPath: "video/SC-02.mp4" },
    ],
    lines,
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 100,
    interpolateMul: 0,
  });
}

describe("M10-3 renderSrt", () => {
  it("时间戳用全集绝对时间，格式 HH:MM:SS,mmm", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "你终于来了。", speakerCode: "CH-01", globalStartSec: 1.2, globalEndSec: 4.35 },
    ]);
    const srt = renderSrt(t);
    expect(srt).toContain("00:00:01,200 --> 00:00:04,350");
    expect(srt.startsWith("1\n")).toBe(true);
  });

  it("formatSrtTime 处理进位与毫秒补零", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(1.2)).toBe("00:00:01,200");
    expect(formatSrtTime(59.999)).toBe("00:00:59,999");
    expect(formatSrtTime(3600 + 61.5)).toBe("01:01:01,500");
    // 负数钳到 0，不出现 -1 的怪时间
    expect(formatSrtTime(-3)).toBe("00:00:00,000");
  });

  it("★ 跨镜台词合并成一条，不按镜头拆", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "我等了很久。", speakerCode: "CH-01", globalStartSec: 4, globalEndSec: 7 },
    ]);
    // 该台词跨 2 个镜头
    expect(t.lines[0]?.shotIds).toEqual(["s1", "s2"]);
    const blocks = buildSrtBlocks(t);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe("我等了很久。");
  });

  it("★ 21 字台词出现 \\N 软换行，且每行都不超 20 字", () => {
    const text = "一二三四五六七八九十一二三四五六七八九十一";
    expect(text.length).toBe(21);
    const t = tl([
      { dialogueLineId: "d1", text, speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 5 },
    ]);
    const srt = renderSrt(t);
    expect(srt).toContain("\\N");
    const body = (buildSrtBlocks(t)[0]?.text ?? "").split("\\N");
    expect(body.length).toBe(2);
    for (const line of body) {
      expect(line.length).toBeLessThanOrEqual(20);
      expect(line.length).toBeGreaterThan(0);
    }
    // 只加软换行，一个字都不许改
    expect(body.join("")).toBe(text);
  });

  it("恰好 20 字不折行，21 字折行", () => {
    expect(wrapSubtitle("一二三四五六七八九十一二三四五六七八九十")).toHaveLength(1);
    expect(wrapSubtitle("一二三四五六七八九十一二三四五六七八九十一")).toHaveLength(2);
  });

  it("折行优先断在标点后（按句意断，不硬切）", () => {
    const lines = wrapSubtitle("你终于来了，我等了很久很久才等到你出现，真不容易。");
    expect(lines.length).toBeGreaterThan(1);
    // 至少有一行以中文标点收尾
    expect(lines.some((l) => /[，。！？、；：]$/.test(l))).toBe(true);
  });

  it("不产生空块、不产生重叠时间戳", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "第一句。", speakerCode: "CH-01", globalStartSec: 0, globalEndSec: 2 },
      { dialogueLineId: "d2", text: "第二句。", speakerCode: "CH-02", globalStartSec: 2, globalEndSec: 4 },
      { dialogueLineId: "d3", text: "第三句。", speakerCode: "CH-01", globalStartSec: 4, globalEndSec: 6 },
    ]);
    const blocks = buildSrtBlocks(t);
    expect(blocks).toHaveLength(3);
    for (const b of blocks) {
      expect(b.text.trim()).not.toBe("");
      expect(b.endMs).toBeGreaterThan(b.startMs);
    }
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i]?.startMs).toBeGreaterThanOrEqual(blocks[i - 1]?.endMs ?? 0);
    }
  });

  it("重叠输入被截到下一块起点（播放器不闪字）", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "第一句。", speakerCode: "CH-01", globalStartSec: 0, globalEndSec: 3 },
      { dialogueLineId: "d2", text: "第二句。", speakerCode: "CH-02", globalStartSec: 2, globalEndSec: 4 },
    ]);
    const blocks = buildSrtBlocks(t);
    expect(blocks[1]?.startMs).toBe(2000);
    expect(blocks[0]?.endMs).toBeLessThanOrEqual(2000);
  });

  it("块尾最多到下一块起点，末块保持原结束时间", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "甲。", speakerCode: "CH-01", globalStartSec: 0, globalEndSec: 2 },
      { dialogueLineId: "d2", text: "乙。", speakerCode: "CH-02", globalStartSec: 5, globalEndSec: 7 },
    ]);
    const blocks = buildSrtBlocks(t);
    expect(blocks[1]?.endMs).toBe(7000);
  });

  it("无台词 → 抛 delivery_incomplete（不产出空 SRT）", () => {
    const t = tl([]);
    expect(() => renderSrt(t)).toThrow(DramaError);
    try {
      renderSrt(t);
    } catch (e) {
      expect((e as DramaError).code).toBe("delivery_incomplete");
    }
  });

  it("SRT 结构合法：序号递增、块间空行、末尾有空行", () => {
    const t = tl([
      { dialogueLineId: "d1", text: "甲。", speakerCode: "CH-01", globalStartSec: 0, globalEndSec: 1 },
      { dialogueLineId: "d2", text: "乙。", speakerCode: "CH-02", globalStartSec: 1, globalEndSec: 2 },
    ]);
    const srt = renderSrt(t);
    expect(srt.startsWith("1\n00:00:00,000 --> 00:00:01,000\n甲。\n\n2\n")).toBe(true);
    expect(srt.endsWith("\n")).toBe(true);
    expect(srt).toContain("00:00:01,000 --> 00:00:02,000");
  });
});
