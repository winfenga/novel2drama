/**
 * M0-8 · HTTP 服务装配。
 *
 * 依据 `docs/m0-spec.md` §5.12：
 * - `createApp({ cfg, log? })` → express app；
 * - `GET /api/ping` 不鉴权（健康检查）；
 * - `express.json({ limit: "8mb" })`；
 * - 错误中间件 `toErrorBody` + `err()`；
 * - 监听地址只绑 127.0.0.1（在 startServer 里落）。
 *
 * createApp 内部组装 registry / audit：echo 注册表与审计目录都来自冻结模块，
 * 审计目录取 `resolvePaths().logDir`（DRAMA_HOME 可在进程级覆盖，e2e 依赖此点）。
 */
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { DramaError, ERROR_CODES, err, toErrorBody } from "@text2drama/shared";

import type { DramaConfig } from "./config/types.js";
import { resolvePaths } from "./paths.js";
import { toolsRouter } from "./routes/tools.js";
import { createAuditLogger } from "./tools/audit.js";
import { echoTool } from "./tools/echo.js";
import { createRegistry } from "./tools/registry.js";

/** 服务版本，`/api/ping` 返回 */
export const VERSION = "0.0.0";

export interface AppDeps {
  cfg: DramaConfig;
  log?: Pick<Console, "info" | "error" | "warn">;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const log = deps.log ?? console;

  const registry = createRegistry([echoTool]);
  const audit = createAuditLogger({ dir: resolvePaths().logDir });

  app.use(express.json({ limit: "8mb" }));

  app.get("/api/ping", (_req: Request, res: Response) => {
    res.json({ ok: true, data: { pong: true, version: VERSION } });
  });

  app.use(toolsRouter({ registry, audit, cfg: deps.cfg }));

  // 错误中间件：body 解析失败 / 中间件抛出 / 未捕获异常统一折成错误包络。
  // express 5 对被拒的 promise 也会送进来，参数顺序不可动。
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const body = toErrorBody(e);
    const http =
      e instanceof DramaError ? e.http : (ERROR_CODES[body.code]?.http ?? 500);
    log.error("[http] request failed", body.code, body.message);
    res.status(http).json(err(e));
  });

  return app;
}
