/**
 * M0-8 · MCP stdio 服务入口。
 *
 * 依据 `docs/m0-spec.md` §5.13：McpServer + StdioServerTransport，
 * M0 只注册 `echo`，inputSchema 用 zod。**零业务**：不校验、不改写、不缓存、不重试。
 *
 * 读取 core 配置的方式：直接 import `@text2drama/core` 的 `loadConfig()`——
 * core 包是 workspace 源码直出（main 指 src/index.ts），tsx 可直接解析，
 * 不必在 mcp 里再抄一份 fs + zod。选择记入 `docs/worklog/M00.md` [007]。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "@text2drama/core";
import type { ForwardConfig } from "./forward.js";
import { callTool } from "./forward.js";

export async function startMcpServer(): Promise<void> {
  // loadConfig 读 $DRAMA_HOME/config.json（含 legacy 回退）。
  // 注意：core 的 loadConfig 在配置缺失时会**写盘**；MCP 进程与 core 服务进程
  // 共享同一个 DRAMA_HOME，先起 core 再起 mcp 即不会重复建（已有配置直接读）。
  const cfg = loadConfig();
  const forward: ForwardConfig = {
    baseUrl: process.env.DRAMA_BASE_URL ?? "http://127.0.0.1:8400",
    token: cfg.token,
  };

  const server = new McpServer(
    { name: "text2drama", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.tool(
    "echo",
    "回声工具，M0 联调用。原样返回输入，附带服务端时间与 pid。",
    { text: z.string().optional().describe("回声文本，可省略") },
    async ({ text }) => {
      const r = await callTool(forward, "echo", { ...(text === undefined ? {} : { text }) });
      if (!r.ok) {
        return {
          content: [{ type: "text", text: `错误 ${r.error.code}: ${r.error.message}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(r.result) }] };
    },
  );

  await server.connect(new StdioServerTransport());
}

// 只在直接执行时启动，被 import（测试）时不接管 stdio。
// 用 fileURLToPath + resolve 归一化：手剥 file:/// 前缀在 Windows 会残留
// 前导反斜杠（\D:\...），导致入口判断恒 false、服务永不启动。
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
if (process.argv[1] !== undefined) {
  const entry = resolve(fileURLToPath(import.meta.url));
  if (resolve(process.argv[1]).toLowerCase() === entry.toLowerCase()) {
    void startMcpServer().catch((e) => {
      console.error("[text2drama-mcp] startup failed", e);
      process.exit(1);
    });
  }
}

