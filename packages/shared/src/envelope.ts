/**
 * 响应包络 —— 全项目统一 `{ ok, data, meta }` / `{ ok: false, error }`。
 * 依据：`docs/m0-spec.md` §5.2。
 */

import type { ErrorCode } from "./errors.js";
import { toErrorBody } from "./errors.js";

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  meta: { requestId: string; elapsedMs: number };
}

export interface ErrEnvelope {
  ok: false;
  error: { code: string; message: string; hint?: string; details?: unknown };
}

export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

export function ok<T>(data: T, meta: OkEnvelope<T>["meta"]): OkEnvelope<T> {
  return { ok: true, data, meta };
}

/**
 * 任何抛出物折成错误包络。折码规则与 `toErrorBody` 完全一致——
 * 后者是唯一权威，这里只做一层包装，不重复实现。
 */
export function err(e: unknown): ErrEnvelope {
  const body = toErrorBody(e);
  const code: ErrorCode = body.code;
  return {
    ok: false,
    error: {
      code,
      message: body.message,
      ...(body.hint === undefined ? {} : { hint: body.hint }),
      ...(body.details === undefined ? {} : { details: body.details }),
    },
  };
}
