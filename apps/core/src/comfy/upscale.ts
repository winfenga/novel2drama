/**
 * M8-5 · 图片超分绑定（SeedVR2 3B）。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（architecture L1314-1337）。
 *
 * ★ `resolution` 是「目标短边」不是倍率（architecture L1250-1268）：
 *   填 ≤ 原短边 = 静默缩图——ComfyUI 不会报错，只会降分辨率。
 *   所以提交前必须 assertReallyUpscaling(srcShortEdge, resolution)，
 *   resolution ≤ 原短边 → 显式报错（message 含两个数值），不静默缩图。
 *
 * SeedVR2 三件套（architecture L1224-1232）：SeedVR2LoadDiTModel / SeedVR2LoadVAEModel /
 * SeedVR2VideoUpscaler。**不许走 UNETLoader+VAELoader 通用链**——SeedVR2 权重在
 * models/SEEDVR2/（插件自注册目录），通用加载器看不见，那条链跑不起来（L1234-1237 已废弃）。
 *
 * 静态图参数（architecture L1270-1290 实测可行值）：batch_size=1（必须）、
 * offload_device=cpu（8G 卡必须）、DiT cache_model=true + offload_device=cpu
 * （cache_model=true 时节点源码硬要求，否则 ValueError）、VAE encode/decode_tiled=true。
 */

import { DramaError } from "@text2drama/shared";
import type { createComfyClient } from "./client.js";

type ComfyClient = ReturnType<typeof createComfyClient>;

/**
 * 提交前断言：resolution 必须严格大于原短边，否则就是缩图。
 * 抛 DramaError invalid_param，message 同时含两个数值。
 */
export function assertReallyUpscaling(
  srcShortEdge: number,
  resolution: number,
): void {
  if (!(resolution > srcShortEdge)) {
    throw new DramaError("invalid_param", {
      message: `resolution=${resolution} 不大于原图短边 ${srcShortEdge}px，这是缩图不是超分（SeedVR2 的 resolution 是目标短边）。要放大请填比 ${srcShortEdge} 大的值`,
      details: { srcShortEdge, resolution },
    });
  }
}

export interface UpscaleWorkflow {
  /** API 格式工作流（/prompt 直收的 prompt 对象） */
  prompt: Record<string, unknown>;
  /** 三件套节点 id（供测试断言结构，防退化到通用加载链） */
  nodeIds: { dit: string; vae: string; upscaler: string };
}

/** 组装 SeedVR2 三件套 API 工作流（architecture L1224-1229 节点链 + L1270-1290 参数表） */
export function buildSeedVr2UpscaleWorkflow(opts: {
  /** ComfyUI input 目录内相对路径（LoadImage 的 image 参数） */
  assetPath: string;
  resolution: number;
  seed?: number;
}): UpscaleWorkflow {
  const seed = opts.seed ?? 42; // 固定便于复现（L1274）
  const prompt: Record<string, unknown> = {
    "1": {
      class_type: "SeedVR2LoadDiTModel",
      inputs: {
        model: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
        attention_mode: "sdpa",
        offload_device: "cpu", // cache_model=true 时必填（L1286-1287），否则节点抛 ValueError
        cache_model: true, // 批量超分省重复加载约 8s（L1285）
      },
    },
    "2": {
      class_type: "SeedVR2LoadVAEModel",
      inputs: {
        model: "ema_vae_fp16.safetensors",
        encode_tiled: true, // 1024 瓦片 / 128 重叠，8G 卡必需（L1288）
        decode_tiled: true,
      },
    },
    "3": {
      class_type: "LoadImage",
      inputs: { image: opts.assetPath },
    },
    "4": {
      class_type: "SeedVR2VideoUpscaler",
      inputs: {
        images: ["3", 0],
        dit: ["1", 0],
        vae: ["2", 0],
        resolution: opts.resolution, // 目标短边，不是倍率
        max_resolution: 4096,
        batch_size: 1, // 静态图必须 1（L1277）
        uniform_batch_size: false,
        temporal_overlap: 0,
        prepend_frames: 0,
        color_correction: "lab",
        input_noise_scale: 0.0,
        latent_noise_scale: 0.0,
        offload_device: "cpu", // 8G 卡必须，否则 VAE 解码易 OOM（L1284）
        seed,
      },
    },
    "5": {
      class_type: "SaveImage",
      inputs: { images: ["4", 0], filename_prefix: "seedvr2_upscale" },
    },
  };
  return {
    prompt,
    nodeIds: { dit: "1", vae: "2", upscaler: "4" },
  };
}

export function createUpscaleFlow(client: ComfyClient): {
  submitImageUpscale(opts: {
    assetPath: string;
    resolution: number;
    srcShortEdge: number;
    seed?: number;
  }): Promise<{ promptId: string }>;
} {
  return {
    async submitImageUpscale(opts: {
      assetPath: string;
      resolution: number;
      srcShortEdge: number;
      seed?: number;
    }): Promise<{ promptId: string }> {
      assertReallyUpscaling(opts.srcShortEdge, opts.resolution);
      const { prompt } = buildSeedVr2UpscaleWorkflow({
        assetPath: opts.assetPath,
        resolution: opts.resolution,
        seed: opts.seed,
      });
      return client.submit(prompt);
    },
  };
}
