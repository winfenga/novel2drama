/**
 * M9-5 · ffmpeg soxr 重采样（spec §3.2 / architecture L1795-1844）。
 *
 * 冻结命令行（architecture L1839 逐字）：
 *   ffmpeg -y -i in.wav -ar 48000 -ac 1 -c:a pcm_s16le out.wav
 *
 * - ffmpegPath 可注入（默认 D:\AI\IndexTTS2_5\bin\ffmpeg.exe——内置 147MB 完整版含 libsoxr，
 *   不依赖 ComfyUI 目录）
 * - 返回 driftMs（实测零漂移；由 ffprobe 输出时长与源时长求差）
 * - ffmpeg 进程失败 → 原错上抛，绝不静默降级
 */
import { spawn } from "node:child_process";
import { DramaError } from "@text2drama/shared";

export const DEFAULT_FFMPEG_PATH = "D:\\AI\\IndexTTS2_5\\bin\\ffmpeg.exe";

/** 注入点：测试 mock child_process 时替换 spawn 形状 */
export type SpawnLike = typeof spawn;

export interface ResampleDeps {
  /** 注入 mock spawn；默认 node:child_process.spawn */
  spawn?: SpawnLike;
  /** 用 ffprobe 读时长；测试可注入。返回秒 */
  probeDurationSec?: (path: string) => Promise<number>;
}

interface SpawnResult {
  code: number | null;
  stderr: string;
}

function runFfmpeg(
  spawnFn: SpawnLike,
  ffmpegPath: string,
  args: string[],
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // stdio 全 pipe：stdout 虽不用但类型上必须存在（ignore 会让 stdout 类型收窄为 null，
    // 下面的 ?.on 链推断成 never）；stderr 必须捕获供失败详情
    const child = spawnFn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      void d; // stdout 不消费，但保留 pipe 让类型成立
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject); // 进程起不来（ENOENT 等）→ 原错上抛
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/**
 * 22050/任意采样率 → 48000 单声道 s16le（交付规格，architecture L1813）。
 * soxr 由 ffmpeg 内置 libsoxr 生效（-ar 重采样默认引擎按构建；IndexTTS2_5 内置版含 libsoxr）。
 * 实测：109s 音频 71ms、零漂移、无镜像（architecture L1815-1832）。
 */
export async function resample48k(
  inputPath: string,
  outputPath: string,
  opts?: ResampleDeps & { ffmpegPath?: string },
): Promise<{ driftMs: number }> {
  const ffmpegPath = opts?.ffmpegPath ?? DEFAULT_FFMPEG_PATH;
  const spawnFn = opts?.spawn ?? spawn;
  const probe = opts?.probeDurationSec ?? defaultProbe(spawnFn, ffmpegPath);

  const args = ["-y", "-i", inputPath, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", outputPath];
  const { code, stderr } = await runFfmpeg(spawnFn, ffmpegPath, args);
  if (code !== 0) {
    throw new DramaError("invalid_param", {
      message: `ffmpeg 重采样失败（exit ${code}）`,
      details: { inputPath, outputPath, stderrTail: stderr.slice(-800) },
    });
  }

  // driftMs = 输出实测时长 − 输入实测时长（ms）。实测零漂移（architecture L1830-1831）。
  const inSec = await probe(inputPath);
  const outSec = await probe(outputPath);
  return { driftMs: Math.round((outSec - inSec) * 1000) };
}

/** 默认用 ffprobe（与 ffmpeg 同目录）读时长；失败原错上抛不猜。 */
function defaultProbe(spawnFn: SpawnLike, ffmpegPath: string): (path: string) => Promise<number> {
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  return async (path: string) => {
    const { code, stderr } = await runFfmpeg(
      spawnFn,
      ffprobePath,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    );
    if (code !== 0) {
      throw new DramaError("invalid_param", {
        message: `ffprobe 读时长失败（exit ${code}）`,
        details: { path, stderrTail: stderr.slice(-800) },
      });
    }
    const sec = Number.parseFloat(stderr.trim());
    if (!Number.isFinite(sec)) {
      throw new DramaError("invalid_param", {
        message: `ffprobe 输出无法解析为秒数：${stderr.trim().slice(0, 100)}`,
        details: { path },
      });
    }
    return sec;
  };
}
