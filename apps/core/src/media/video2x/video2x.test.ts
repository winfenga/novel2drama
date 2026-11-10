/**
 * M9-6 测试 · Video2X 封装（子进程全 mock）。
 * ★重点：-d 1 写死断言（防退化到 0）+ --no-progress + 帧号正则 + 锁。
 */
import { describe, expect, it } from "vitest";

import { buildVideo2xArgs, runVideo2x, DEFAULT_DEVICE, FRAME_RE } from "./video2x.js";
import { createGpuLock } from "../../gpu/lock.js";

function mockSpawn(script: { code: number; stdout: string; stderr?: string }[]): {
  spawn: import("../resample/resample.js").SpawnLike;
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
      emit("stdout-data", Buffer.from(step.stdout));
      if (step.stderr) emit("stderr-data", Buffer.from(step.stderr));
      emit("close", step.code);
    });
    return {
      stdout: { on: (ev: string, h: (v: never) => void) => void ((handlers[`stdout-${ev}`] ??= []).push(h)) },
      stderr: { on: (ev: string, h: (v: never) => void) => void ((handlers[`stderr-${ev}`] ??= []).push(h)) },
      on: (ev: string, h: (v: never) => void) => void ((handlers[ev] ??= []).push(h)),
    };
  }) as unknown as import("../resample/resample.js").SpawnLike;
  return { spawn, calls };
}

describe("buildVideo2xArgs", () => {
  it("★ -d 1 写死：默认 device 必须是 1（0 是 AMD 核显），参数数组真实包含 ['-d','1']", () => {
    const args = buildVideo2xArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      processor: "realesrgan",
    });
    const di = args.indexOf("-d");
    expect(di).toBeGreaterThanOrEqual(0);
    expect(args[di + 1]).toBe("1");
    expect(DEFAULT_DEVICE).toBe(1);
  });

  it("--no-progress 存在；model/scale/codec 按 api 对照表映射", () => {
    const args = buildVideo2xArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      processor: "realesrgan",
      model: "realesrgan-plus",
      scale: 2,
      codec: "h264_nvenc",
    });
    expect(args).toContain("--no-progress");
    expect(args).toEqual([
      "-i", "in.mp4",
      "-o", "out.mp4",
      "-p", "realesrgan",
      "-m", "realesrgan-plus",
      "-s", "2",
      "-d", "1",
      "-c", "h264_nvenc",
      "--no-progress",
    ]);
  });
});

describe("FRAME_RE（api L1071 冻结正则）", () => {
  it("解析帧号行", () => {
    const m = FRAME_RE.exec("frame 1200 / 4800");
    expect(m?.[1]).toBe("1200");
    expect(m?.[2]).toBe("4800");
  });
});

describe("runVideo2x", () => {
  it("运行前 acquire('video2x')；成功后 release", async () => {
    const lock = createGpuLock();
    const { spawn, calls } = mockSpawn([{ code: 0, stdout: "frame 0 / 100\nframe 100 / 100\n" }]);
    const frames: number[] = [];
    const r = await runVideo2x({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      processor: "realesrgan",
      model: "realesrgan-plus",
      scale: 2,
      lock,
      spawn,
      onProgress: (p) => frames.push(p.frame),
    });
    expect(r.assetPath).toBe("out.mp4");
    expect(lock.status()).toEqual({ holder: null }); // 已释放
    expect(calls[0]!.exe).toBe("D:\\AI\\Video2X Qt6\\video2x.exe");
    expect(frames).toEqual([0, 100]);
  });

  it("锁被 ComfyUI 占用 → gpu_lock_held，且不启动子进程", async () => {
    const lock = createGpuLock();
    await lock.acquire("comfyui");
    const { spawn, calls } = mockSpawn([{ code: 0, stdout: "" }]);
    await expect(
      runVideo2x({ inputPath: "in.mp4", outputPath: "out.mp4", processor: "rife", lock, spawn }),
    ).rejects.toMatchObject({ code: "gpu_lock_held" });
    expect(calls).toHaveLength(0);
  });

  it("子进程失败 → video2x_failed(500) 带 stderr 尾部；锁仍释放", async () => {
    const lock = createGpuLock();
    const { spawn } = mockSpawn([{ code: -1073740791, stdout: "", stderr: "CUDA out of memory" }]);
    await expect(
      runVideo2x({ inputPath: "in.mp4", outputPath: "out.mp4", processor: "realesrgan", lock, spawn }),
    ).rejects.toSatisfy((e: unknown) => {
      const de = e as import("@text2drama/shared").DramaError;
      expect(de.code).toBe("video2x_failed");
      expect(de.http).toBe(500);
      expect(de.details).toMatchObject({ stderrTail: expect.stringContaining("CUDA out of memory") });
      return true;
    });
    expect(lock.status()).toEqual({ holder: null });
  });
});
