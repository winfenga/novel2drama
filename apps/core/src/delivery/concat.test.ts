import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DramaError } from "@text2drama/shared";
import { buildFfmpegArgs, concatEpisode, renderConcatList } from "./concat.js";
import { buildTimeline } from "./timeline.js";
import type { EpisodeTimeline } from "./timeline.js";

/**
 * 这一组是 M10 里唯一会碰真实文件系统的测试——因为要验「失败不留半成品」
 * 必须真的去看 tmp 有没有被清掉。落点在 `os.tmpdir()` 的独立目录，不碰仓库、
 * 不碰任何外部路径，每个用例结束删除。**不跑真实 ffmpeg、不起真实子进程**：
 * `run` 全部是 mock。
 */
let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "m10-concat-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeTimeline(mul = 0): EpisodeTimeline {
  return buildTimeline({
    episodeId: "ep_01",
    shots: [
      { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4" },
      { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 10, videoPath: "video/SC-02.mp4" },
    ],
    lines: [
      { dialogueLineId: "d1", text: "你来了。", speakerCode: "CH-01", globalStartSec: 1, globalEndSec: 2 },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 100,
    interpolateMul: mul,
  });
}

describe("M10-7 concatEpisode 纯拼成片", () => {
  it("参数正确：concat demuxer + 音轨映射 + libx264/aac + shortest", () => {
    const args = buildFfmpegArgs({
      listPath: "L.txt",
      audioPath: "A.wav",
      outTmpPath: "O.tmp",
      fps: 24,
    });
    const joined = args.join(" ");
    expect(joined).toContain("-f concat -safe 0 -i L.txt");
    expect(joined).toContain("-i A.wav");
    expect(joined).toContain("-map 0:v -map 1:a");
    expect(joined).toContain("-c:v libx264");
    expect(joined).toContain("-c:a aac");
    expect(joined).toContain("-shortest");
    expect(args[args.length - 1]).toBe("O.tmp");
    // 不做转场/不烧字幕/不加 BGM：参数里不该出现这些
    expect(joined).not.toContain("xfade");
    expect(joined).not.toContain("subtitles");
    expect(joined).not.toContain("amix");
  });

  it("list 内容：每镜一行 file '...'，路径统一正斜杠，单引号转义", () => {
    const list = renderConcatList(["video/SC-01.mp4", "D:\\x\\SC-02.mp4", "a'b.mp4"]);
    expect(list).toBe(
      "file 'video/SC-01.mp4'\nfile 'D:/x/SC-02.mp4'\nfile 'a'\\''b.mp4'\n",
    );
  });

  it("空列表 → 抛 delivery_incomplete（不拼出空片）", () => {
    expect(() => renderConcatList([])).toThrow(DramaError);
  });

  it("成功路径：outPath 存在、tmp 不存在、list 被清理、bytes 正确", async () => {
    const outPath = join(dir, "ep01.mp4");
    const run = vi.fn(async (cmd: string, args: string[]) => {
      // 模拟 ffmpeg 往最后一个参数（tmp）写文件
      await writeFile(args[args.length - 1] ?? "", "fake-mp4-bytes");
      expect(cmd).toBe("ffmpeg");
      return { stdout: "", stderr: "" };
    });

    const r = await concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run });

    expect(r.mp4Path).toBe(outPath);
    expect(r.totalFrames).toBe(367);
    expect(r.bytes).toBe(Buffer.byteLength("fake-mp4-bytes"));
    expect(existsSync(outPath)).toBe(true);
    expect(existsSync(`${outPath}.tmp`)).toBe(false);
    expect(existsSync(join(dir, "concat_list.txt"))).toBe(false);
    expect(await readFile(outPath, "utf8")).toBe("fake-mp4-bytes");
  });

  it("★ 失败不产生 outPath（tmp 被清理，list 也清）", async () => {
    const outPath = join(dir, "ep01.mp4");
    const run = vi.fn(async (_cmd: string, args: string[]) => {
      // 模拟 ffmpeg 写了一半 tmp 后失败
      await writeFile(args[args.length - 1] ?? "", "half-broken");
      throw new Error("ffmpeg exited 1: Invalid data found");
    });

    await expect(
      concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run }),
    ).rejects.toMatchObject({ code: "video2x_failed" });

    expect(existsSync(outPath)).toBe(false);
    expect(existsSync(`${outPath}.tmp`)).toBe(false);
    expect(existsSync(join(dir, "concat_list.txt"))).toBe(false);
  });

  it("失败时错误里带真实原因（不吞异常）", async () => {
    const outPath = join(dir, "ep01.mp4");
    const run = vi.fn(async () => {
      throw new Error("No such filter: xfade");
    });
    try {
      await concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run });
      throw new Error("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(DramaError);
      const err = e as DramaError;
      expect(err.code).toBe("video2x_failed");
      expect(err.message).toContain("No such filter: xfade");
      expect(err.cause).toBeInstanceOf(Error);
    }
  });

  it("成片目录不存在时自动 mkdir -p", async () => {
    const outPath = join(dir, "ep01", "nested", "ep01.mp4");
    const run = vi.fn(async (_c: string, args: string[]) => {
      await writeFile(args[args.length - 1] ?? "", "x");
      return { stdout: "", stderr: "" };
    });
    const r = await concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run });
    expect(r.mp4Path).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);
  });

  it("相对素材路径被解析成绝对路径写进 list（与 cwd 无关）", async () => {
    const outPath = join(dir, "ep01.mp4");
    let seenList = "";
    const run = vi.fn(async (_c: string, args: string[]) => {
      const listPath = args[args.indexOf("-i") + 1] ?? "";
      seenList = await readFile(listPath, "utf8");
      await writeFile(args[args.length - 1] ?? "", "x");
      return { stdout: "", stderr: "" };
    });
    await concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run });
    expect(seenList).toContain(join(dir, "video/SC-01.mp4").replace(/\\/g, "/"));
    expect(seenList.split("\n").filter((l) => l !== "")).toHaveLength(2);
  });

  it("有镜缺视频 → delivery_incomplete，一次都不调 ffmpeg", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = {
      ...t,
      shots: t.shots.map((s, i) => (i === 1 ? { ...s, videoPath: "" } : s)),
    };
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await expect(
      concatEpisode({ t: bad, outPath: join(dir, "x.mp4"), ffmpegPath: "ffmpeg", run }),
    ).rejects.toMatchObject({ code: "delivery_incomplete" });
    expect(run).not.toHaveBeenCalled();
  });

  it("缺音轨 → delivery_incomplete（不出无声成片）", async () => {
    const t = makeTimeline();
    const bad: EpisodeTimeline = { ...t, audioPath: "" };
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await expect(
      concatEpisode({ t: bad, outPath: join(dir, "x.mp4"), ffmpegPath: "ffmpeg", run }),
    ).rejects.toMatchObject({ code: "delivery_incomplete" });
    expect(run).not.toHaveBeenCalled();
  });

  it("零镜头 → delivery_incomplete", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const empty: EpisodeTimeline = {
      episodeId: "ep_01",
      fps: 24,
      interpolateMul: 0,
      totalDurationSec: 0,
      totalFrames: 0,
      shots: [],
      lines: [],
      audioPath: "a.wav",
    };
    await expect(
      concatEpisode({ t: empty, outPath: join(dir, "x.mp4"), ffmpegPath: "ffmpeg", run }),
    ).rejects.toMatchObject({ code: "delivery_incomplete" });
  });

  it("成功路径不改名成 out 之前 outPath 不存在（原子性）", async () => {
    const outPath = join(dir, "ep01.mp4");
    const run = vi.fn(async (_c: string, args: string[]) => {
      // 此刻 outPath 还不该存在，只有 tmp
      expect(existsSync(outPath)).toBe(false);
      await writeFile(args[args.length - 1] ?? "", "x");
      return { stdout: "", stderr: "" };
    });
    await concatEpisode({ t: makeTimeline(), outPath, ffmpegPath: "ffmpeg", run });
    expect((await stat(outPath)).size).toBe(1);
  });
});
