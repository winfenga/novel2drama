/**
 * M10-5 + 总入口 · `deliver()`。
 *
 * 依据：`docs/api-contract.md` §8.5.8（L1217-1226）、§8.5.9（L1228-1256）、
 * `docs/m101314-spec.md` §2.2「precheck 不 ok → 直接抛 `delivery_incomplete`，一个文件都不写」。
 *
 * 顺序（关键）：
 * 1. 先看 precheck，不 ok 立刻抛——**连目录都不建**
 * 2. 三件套**全部在内存里渲染完**，任一渲染失败也一个文件都不写
 * 3. 逐份原子写（temp → rename），写失败抛错不留半成品
 *
 * 这不是「先写再删」，是「算不出来就不落盘」。
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DramaError } from "@text2drama/shared";
import { renderCsv } from "./csv.js";
import { renderFcpxml } from "./fcpxml.js";
import type { PrecheckResult } from "./precheck.js";
import { renderSrt } from "./srt.js";
import type { EpisodeTimeline } from "./timeline.js";

export type DeliveryFormat = "fcpxml" | "srt" | "csv";

export interface DeliveryFile {
  format: DeliveryFormat;
  path: string;
  bytes: number;
}

export interface DeliveryResult {
  episodeId: string;
  timeline: {
    totalDurationSec: number;
    shotCount: number;
    fps: number;
    basedOn: "global";
  };
  files: DeliveryFile[];
}

/** 三件套的扩展名（顺序即写出顺序，与契约示例一致） */
const FORMAT_EXT: Record<DeliveryFormat, string> = {
  fcpxml: "fcpxml",
  srt: "srt",
  csv: "csv",
} as const;

export async function deliver(opts: {
  t: EpisodeTimeline;
  formats: DeliveryFormat[];
  outDir: string;
  projectName: string;
  assetBaseUrl: string;
  precheck: PrecheckResult;
}): Promise<DeliveryResult> {
  const { t, formats, outDir, projectName, assetBaseUrl, precheck } = opts;

  // ── 1. 校验不过：一个文件都不写（连 outDir 都不建）──
  if (!precheck.ok) {
    throw new DramaError("delivery_incomplete", {
      message: `导出前校验有 ${precheck.failures.length} 项未通过，拒绝导出`,
      details: {
        episodeId: t.episodeId,
        failures: precheck.failures,
      },
    });
  }

  if (formats.length === 0) {
    throw new DramaError("invalid_param", {
      message: "formats 为空：至少指定一种交付格式（fcpxml / srt / csv）",
      details: { episodeId: t.episodeId },
    });
  }
  const dup = formats.filter((f, i) => formats.indexOf(f) !== i);
  if (dup.length > 0) {
    throw new DramaError("invalid_param", {
      message: `formats 有重复项：${[...new Set(dup)].join(", ")}`,
      details: { episodeId: t.episodeId },
    });
  }

  // ── 2. 全量渲染（内存），任一失败都不落盘 ──
  const rendered = new Map<DeliveryFormat, string>();
  for (const fmt of formats) {
    rendered.set(fmt, renderFor(fmt, t, { projectName, assetBaseUrl }));
  }

  // ── 3. 原子写：temp → rename ──
  await mkdir(outDir, { recursive: true });

  const files: DeliveryFile[] = [];
  for (const fmt of formats) {
    const content = rendered.get(fmt);
    if (content === undefined) {
      // 走到这里说明 formats 与渲染用的键不同步，属实现错误，直接抛不跳过
      throw new DramaError("invalid_param", {
        message: `渲染结果缺少格式 ${fmt}`,
        details: { episodeId: t.episodeId, format: fmt },
      });
    }
    const path = join(outDir, `${t.episodeId}.${FORMAT_EXT[fmt]}`);
    const tmpPath = `${path}.tmp`;
    try {
      await writeFile(tmpPath, content, "utf8");
      await rename(tmpPath, path);
    } catch (e) {
      await rm(tmpPath, { force: true });
      throw new DramaError("delivery_incomplete", {
        message: `写 ${fmt} 失败，导出中止`,
        details: {
          episodeId: t.episodeId,
          format: fmt,
          path,
          cause: e instanceof Error ? e.message : String(e),
        },
        cause: e,
      });
    }
    // 字节数是写出去的 UTF-8 字节，不是字符数（CSV 的 BOM 也在这 3 个字节里）
    files.push({ format: fmt, path, bytes: Buffer.byteLength(content, "utf8") });
  }

  return {
    episodeId: t.episodeId,
    timeline: {
      totalDurationSec: t.totalDurationSec,
      shotCount: t.shots.length,
      fps: t.fps,
      // 明确标注：本次交付的时间轴基准是全集绝对时间
      basedOn: "global",
    },
    files,
  };
}

function renderFor(
  fmt: DeliveryFormat,
  t: EpisodeTimeline,
  opts: { projectName: string; assetBaseUrl: string },
): string {
  switch (fmt) {
    case "fcpxml":
      return renderFcpxml(t, opts);
    case "srt":
      return renderSrt(t);
    case "csv":
      return renderCsv(t);
    default: {
      // exhaustiveness：新增格式时这里会编译报错，而不是运行时静默跳过
      const never: never = fmt;
      throw new DramaError("invalid_param", {
        message: `未知交付格式 ${String(never)}`,
        details: { format: never },
      });
    }
  }
}
