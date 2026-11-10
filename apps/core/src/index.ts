/**
 * M0-8 · core 服务入口。
 *
 * 依据 `docs/m0-spec.md` §5.12：`startServer()` 返回 `{ server, close(): Promise<void>, port }`。
 * - 端口：`Number(process.env.DRAMA_PORT ?? 8400)`；
 * - 只绑 `127.0.0.1`，绝不绑 0.0.0.0；
 * - `loadConfig()` 装配置（DRAMA_HOME 生效），失败直接抛——配置损坏不许静默重置。
 */
import http from "node:http";
import type { Server } from "node:http";

import { loadConfig } from "./config/load.js";
import { createApp } from "./server.js";

// MCP 层复用 core 的配置读取（跨包 import core 的 loadConfig，选择记入 [007]）
export { loadConfig };

const DEFAULT_PORT = 8400;
const HOST = "127.0.0.1";

export interface RunningServer {
  server: Server;
  close(): Promise<void>;
  port: number;
}

export async function startServer(): Promise<RunningServer> {
  const cfg = loadConfig();
  const app = createApp({ cfg });
  const port = Number(process.env.DRAMA_PORT ?? DEFAULT_PORT);

  const server = app.listen(port, HOST);

  await new Promise<void>((resolve, reject) => {
    const onError = (e: Error): void => {
      server.off("listening", onListening);
      reject(e);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => {
          if (e !== undefined) reject(e);
          else resolve();
        });
      }),
    port,
  };
}

// 直接执行本文件时启动服务（`pnpm -C apps/core dev`）。被 import 时不启动。
// 同 MCP 入口：fileURLToPath + resolve 归一化，避免 Windows 路径误判。
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
if (process.argv[1] !== undefined) {
  const entry = resolve(fileURLToPath(import.meta.url));
  if (resolve(process.argv[1]).toLowerCase() === entry.toLowerCase()) {
    void startServer().then(({ server, port }) => {
      console.info(`[text2drama-core] listening on ${JSON.stringify(server.address())} port ${port}`);
    });
  }
}
