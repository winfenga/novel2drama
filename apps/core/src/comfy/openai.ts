/**
 * M8-6 · OpenAI 兼容出口（/v1/*）。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（api-contract §7 L833-1003）。
 *
 * ★★ 包络坑（api-contract L837-842 原文）：`/v1/*` **不使用 {ok, data} 包络**。
 *   这一层给现成 OpenAI SDK 直连，必须符合 OpenAI 原生形状：
 *   - 成功：直接按各接口定义的 JSON 返回，没有 ok/data 包裹
 *   - 失败：{ "error": { "message", "type", "code" } }
 *   包了 ok/data 会让 openai SDK 直接抛解析错误。
 *
 * - GET /v1/models：{ object:"list", data:[{id,object:"model",owned_by:"local"}] }，
 *   只列 available 的工作流；hidden 默认不出现，?all=1 才展开（L863）
 * - POST /v1/images/generations：OpenAI images 形状
 *   { created, data:[{ url, revised_prompt? }] }
 * - POST /v1/videos + GET /v1/videos/:id：任务制形状（L928-946），
 *   deriveTaskType 与 media/deriveTaskType.ts 同一套推导
 *
 * 挂载动作不在本轮（spec §2.1：server.ts 不碰），本轮只交付 createOpenAiRouter()。
 */

import { Router, type Request, type Response } from "express";
import { DramaError, toErrorBody } from "@text2drama/shared";
import type { createRegistry, WorkflowEntry } from "./registry.js";
import { deriveTaskType, type RefItem } from "../media/deriveTaskType.js";
import {
  secondsToFrames,
  framesToSeconds,
} from "../media/frames.js";

type Registry = ReturnType<typeof createRegistry>;

/** OpenAI 失败形状：{ error: { message, type, code } } —— 绝不套 {ok,data} */
function sendOpenAiError(res: Response, err: unknown): void {
  const body = toErrorBody(err);
  res.status(statusOf(err)).json({
    error: {
      message: body.message,
      type: "invalid_request_error",
      code: body.code,
    },
  });
}

function statusOf(err: unknown): number {
  return err instanceof DramaError ? err.http : 500;
}

/** hidden 且未显式 all=1 的条目不出现（api L863） */
function filterModels(
  registry: Registry,
  all: boolean,
): WorkflowEntry[] {
  return registry.list().filter((w) => w.available && (all || !w.hidden));
}

function listModels(registry: Registry, all: boolean): {
  object: "list";
  data: { id: string; object: "model"; owned_by: "local" }[];
} {
  return {
    object: "list",
    data: filterModels(registry, all).map((w) => ({
      id: w.id,
      object: "model" as const,
      owned_by: "local" as const,
    })),
  };
}

/**
 * 硬约束（api L926）：客户端显式传 taskType 且与素材冲突 → 400 invalid_task_type_for_media，
 * 不静默改路。推导与引擎 resolve_task_type 对齐（复用 M7 的 deriveTaskType）。
 */
function resolveTaskTypeOrThrow(
  refs: RefItem[],
  explicitTaskType: string | undefined,
): { taskType: string; promptShell: "three-field" | "six-section" } {
  const derived = deriveTaskType(refs);
  if (explicitTaskType !== undefined) {
    // hybrid 是显式混合声明：素材只构成单一模式时按实际素材走并在 promptShell 回显（L1001）
    const effective = explicitTaskType === "hybrid" && derived !== "t2va" ? derived : explicitTaskType;
    const hasKeyframes = refs.some((r) => r.role === "first" || r.role === "last");
    const hasRefs = refs.length > 0 && !hasKeyframes
      ? refs.some((r) => r.role === "character" || r.role === "scene" || r.kind !== "image")
      : refs.some((r) => r.role === "character" || r.role === "scene" || r.kind !== "image");
    const compatible =
      hasRefs
        ? effective === "ref2va" || effective === "hybrid"
        : !hasKeyframes
          ? effective === "t2va"
          : ["i2va", "l2va", "fl2va", "hybrid"].includes(effective) &&
            !(effective === "i2va" && (refs.filter((r) => r.role === "first").length !== 1 || refs.some((r) => r.role === "last"))) &&
            !(effective === "l2va" && (refs.filter((r) => r.role === "last").length !== 1 || refs.some((r) => r.role === "first"))) &&
            !(effective === "fl2va" && !(refs.some((r) => r.role === "first") && refs.some((r) => r.role === "last")));
    if (!compatible) {
      throw new DramaError("invalid_task_type_for_media", {
        message: `显式 taskType=${explicitTaskType} 与素材构成（推导为 ${derived}）冲突，不静默改路`,
        details: { explicitTaskType, derivedTaskType: derived },
      });
    }
  }
  const taskType = derived;
  const promptShell =
    taskType === "ref2va" || taskType === "hybrid" ? "six-section" : "three-field";
  return { taskType, promptShell };
}

/** durationSec 合法区间 5–15 整数秒，超出直接 400，不封顶截断（api L978） */
function parseDurationSec(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 5 || v > 15) {
    throw new DramaError("invalid_param", {
      message: `durationSec 必须是 5–15 的整数秒，收到 ${JSON.stringify(v)}`,
    });
  }
  return v;
}

export function createOpenAiRouter(deps: {
  registry: Registry;
  /** 视频/图片任务入队与查询由主会话接线时注入（本轮交付 router 形状与 models/generations 逻辑） */
  submitImage?: (opts: { model: string; prompt: string; n: number }) => Promise<{ assetUrls: string[] }>;
  submitVideo?: (opts: {
    model: string;
    prompt: string;
    durationSec: number;
    taskType: string;
  }) => Promise<{ taskId: string; promptId: string }>;
  getVideoTask?: (taskId: string) =>
    | undefined
    | {
        id: string;
        status: "queued" | "running" | "completed" | "failed";
        url?: string;
        error?: { code: string; message: string };
      };
}): Router {
  const router = Router();

  // ── GET /v1/models ──
  router.get("/models", (req: Request, res: Response) => {
    const all = req.query.all === "1";
    res.json(listModels(deps.registry, all));
  });

  // ── POST /v1/images/generations ──
  router.post("/images/generations", (req: Request, res: Response) => {
    void (async () => {
      try {
        const body = req.body as { model?: unknown; prompt?: unknown; n?: unknown };
        if (typeof body.model !== "string" || typeof body.prompt !== "string") {
          throw new DramaError("invalid_param", { message: "model 与 prompt 必填" });
        }
        const entry = deps.registry.get(body.model);
        if (entry === undefined || !entry.available || entry.kind !== "image") {
          throw new DramaError("llm_model_not_found", {
            message: `模型 ${body.model} 不可用`,
          });
        }
        const n = typeof body.n === "number" ? body.n : 1;
        if (deps.submitImage === undefined) {
          throw new DramaError("llm_no_backend", {
            message: "submitImage 未接线（主会话收尾任务）",
          });
        }
        const { assetUrls } = await deps.submitImage({
          model: body.model,
          prompt: body.prompt,
          n,
        });
        // ★ OpenAI images 原生形状：created + data[]，没有 ok/data 包络
        res.status(200).json({
          created: Math.floor(Date.now() / 1000),
          data: assetUrls.map((url) => ({ url })),
        });
      } catch (err) {
        sendOpenAiError(res, err);
      }
    })();
  });

  // ── POST /v1/videos ──
  router.post("/videos", (req: Request, res: Response) => {
    void (async () => {
      try {
        const body = req.body as {
          model?: unknown;
          prompt?: unknown;
          durationSec?: unknown;
          refs?: unknown;
          taskType?: unknown;
        };
        if (typeof body.model !== "string" || typeof body.prompt !== "string") {
          throw new DramaError("invalid_param", { message: "model 与 prompt 必填" });
        }
        const entry = deps.registry.get(body.model);
        if (entry === undefined || !entry.available || entry.kind !== "video") {
          throw new DramaError("llm_model_not_found", {
            message: `模型 ${body.model} 不可用`,
          });
        }
        const durationSec = parseDurationSec(body.durationSec);
        const refs: RefItem[] = Array.isArray(body.refs)
          ? (body.refs as { role?: unknown; kind?: unknown }[]).map((r) => ({
              role: (typeof r.role === "string" ? r.role : "auto") as RefItem["role"],
              kind: (typeof r.kind === "string" ? r.kind : "image") as RefItem["kind"],
            }))
          : [];
        const { taskType, promptShell } = resolveTaskTypeOrThrow(
          refs,
          typeof body.taskType === "string" ? body.taskType : undefined,
        );
        const frames = secondsToFrames(durationSec);
        if (deps.submitVideo === undefined) {
          throw new DramaError("llm_no_backend", {
            message: "submitVideo 未接线（主会话收尾任务）",
          });
        }
        const { taskId } = await deps.submitVideo({
          model: body.model,
          prompt: body.prompt,
          durationSec,
          taskType,
        });
        // ★ 任务制原生形状（api L930-946）：不套 {ok,data}
        res.status(200).json({
          id: `vid_${taskId}`,
          object: "video",
          status: "queued",
          created_at: Math.floor(Date.now() / 1000),
          model: body.model,
          metadata: {
            taskId,
            derivedTaskType: taskType,
            promptShell,
            frames,
            actualDurationSec: framesToSeconds(frames),
            truncatedReferenceSec: null,
          },
        });
      } catch (err) {
        sendOpenAiError(res, err);
      }
    })();
  });

  // ── GET /v1/videos/:id ──
  router.get("/videos/:id", (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === "string" ? rawId : String(rawId);
      const vid = id.startsWith("vid_") ? id.slice(4) : id;
      const task = deps.getVideoTask?.(vid);
      if (task === undefined) {
        throw new DramaError("task_not_found", { message: `任务 ${id} 不存在` });
      }
      // ★ 同一对象形状，不套 {ok,data}；completed 附 url（api L950-955）
      res.status(200).json({
        id,
        object: "video",
        status: task.status,
        ...(task.url !== undefined ? { url: task.url } : {}),
        ...(task.error !== undefined ? { error: task.error } : {}),
      });
    } catch (err) {
      sendOpenAiError(res, err);
    }
  });

  return router;
}
