/**
 * M9-5 测试 · ffmpeg soxr 重采样（子进程全 mock，零真实 ffmpeg）。
 */
import { describe, expect, it } from "vitest";
import { DramaError } from "@text2drama/shared";

import { resample48k, DEFAULT_FFMPEG_PATH, type SpawnLike } from "./resample.js";

/** 可编程 mock spawn：记录调用并按脚本回 exit code / stderr */
function mockSpawn(script: { code: number; stderr: string }[]): {
  spawn: SpawnLike;
  calls: { exe: string; args: string[] }[];
} {
  const calls: { exe: string; args: string[] }[] = [];
  let i = 0;
  const spawn = ((exe: string, args: string[]) => {
    calls.push({ exe, args: [...args] });
    const step = script[Math.min(i++, script.length - 1)]!;
    const handlers: Record<string, ((v: never) => void)[]> = {};
    const emit = (ev: string, v?: unknown) => {
      for (const h of handlers[ev] ?? []) (h as unknown as (x?: unknown) => void)(v);
    };
    queueMicrotask(() => {
      emit("data", Buffer.from(step.stderr)); // stdout
      emit("close", step.code);
    });
    return {
      stdout: { on: (ev: string, h: (v: never) => void) => void ((handlers[ev] ??= []).push(h)) },
      stderr: { on: (ev: string, h: (v: never) => void) => void ((handlers[ev] ??= []).push(h)) },
      on: (ev: string, h: (v: never) => void) => void ((handlers[ev] ??= []).push(h)),
    };
  }) as unknown as SpawnLike;
  return { spawn, calls };
}

describe("M9-5 resample48k", () => {
  it("成功：命令行逐字匹配 spec（-y -i in -ar 48000 -ac 1 -c:a pcm_s16le out）；driftMs=0（实测零漂移）", async () => {
    const { spawn, calls } = mockSpawn([
      { code: 0, stderr: "" }, // ffmpeg
      { code: 0, stderr: "6.820000\n" }, // ffprobe in
      { code: 0, stderr: "6.820000\n" }, // ffprobe out
    ]);
    const r = await resample48k("in.wav", "out.wav", {
      spawn,
      ffmpegPath: "D:\\AI\\IndexTTS2_5\\bin\\ffmpeg.exe",
    });
    expect(r).toEqual({ driftMs: 0 });
    expect(calls[0]).toEqual({
      exe: DEFAULT_FFMPEG_PATH,
      args: ["-y", "-i", "in.wav", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "out.wav"],
    });
    expect(calls[1]!.exe).toBe("D:\\AI\\IndexTTS2_5\\bin\\ffprobe.exe");
  });

  it("ffmpegPath 可注入", async () => {
    const { spawn, calls } = mockSpawn([{ code: 0, stderr: "" }, { code: 0, stderr: "1\n" }, { code: 0, stderr: "1\n" }]);
    await resample48k("a.wav", "b.wav", { spawn, ffmpegPath: "C:\\bin\\ffmpeg.exe" });
    expect(calls[0]!.exe).toBe("C:\\bin\\ffmpeg.exe");
    expect(calls[1]!.exe).toBe("C:\\bin\\ffprobe.exe");
  });

  it("进程失败（非零 exit）→ 原错上抛（stderr 尾部进 details），绝不静默降级", async () => {
    const { spawn } = mockSpawn([{ code: 1, stderr: "Invalid data found when processing input" }]);
    await expect(resample48k("bad.wav", "out.wav", { spawn })).rejects.toSatisfy((e: unknown) => {
      const de = e as DramaError;
      expect(de.message).toContain("ffmpeg 重采样失败");
      expect(de.details).toMatchObject({ stderrTail: expect.stringContaining("Invalid data") });
      return true;
    });
  });

  it("driftMs 用实测时长求差（out-in）", async () => {
    const { spawn } = mockSpawn([{ code: 0, stderr: "" }, { code: 0, stderr: "6.820000\n" }, { code: 0, stderr: "6.820003\n" }]);
    const r = await resample48k("a.wav", "b.wav", { spawn });
    expect(r.driftMs).toBe(0); // 0.000003s → round 0ms（实测零漂移量级）
  });

  it("ffprobe 失败 → 原错上抛", async () => {
    const { spawn } = mockSpawn([{ code: 0, stderr: "" }, { code: 2, stderr: "No such file" }]);
    await expect(resample48k("a.wav", "b.wav", { spawn })).rejects.toMatchObject({
      message: expect.stringContaining("ffprobe 读时长失败"),
    });
  });
});
