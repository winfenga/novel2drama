/**
 * MCP 转发层 —— 纯 HTTP 客户端，零业务。
 *
 * 依据 `docs/m0-spec.md` §5.13：POST {baseUrl}/api/tools，
 * 头 `x-drama-token` + `content-type: application/json` + `x-drama-source: mcp`。
 * 不校验、不改写、不缓存、不重试。
 */
export interface ForwardConfig {
  baseUrl: string;
  token: string;
}

export type CallToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string; hint?: string } };

interface ErrEnvelopeShape {
  ok: false;
  error: { code?: unknown; message?: unknown; hint?: unknown };
}

/** 收到的 JSON 是不是错误包络（不做业务校验，只做形状判断以便透传） */
function isErrEnvelope(v: unknown): v is ErrEnvelopeShape {
  if (typeof v !== "object" || v === null) return false;
  const o = v as { ok?: unknown; error?: unknown };
  return o.ok === false && typeof o.error === "object" && o.error !== null;
}

export async function callTool(
  cfg: ForwardConfig,
  name: string,
  input: unknown,
  requestId?: string,
): Promise<CallToolResult> {
  const res = await fetch(`${cfg.baseUrl}/api/tools`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-drama-token": cfg.token,
      "x-drama-source": "mcp",
    },
    body: JSON.stringify({ name, input, ...(requestId === undefined ? {} : { requestId }) }),
  });

  const body: unknown = await res.json().catch(() => undefined);
  if (isErrEnvelope(body)) {
    return {
      ok: false,
      error: {
        code: typeof body.error.code === "string" ? body.error.code : "invalid_param",
        message: typeof body.error.message === "string" ? body.error.message : "未知错误",
        ...(typeof body.error.hint === "string" ? { hint: body.error.hint } : {}),
      },
    };
  }
  return { ok: true, result: body };
}
