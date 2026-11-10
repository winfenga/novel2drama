/**
 * 错误码表 —— 全项目唯一权威实现。
 *
 * 依据：`docs/api-contract.md` §0.3（L45-83）36 条 + `api-contract.md` §8.5.9（L1256）的
 * `delivery_incomplete`，共 37 条。中文 message 逐条照抄 api-contract 原文，
 * 仅去掉 Markdown 强调符（`**` / 反引号）——那是文档排版，不该出现在响应体里。
 *
 * ⚠️ `source_video_truncated` 是 http 200 的**非错误标记**：
 *    它进表（客户端要能识别这个 code），但**不许当作 DramaError 抛出**，只作为结果字段存在。
 */

export interface ErrorMeta {
  http: number;
  message: string;
}

export const ERROR_CODES = {
  project_not_found: { http: 404, message: "项目不存在" },
  shot_not_found: { http: 404, message: "分镜不存在" },
  scene_not_found: { http: 404, message: "场景不存在" },
  asset_not_found: { http: 404, message: "资产不存在" },
  asset_in_use: { http: 409, message: "资产被 Shot.outputs 引用，拒绝删除" },
  llm_no_backend: { http: 400, message: "没有任何启用的 LLM 后端（不降级）" },
  llm_no_role: { http: 400, message: "该角色（text/prompt/plan）没有可用后端" },
  llm_private_url: { http: 400, message: "指向内网/loopback 但未标 local: true" },
  llm_unreachable: { http: 502, message: "后端连不上（本地 Ollama 没起也归这里）" },
  llm_auth: { http: 502, message: "上游 401/403，Key 无效或无权限" },
  llm_model_not_found: { http: 502, message: "模型名不对" },
  llm_bad_json: { http: 502, message: "模型返回的不是合法 JSON（已重试仍失败）" },
  token_budget_exceeded: {
    http: 429,
    message: "项目 LLM token 预算用尽（批量重生成类操作被拒）",
  },
  task_busy: { http: 409, message: "同类任务在跑，拒绝并发" },
  task_not_found: { http: 404, message: "任务不存在" },
  confirm_run_required: { http: 400, message: "需显式确认执行（未带 confirmRun）" },
  vram_insufficient: { http: 503, message: "剩余显存低于守门阈值，队列挂起" },
  queue_full: { http: 503, message: "队列已满，拒绝入队" },
  comfy_offline: { http: 503, message: "本地 ComfyUI 不可达" },
  comfy_out_of_memory: { http: 500, message: "ComfyUI 显存不足（已尝试 /free 仍失败）" },
  workflow_unavailable: { http: 500, message: "工作流所需模型/节点缺失" },
  gpu_lock_held: {
    http: 409,
    message: "GPU 被另一类任务占用（生成↔超分↔配音三方互斥）",
  },
  video2x_failed: { http: 500, message: "Video2X 子进程失败（含 stderr 尾部）" },
  voice_offline: { http: 503, message: "IndexTTS 服务不可达（:17863）" },
  voice_not_loaded: { http: 409, message: "TTS 服务在跑但模型未装进显存" },
  voice_no_reference: {
    http: 400,
    message: "角色没有绑定 VoiceProfile，且未显式给 voice",
  },
  source_video_truncated: {
    http: 200,
    message: "非错误：参考视频超过 15s 被截断，结果里带标记",
  },
  unsupported_video_media: { http: 400, message: "参考媒体格式不支持" },
  missing_reference_image: {
    http: 400,
    message: "模式要求首帧/尾帧但没有对应 role 的图",
  },
  missing_reference_media: { http: 400, message: "模式要求参考媒体但没有" },
  duplicate_frame_role: {
    http: 400,
    message: "同一 role 标了多张图（first/last 只能各一张）",
  },
  hybrid_needs_keyframe: { http: 400, message: "走 hybrid 但一个关键帧都没给" },
  hybrid_needs_reference: { http: 400, message: "走 hybrid 但一件参考素材都没给" },
  invalid_task_type_for_media: {
    http: 400,
    message: "显式 taskType 与素材构成冲突（如带参考素材却传 i2va）",
  },
  invalid_param: { http: 400, message: "参数非法" },
  token_invalid: { http: 401, message: "token 不对" },
  delivery_incomplete: { http: 500, message: "时间轴有缺口，拒绝导出" },
} as const satisfies Record<string, ErrorMeta>;

export type ErrorCode = keyof typeof ERROR_CODES;

export class DramaError extends Error {
  readonly code: ErrorCode;
  readonly http: number;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    opts?: { message?: string; hint?: string; details?: unknown; cause?: unknown },
  ) {
    super(
      opts?.message ?? ERROR_CODES[code].message,
      opts?.cause === undefined ? undefined : { cause: opts.cause },
    );
    this.name = "DramaError";
    this.code = code;
    this.http = ERROR_CODES[code].http;
    this.hint = opts?.hint;
    this.details = opts?.details;
  }
}

export function isDramaError(e: unknown): e is DramaError {
  return e instanceof DramaError;
}

/**
 * 非 DramaError 一律折成 `invalid_param`(400)，
 * 但原始错误挂到 `details.cause` 上，供日志与排查使用（不上抛原始 message，避免泄漏内部细节）。
 */
export function toErrorBody(e: unknown): {
  code: ErrorCode;
  message: string;
  hint?: string;
  details?: unknown;
} {
  if (isDramaError(e)) {
    return {
      code: e.code,
      message: e.message,
      ...(e.hint === undefined ? {} : { hint: e.hint }),
      ...(e.details === undefined ? {} : { details: e.details }),
    };
  }

  const message = e instanceof Error ? e.message : String(e);
  return {
    code: "invalid_param",
    message: ERROR_CODES.invalid_param.message,
    details: { cause: message },
  };
}
