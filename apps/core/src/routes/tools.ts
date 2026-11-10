/**
 * M0-8 · `/api/tools` 路由 —— guard 与 dispatch 的接线层。
 *
 * 依据 `docs/m0-spec.md` §5.12 / §6：
 * - guard 拒掉 → 按其 http/code/message 直接回错误包络，**不写审计**
 *   （guard 拒掉的请求没进 dispatch，审计归 dispatch 唯一写入点）；
 * - guard 通过 → dispatch()，用 DispatchResult.http 作响应码。
 *
 * source 归属：`x-drama-source` 头由 guard 解析（含非法值 400）。
 * body 里也可带 `source`，与 header **冲突时以 header 为准**——
 * 实现：header 存在即用 guard 解出的 source；header 缺省才看 body.source，
 * body.source 也不是合法 AuditSource 时落回 guard 的默认（"api"）。
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { isAuditSource } from "@text2drama/shared";
import type { AuditSource } from "@text2drama/shared";

import { guard } from "../auth/guard.js";
import type { AuditLogger } from "../tools/audit.js";
import { dispatch } from "../tools/dispatcher.js";
import type { Registry } from "../tools/registry.js";
import type { DramaConfig } from "../config/types.js";

export interface ToolsRouterDeps {
  registry: Registry;
  audit: AuditLogger;
  cfg: DramaConfig;
}

/** POST /api/tools 的 body 形状（字段全部 unknown，交由 dispatch/guard 判定） */
interface ToolsBody {
  name?: unknown;
  input?: unknown;
  requestId?: unknown;
  source?: unknown;
}

/** body 可能不是对象（空 body / 非 JSON content-type 时 express 给 {} 或字符串） */
function asToolsBody(raw: unknown): ToolsBody {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as ToolsBody;
  }
  return {};
}

export function toolsRouter(deps: ToolsRouterDeps): Router {
  const router = Router();

  router.post("/api/tools", (req: Request, res: Response) => {
    const g = guard({ headers: req.headers, method: req.method }, deps.cfg);
    if (!g.ok) {
      // guard 拒绝：按契约只回错误包络，不写审计（§6 审计唯一写入点是 dispatch）
      res.status(g.http).json({ ok: false, error: { code: g.code, message: g.message } });
      return;
    }

    const body = asToolsBody(req.body);
    const headerSource =
      typeof req.headers["x-drama-source"] === "string"
        ? (req.headers["x-drama-source"] as string).trim()
        : undefined;
    // header 为准：header 在且 guard 已放行 → header 的值；header 缺省才接受 body.source
    let source: AuditSource = g.source;
    if (headerSource === undefined && isAuditSource(body.source)) {
      source = body.source;
    }

    void dispatch(
      { registry: deps.registry, audit: deps.audit },
      {
        name: body.name,
        input: body.input,
        requestId: body.requestId,
        source,
      },
    ).then((r) => {
      res.status(r.http).json(r.body);
    });
    // dispatch 自身不抛（八步序列里任何抛出都被折成 DispatchResult），
    // 这里不需要 catch；万一真有实现 bug 导致 reject，express 5 会把它
    // 送进错误中间件（返回的 promise 未 await 也被 express 5 捕获）。
  });

  return router;
}
