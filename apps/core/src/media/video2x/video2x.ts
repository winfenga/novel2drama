/**
 * M9-6 · Video2X 子进程封装（spec §3.2 / api §8 L1007-1073）。
 *
 * 冻结要点：
 * - ★ `-d 1` 写死（api L1041：本机 0 是 AMD 核显；**写死断言防退化到 0**）
 * - `--no-progress`（关进度条；stdout 仍打帧号，按行正则 `/frame\s+(\d+)\s*\/\s*(\d+)/i` 解析进度）
 * - 运行前 acquire("video2x")（GPU 互斥：与 ComfyUI/TTS 不能并发）
 * - 子进程失败 → video2x_failed(500) 带 stderr 尾部，原错不吞
 */
import { spawn } from "node:child_process";
import { DramaError } from "@text2drama/shared";

import type { GpuLock } from "../../gpu/lock.js";

export const DEFAULT_VIDEO2X_PATH = "D:\\AI\\Video2X Qt6\\video2x.exe";
export const DEFAULT_DEVICE = 1; // ★写死：0 是 AMD 核显，本机必须 1（api L1041）

export type SpawnLike = typeof import("node:child_process").spawn;

/** api L1071 冻结正则 */
export const FRAME_RE = /frame\s+(\d+)\s*\/\s*(\d+)/i;

export interface Video2xProgress {
  frame: number;
  total: number;
}

export interface Video2xOpts {
  inputPath: string;
  outputPath: string;
  processor: string; // realesrgan / realcugan / libplacebo / rife
  model?: string;
  scale?: number;
  codec?: string;
  device?: number; // 默认写死 1；显式传 0 也放行（调用方自负），但默认不退化
  exePath?: string;
  lock: GpuLock;
  spawn?: SpawnLike;
  onProgress?: (p: Video2xProgress) => void;
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCapture(
  spawnFn: SpawnLike,
  exe: string,
  args: string[],
  onLine?: (line: string) => void,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const feed = (buf: Buffer, sink: (s: string) => void) => {
      const chunk = buf.toString();
      sink(chunk);
      for (const line of chunk.split(/\r?\n/)) if (line !== "") onLine?.(line);
    };
    child.stdout?.on("data", (d: Buffer) => feed(d, (s) => (stdout += s)));
    child.stderr?.on("data", (d: Buffer) => feed(d, (s) => (stderr += s)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * 组 CLI 参数（api L1033-1043 对照表）。`-d` 默认写死 1，且参数数组里必须真实出现——
 * 测试里有「-d 1 存在且不为 0」的防退化断言。
 */
export function buildVideo2xArgs(o: {
  inputPath: string;
  outputPath: string;
  processor: string;
  model?: string;
  scale?: number;
  codec?: string;
  device?: number;
}): string[] {
  const device = o.device ?? DEFAULT_DEVICE;
  const args = [
    "-i", o.inputPath,
    "-o", o.outputPath,
    "-p", o.processor,
  ];
  if (o.model !== undefined) args.push("-m", o.model);
  if (o.scale !== undefined) args.push("-s", String(o.scale));
  args.push("-d", String(device));
  args.push("-c", o.codec ?? "libx264");
  args.push("--no-progress");
  return args;
}

/**
 * 跑 Video2X 超分/插帧。
 * @throws gpu_lock_held(409) / video2x_failed(500，含 stderr 尾部)
 */
export async function runVideo2x(opts: Video2xOpts): Promise<{ assetPath: string; logs: string[] }> {
  await opts.lock.acquire("video2x");
  try {
    const exe = opts.exePath ?? DEFAULT_VIDEO2X_PATH;
    const spawnFn = opts.spawn ?? spawn;
    const args = buildVideo2xArgs(opts);
    const logs: string[] = [];
    const { code, stderr } = await runCapture(spawnFn, exe, args, (line) => {
      logs.push(line);
      const m = FRAME_RE.exec(line);
      if (m) opts.onProgress?.({ frame: Number(m[1]), total: Number(m[2]) });
    });
    if (code !== 0) {
      throw new DramaError("video2x_failed", {
        message: `Video2X 子进程失败（exit ${code}）`,
        details: { inputPath: opts.inputPath, stderrTail: stderr.slice(-800) },
      });
    }
    return { assetPath: opts.outputPath, logs };
  } finally {
    opts.lock.release("video2x"); // 成功/失败都释放，不静默持锁
  }
}
