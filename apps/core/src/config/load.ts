/**
 * 配置读取与校验。
 *
 * 冻结签名：`docs/m0-spec.md` §5.10。
 * 依据：`docs/api-contract.md` §5.2（L626-657 配置表结构）、`architecture.md` L523-542。
 *
 * ⚠️ 铁律：配置损坏时**不许静默重置**。
 *    悄悄回退到默认配置等于把用户的 API Key 和本地后端配置一次抹掉，
 *    用户侧表现为「Key 莫名丢失」。宁可启动失败并报清楚路径，也不能吞。
 *
 * 读路径顺序（`m0-spec.md` §9 漂移 D9，`paths.ts` 只给路径不做决策）：
 * 1. `paths.configFile`（新 home）
 * 2. 不存在 → `paths.legacyConfigFile`（旧 home，只读）
 * 3. 都不存在 → 造默认配置，**写回新 home**
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { DramaError } from "@text2drama/shared";
import { z } from "zod";

import { resolvePaths } from "../paths.js";
import { saveConfig } from "./save.js";
import { DramaConfigSchema } from "./types.js";
import type { DramaConfig } from "./types.js";

/** 默认出图/出片参数（`api-contract.md` L656 示例值） */
const DEFAULT_RESOLUTION = "1080x1920";
const DEFAULT_FPS = 24;

/** token 熵：18 字节 → 36 位 hex（`architecture.md` L481） */
const TOKEN_BYTES = 18;

/**
 * 生成一份全新默认配置。**不落盘** —— 落盘是 `loadConfig` 的事。
 *
 * `llmBackends` 默认空表而不是预填 DeepSeek：
 * 预填一个带假 Key 的后端会让 `GET /api/config` 显示「已配置」，
 * 用户以为能跑，实际调用必 401。空表直接报 `llm_no_backend`，提示明确。
 */
export function defaultConfig(): DramaConfig {
  return {
    version: 1,
    token: randomBytes(TOKEN_BYTES).toString("hex"),
    llmBackends: [],
    roleRouting: {},
    generation: { resolution: DEFAULT_RESOLUTION, fps: DEFAULT_FPS },
  };
}

/**
 * 用 zod 校验任意输入并返回**类型化的深拷贝**（zod parse 产生新对象）。
 * 失败抛 `DramaError("invalid_param")`，`details` 带 zod 的问题清单。
 */
export function validateConfig(cfg: unknown): DramaConfig {
  const result = DramaConfigSchema.safeParse(cfg);
  if (!result.success) {
    throw new DramaError("invalid_param", {
      message: "配置格式非法",
      hint: "检查 version / token / llmBackends / roleRouting / generation 五个字段",
      details: z.treeifyError(result.error),
    });
  }
  return result.data;
}

/**
 * 读一个配置文件。返回 `undefined` 表示**文件不存在**（唯一可回退的情形）。
 *
 * 读到了但内容坏掉 → 直接抛，**不返回 undefined**：
 * 那会让上层误以为「没配置过」而重置，正好踩中要避免的 Key 丢失。
 */
function readConfigFile(file: string): DramaConfig | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new DramaError("invalid_param", {
      message: `配置文件读取失败：${file}`,
      hint: "检查文件权限（应为 0600、属主可读）",
      cause: e,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new DramaError("invalid_param", {
      message: `配置文件不是合法 JSON：${file}`,
      hint: "修好 JSON 后重启；若想彻底重置，请手动删除该文件再启动",
      cause: e,
    });
  }

  try {
    return validateConfig(parsed);
  } catch (e) {
    // 结构对不上时补上路径，否则用户只知道「配置非法」却不知是哪个文件
    if (e instanceof DramaError) {
      throw new DramaError(e.code, {
        message: `${e.message}：${file}`,
        ...(e.hint === undefined ? {} : { hint: e.hint }),
        ...(e.details === undefined ? {} : { details: e.details }),
        cause: e,
      });
    }
    throw e;
  }
}

/**
 * 读配置。
 *
 * - 新配置在 → 读它
 * - 新配置不在、旧配置在 → **读旧配置**（只读，不动旧文件）；不搬文件、不自动写新
 * - 两者都没有 → 生成默认配置、**写回新 home**、返回
 *
 * 旧配置读出来后不落盘：用户下次显式改配置（PUT /api/config）时才写新目录。
 * 自动复制会在旧文件被其他工具同时编辑时产生难以解释的分叉。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): DramaConfig {
  const paths = resolvePaths(env);

  const current = readConfigFile(paths.configFile);
  if (current !== undefined) return current;

  // 新配置不存在才看旧目录；注意 legacyConfigFile 可能和 configFile 同路径
  // （用户把 DRAMA_HOME 指到别处时不会撞，但同名情形仍要防）
  if (paths.legacyConfigFile !== paths.configFile) {
    const legacy = readConfigFile(paths.legacyConfigFile);
    if (legacy !== undefined) return legacy;
  }

  const cfg = defaultConfig();
  saveConfig(cfg, env);
  return cfg;
}
