import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DramaError } from "@text2drama/shared";
import { deliver } from "./deliver.js";
import type { PrecheckResult } from "./precheck.js";
import { buildTimeline } from "./timeline.js";
import type { EpisodeTimeline } from "./timeline.js";

/**
 * `deliver()` 要验「precheck 不 ok → 一个文件都不写」，必须真看盘。
 * 落点在 `os.tmpdir()` 的独立目录，每个用例用完即删，不碰仓库、不碰外部路径。
 */
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "m10-deliver-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const OK: PrecheckResult = { ok: true, failures: [] };
const BAD: PrecheckResult = {
  ok: false,
  failures: [{ check: "每镜有视频且能读出真实帧数", shotId: "s2", detail: "镜头 SC-02 没有视频文件" }],
};

function makeTimeline(): EpisodeTimeline {
  return buildTimeline({
    episodeId: "ep01",
    shots: [
      { shotId: "s1", shotCode: "SC-01", sceneCode: "SN-01", durationSec: 5, videoPath: "video/SC-01.mp4", taskType: "ref2va" },
      { shotId: "s2", shotCode: "SC-02", sceneCode: "SN-01", durationSec: 10, videoPath: "video/SC-02.mp4" },
    ],
    lines: [
      { dialogueLineId: "d1", text: "你终于来了。", speakerCode: "CH-01", globalStartSec: 1.2, globalEndSec: 4.35 },
    ],
    audioPath: "audio/ep01_voice.wav",
    audioDurationSec: 100,
    interpolateMul: 0,
  });
}

function outDirFor(name: string): string {
  return join(root, name);
}

describe("M10-5 deliver 总入口", () => {
  it("三件套全出：fcpxml / srt / csv，文件名 ep01.*，bytes = UTF-8 字节数", async () => {
    const outDir = outDirFor("all");
    const r = await deliver({
      t: makeTimeline(),
      formats: ["fcpxml", "srt", "csv"],
      outDir,
      projectName: "ep01",
      assetBaseUrl: "D:/out/p1/ep01",
      precheck: OK,
    });

    expect(r.episodeId).toBe("ep01");
    expect(r.files.map((f) => f.format)).toEqual(["fcpxml", "srt", "csv"]);
    expect(r.files.map((f) => f.path)).toEqual([
      join(outDir, "ep01.fcpxml"),
      join(outDir, "ep01.srt"),
      join(outDir, "ep01.csv"),
    ]);

    for (const f of r.files) {
      const onDisk = await readFile(f.path, "utf8");
      expect(f.bytes).toBe(Buffer.byteLength(onDisk, "utf8"));
      expect(onDisk.length).toBeGreaterThan(0);
    }

    // CSV 首字节仍是 BOM
    const csv = await readFile(join(outDir, "ep01.csv"), "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // 不留 tmp
    expect(existsSync(join(outDir, "ep01.csv.tmp"))).toBe(false);
  });

  it("timeline 摘要字段：basedOn 恒为 global，shotCount / fps 对得上", async () => {
    const r = await deliver({
      t: makeTimeline(),
      formats: ["srt"],
      outDir: outDirFor("summary"),
      projectName: "ep01",
      assetBaseUrl: "D:/x",
      precheck: OK,
    });
    expect(r.timeline.basedOn).toBe("global");
    expect(r.timeline.shotCount).toBe(2);
    expect(r.timeline.fps).toBe(24);
    expect(r.timeline.totalDurationSec).toBeCloseTo(367 / 24, 10);
  });

  it("★ precheck 不 ok → 抛 delivery_incomplete，一个文件都不写（连目录都不建）", async () => {
    const outDir = outDirFor("blocked");
    await expect(
      deliver({
        t: makeTimeline(),
        formats: ["fcpxml", "srt", "csv"],
        outDir,
        projectName: "ep01",
        assetBaseUrl: "D:/x",
        precheck: BAD,
      }),
    ).rejects.toMatchObject({ code: "delivery_incomplete" });

    expect(existsSync(outDir)).toBe(false);
    // 根目录里除了这一轮之前的产物，没有 blocked 目录
    const entries = await readdir(root);
    expect(entries).not.toContain("blocked");
  });

  it("precheck 失败时 details 带上全部 failures（不是只说一句「失败」）", async () => {
    try {
      await deliver({
        t: makeTimeline(),
        formats: ["srt"],
        outDir: outDirFor("blocked2"),
        projectName: "ep01",
        assetBaseUrl: "D:/x",
        precheck: BAD,
      });
      throw new Error("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(DramaError);
      const err = e as DramaError;
      expect(err.code).toBe("delivery_incomplete");
      const details = err.details as { failures: { check: string; shotId?: string }[] };
      expect(details.failures).toHaveLength(1);
      expect(details.failures[0]?.shotId).toBe("s2");
    }
  });

  it("只出单种格式（比如只要 SRT 给平台上传）", async () => {
    const outDir = outDirFor("only-srt");
    const r = await deliver({
      t: makeTimeline(),
      formats: ["srt"],
      outDir,
      projectName: "ep01",
      assetBaseUrl: "D:/x",
      precheck: OK,
    });
    expect(r.files).toHaveLength(1);
    const entries = await readdir(outDir);
    expect(entries).toEqual(["ep01.srt"]);
  });

  it("formats 为空 → invalid_param（不静默什么都不做）", async () => {
    await expect(
      deliver({
        t: makeTimeline(),
        formats: [],
        outDir: outDirFor("empty"),
        projectName: "ep01",
        assetBaseUrl: "D:/x",
        precheck: OK,
      }),
    ).rejects.toMatchObject({ code: "invalid_param" });
  });

  it("formats 有重复 → invalid_param", async () => {
    await expect(
      deliver({
        t: makeTimeline(),
        formats: ["srt", "srt"],
        outDir: outDirFor("dup"),
        projectName: "ep01",
        assetBaseUrl: "D:/x",
        precheck: OK,
      }),
    ).rejects.toMatchObject({ code: "invalid_param" });
  });

  it("outDir 不存在时自动创建", async () => {
    const outDir = join(root, "deep", "nested", "dir");
    const r = await deliver({
      t: makeTimeline(),
      formats: ["csv"],
      outDir,
      projectName: "ep01",
      assetBaseUrl: "D:/x",
      precheck: OK,
    });
    expect(r.files[0]?.path).toBe(join(outDir, "ep01.csv"));
    expect(existsSync(outDir)).toBe(true);
  });

  it("产物内容与单独渲染一致（deliver 不偷偷改写内容）", async () => {
    const outDir = outDirFor("consistency");
    await deliver({
      t: makeTimeline(),
      formats: ["fcpxml", "srt", "csv"],
      outDir,
      projectName: "ep01",
      assetBaseUrl: "D:/out/p1/ep01",
      precheck: OK,
    });
    const xml = await readFile(join(outDir, "ep01.fcpxml"), "utf8");
    expect(xml).toContain('frameDuration="100/2400s"');
    expect(xml).toContain('lane="-1"');

    const srt = await readFile(join(outDir, "ep01.srt"), "utf8");
    expect(srt).toContain("00:00:01,200 --> 00:00:04,350");
  });
});
