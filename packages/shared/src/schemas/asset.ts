/**
 * 资产实体（M1-6）。
 *
 * 归属：Block C（assets-integrator）。依据：m1-spec §3.8 + architecture.md L291-345
 * + §3.1.1 编号规则。
 *
 * refine（m1-spec §3.8）：
 * - `assetCode` 必须匹配 `ASSET_CODE_RE`（SC|CH|PR-两位数字-可选变体 ABC）
 * - `role === "keyframe"` 与 `assetCode` 互斥（关键帧不占号，h3 §2.5）
 * - `sha256` 必须 64 位 hex
 * - `kind === "portrait"` 时 `role` 必须是 `identity`（定妆照即身份源，⚖️ 主会话裁）
 */

import { z } from "zod";
import {
  assetKindSchema,
  assetRoleSchema,
  mediaSourceSchema,
  mediaTypeSchema,
} from "./enums.js";
import type { AssetKind, AssetRole, MediaSource, MediaType } from "./enums.js";

/** 资产编号规则："SC-01"|"CH-01"|"PR-01"，可带变体后缀 -A/-B/-C（architecture §3.1.1） */
export const ASSET_CODE_RE = /^(SC|CH|PR)-\d{2}(-[ABC])?$/;

/** 64 位小写十六进制（sha256） */
export const SHA256_RE = /^[0-9a-f]{64}$/;

export const assetSchema = z
  .object({
    id: z.string(),
    kind: assetKindSchema,
    /** "SC-01"|"CH-01"|"PR-01"，可选变体 -A/-B/-C */
    assetCode: z.string().optional(),
    variant: z.enum(["A", "B", "C"]).optional(),
    role: assetRoleSchema.optional(),
    path: z.string(),
    url: z.string(),
    mimeType: z.string(),
    size: z.number(),
    /** 64 位 hex（refine 拦） */
    sha256: z.string(),

    // 图像/视频
    width: z.number().optional(),
    height: z.number().optional(),
    durationSec: z.number().optional(),
    // 音频
    sampleRate: z.number().optional(),
    channels: z.number().optional(),
    // 视频
    frameCount: z.number().optional(),
    fps: z.number().optional(),

    mediaType: mediaTypeSchema.optional(),
    source: mediaSourceSchema,

    // 生成溯源
    parentAssetId: z.string().optional(),
    workflowId: z.string().optional(),
    seed: z.number().optional(),
    params: z.record(z.string(), z.unknown()).optional(),

    // 归属
    shotId: z.string().optional(),
    dialogueLineId: z.string().optional(),

    createdAt: z.number(),
  })
  .superRefine((a, ctx) => {
    if (a.assetCode !== undefined && !ASSET_CODE_RE.test(a.assetCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetCode"],
        message: `assetCode 必须匹配 ${ASSET_CODE_RE.source}（收到 "${a.assetCode}"）`,
      });
    }
    // 关键帧不占号（h3 §2.5）
    if (a.role === "keyframe" && a.assetCode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetCode"],
        message: 'role 为 "keyframe" 的资产不占号，assetCode 必须缺省',
      });
    }
    if (!SHA256_RE.test(a.sha256)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sha256"],
        message: "sha256 必须是 64 位十六进制字符串",
      });
    }
    // 定妆照即身份源（m1-spec §3.8 ⚖️）
    if (a.kind === "portrait" && a.role !== "identity") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["role"],
        message: 'kind 为 "portrait" 时 role 必须是 "identity"',
      });
    }
  });
export type Asset = z.infer<typeof assetSchema>;

// ── AssetManifest：编号分配台账（architecture L344-345）──

export const assetManifestSchema = z.object({
  items: z.array(
    z.object({
      /** 画面别名，对应 Shot.pictureIndex 的 key（"<Picture 1>" 等） */
      pictureAlias: z.string(),
      assetCode: z.string(),
      variant: z.string().optional(),
      /** 引用了该编号的镜头 id 列表 */
      usedInShots: z.array(z.string()),
    }),
  ),
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;

export type { AssetKind, AssetRole, MediaSource, MediaType };
