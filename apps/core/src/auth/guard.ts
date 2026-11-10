/**
 * 请求鉴权 —— 五步判定，**顺序不可调整**。
 *
 * 冻结签名 + 判定顺序：`docs/m0-spec.md` §5.11（L361-387）。
 * 依据：`architecture.md` L479-484（token / Origin 白名单 / 跨站 403）。
 *
 * 顺序为什么不能换：
 * - 跨站判定必须在取凭据之前 —— 恶意网页也能读到自己的 token（若被注入），
 *   先拦来源比先验凭据多一层防护，且 403 不泄漏「token 对不对」。
 * - 验完凭据才验 Origin：否则攻击者能靠 403/401 的差异探测 Origin 白名单。
 * - `x-drama-source` 最后解析：它是审计标签，不该影响前面任何安全判定。
 */
import { ERROR_CODES } from "@text2drama/shared";
import type { AuditSource, ErrorCode } from "@text2drama/shared";

import { timingSafeEqualStr } from "./token.js";
import type { DramaConfig } from "../config/types.js";
import { isAuditSource } from "@text2drama/shared";

/** GUI dev / core 本体的 Origin 白名单（`m0-spec.md` §3：GUI dev 3400） */
export const ALLOWED_ORIGINS: readonly string[] = [
  "http://127.0.0.1:3400",
  "http://localhost:3400",
  "http://127.0.0.1:8400",
  "http://localhost:8400",
];

/** 凭据头名（`m0-spec.md` §9 漂移 D8：两种凭据等价） */
const TOKEN_HEADER = "x-drama-token";
const AUTH_HEADER = "authorization";
const ORIGIN_HEADER = "origin";
const SEC_FETCH_SITE_HEADER = "sec-fetch-site";
const SOURCE_HEADER = "x-drama-source";

/** 缺省审计来源（`m0-spec.md` §5.11 第 5 步） */
const DEFAULT_SOURCE: AuditSource = "api";

export interface GuardInput {
  headers: Record<string, string | string[] | undefined>;
  /** 预留给后续按方法收窄（如只对写方法要求 Origin）；当前判定顺序不使用 */
  method: string;
}

export type GuardResult =
  | { ok: true; source: AuditSource }
  | { ok: false; http: number; code: ErrorCode; message: string };

/**
 * 大小写不敏感地取单值头。同名头出现多次时取第一个，
 * 空串按「未提供」处理（HTTP 里 `X: ` 与不发的语义应当一致）。
 */
function header(headers: GuardInput["headers"], name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const raw = headers[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/** 取某个头的全部取值（用于 `Sec-Fetch-Site` 这类「任一命中即拒」的判定） */
function headerValues(headers: GuardInput["headers"], name: string): string[] {
  const wanted = name.toLowerCase();
  const out: string[] = [];
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const raw = headers[key];
    const list = Array.isArray(raw) ? raw : [raw];
    for (const v of list) {
      if (typeof v === "string" && v.trim().length > 0) out.push(v.trim().toLowerCase());
    }
  }
  return out;
}

/** 从 `Authorization: Bearer <t>` 中取 token；不是 Bearer 形式则返回 undefined */
function bearerToken(value: string): string | undefined {
  const m = /^bearer\s+(.+)$/i.exec(value);
  if (m === null) return undefined;
  const token = m[1]?.trim();
  return token !== undefined && token.length > 0 ? token : undefined;
}

function fail(http: number, code: ErrorCode, message?: string): GuardResult {
  return { ok: false, http, code, message: message ?? ERROR_CODES[code].message };
}

/**
 * 鉴权 + 解析审计来源。纯函数，不抛异常（鉴权失败是**结果**，不是异常）。
 */
export function guard(input: GuardInput, cfg: DramaConfig): GuardResult {
  // ① 跨站请求一律拒。CSRF 的第一道闸，必须在任何凭据处理之前。
  if (headerValues(input.headers, SEC_FETCH_SITE_HEADER).includes("cross-site")) {
    return fail(403, "token_invalid", "跨站请求被拒绝");
  }

  // ② 取凭据：x-drama-token 优先，其次 Authorization: Bearer（二者等价，D8）
  const tokenHeader = header(input.headers, TOKEN_HEADER);
  const authHeader = header(input.headers, AUTH_HEADER);
  const presented = tokenHeader ?? (authHeader === undefined ? undefined : bearerToken(authHeader));
  if (presented === undefined) {
    return fail(401, "token_invalid", "缺少凭据：请在 x-drama-token 头或 Authorization: Bearer 中提供 token");
  }

  // ③ 常量时间比对，避免按字节比较泄漏前缀信息
  if (!timingSafeEqualStr(presented, cfg.token)) {
    return fail(401, "token_invalid", "token 不对");
  }

  // ④ 凭据已通过，再看 Origin 是否在白名单。`null` 等异常值一律不在白名单。
  const origin = header(input.headers, ORIGIN_HEADER);
  if (origin !== undefined && !ALLOWED_ORIGINS.includes(origin)) {
    return fail(403, "token_invalid", `Origin 不在白名单：${origin}`);
  }

  // ⑤ 解析审计来源。非法值报 400 而不是静默降级成 api —— 静默会污染审计。
  const rawSource = header(input.headers, SOURCE_HEADER);
  if (rawSource === undefined) {
    return { ok: true, source: DEFAULT_SOURCE };
  }
  if (!isAuditSource(rawSource)) {
    return fail(400, "invalid_param", `x-drama-source 只能是 mcp / api / gui，收到：${rawSource}`);
  }
  return { ok: true, source: rawSource };
}
