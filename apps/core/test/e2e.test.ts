/**
 * M0-8 · e2e：真起服务 + 三 source 审计 + MCP stdio 握手。
 *
 * 出口标准硬指标全部落在本文件：
 * 1. 随机空闲端口 + 临时 DRAMA_HOME；
 * 2. mcp/api/gui 各调一次 echo（正确 token），审计文件里三 source 各 ≥1；
 * 3. 无 token 401 / 错 token 401 / 坏 source 400 / cross-site 403；
 * 4. spawn 真实 MCP stdio 进程，initialize → tools/list → tools/call echo。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/load.js";
import { startServer } from "../src/index.js";
import type { RunningServer } from "../src/index.js";

const HOME = mkdtempSync(join(tmpdir(), "td-e2e-home-"));

/** 随机空闲端口（内核分配，测完即释放） */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close();
        reject(new Error("unexpected address"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

let cfg: ReturnType<typeof loadConfig>;
let running: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  process.env.DRAMA_HOME = HOME;
  const port = await freePort();
  process.env.DRAMA_PORT = String(port);
  cfg = loadConfig(); // 临时 HOME 下建默认配置并落盘
  running = await startServer();
  baseUrl = `http://127.0.0.1:${running.port}`;
});

afterAll(async () => {
  await running.close();
  delete process.env.DRAMA_PORT;
});

const call = async (headers: Record<string, string>, body: unknown): Promise<Response> =>
  fetch(`${baseUrl}/api/tools`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("e2e · HTTP 三连 + 拒绝路径", () => {
  it("ping 不鉴权", async () => {
    const res = await fetch(`${baseUrl}/api/ping`);
    const j = (await res.json()) as { ok: boolean; data: { pong: boolean; version: string } };
    expect(j.ok).toBe(true);
    expect(j.data.pong).toBe(true);
    expect(typeof j.data.version).toBe("string");
  });

  it("mcp/api/gui 三 source 各调一次 echo，均 200", async () => {
    for (const source of ["mcp", "api", "gui"] as const) {
      const res = await call({ "x-drama-token": cfg.token, "x-drama-source": source }, { name: "echo", input: { text: source } });
      expect(res.status, source).toBe(200);
      const j = (await res.json()) as { ok: boolean; data: { echo: string; source: string } };
      expect(j.ok).toBe(true);
      expect(j.data.echo).toBe(source);
      expect(j.data.source).toBe(source);
    }
  });

  it("无 token → 401", async () => {
    const res = await call({}, { name: "echo", input: {} });
    expect(res.status).toBe(401);
    const j = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(j.ok).toBe(false);
    expect(j.error.code).toBe("token_invalid");
  });

  it("错 token → 401", async () => {
    const res = await call({ "x-drama-token": "nope" }, { name: "echo", input: {} });
    expect(res.status).toBe(401);
  });

  it("坏 source → 400", async () => {
    const res = await call({ "x-drama-token": cfg.token, "x-drama-source": "hacker" }, { name: "echo", input: {} });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe("invalid_param");
  });

  it("sec-fetch-site: cross-site → 403（即使 token 正确）", async () => {
    const res = await call({ "x-drama-token": cfg.token, "sec-fetch-site": "cross-site" }, { name: "echo", input: {} });
    expect(res.status).toBe(403);
  });

  it("审计文件里 source 三值各 ≥1 条", async () => {
    const logDir = join(HOME, "logs");
    const files = readdirSync(logDir).filter((f) => f.startsWith("tools-") && f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThan(0);
    const lines = files.flatMap((f) => readFileSync(join(logDir, f), "utf8").split("\n").filter((l) => l.trim() !== "")).map((l) => JSON.parse(l) as { source: string; name: string; ok: boolean });
    const bySource = { mcp: 0, api: 0, gui: 0 };
    for (const e of lines) {
      if (e.name === "echo" && e.ok) bySource[e.source as keyof typeof bySource] = (bySource[e.source as keyof typeof bySource] ?? 0) + 1;
    }
    expect(bySource.mcp).toBeGreaterThanOrEqual(1);
    expect(bySource.api).toBeGreaterThanOrEqual(1);
    expect(bySource.gui).toBeGreaterThanOrEqual(1);
  });
});

// —— 真实 MCP stdio 握手 ——

interface JsonRpcMsg {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: unknown;
  params?: unknown;
}

describe("e2e · MCP stdio 握手", () => {
  it("initialize → tools/list → tools/call echo 全链路通", async () => {
    // Windows 上 pnpm 是 pnpm.cmd，spawn 必须带 shell 才能解析（ENOENT 的根因）
    const child = spawn("pnpm", ["exec", "tsx", "apps/mcp/src/index.ts"], {
      cwd: join(__dirname, "..", "..", ".."),
      env: { ...process.env, DRAMA_HOME: HOME, DRAMA_PORT: String(running.port), DRAMA_BASE_URL: baseUrl },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const send = (msg: JsonRpcMsg): void => {
      child.stdin.write(`${JSON.stringify(msg)}\n`);
    };

    /** 收集 stdout 行直到拿到 id 匹配的响应（MCP 响应可能分帧，按行 + JSON-RPC 判定） */
    const waitResponse = (id: number): Promise<JsonRpcMsg> =>
      new Promise((resolve, reject) => {
        let buf = "";
        const onData = (chunk: Buffer): void => {
          buf += chunk.toString("utf8");
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line === "") continue;
            let parsed: JsonRpcMsg;
            try {
              parsed = JSON.parse(line) as JsonRpcMsg;
            } catch {
              continue; // 非 JSON 行（如 SDK 日志）跳过
            }
            if (parsed.id === id) {
              child.stdout.off("data", onData);
              resolve(parsed);
              return;
            }
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (c: Buffer) => process.stderr.write(`[mcp-stderr] ${c}`));
        setTimeout(() => reject(new Error("MCP response timeout")), 30000).unref();
      });

    try {
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "vitest", version: "0" } } });
      const init = await waitResponse(1);
      expect(init.result).toBeDefined();
      send({ jsonrpc: "2.0", method: "notifications/initialized" });

      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const list = await waitResponse(2);
      const tools = (list.result as { tools: { name: string }[] }).tools;
      expect(tools.map((t) => t.name)).toContain("echo");

      send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "hello-mcp" } } });
      const callRes = await waitResponse(3);
      const content = (callRes.result as { content: { type: string; text: string }[] }).content;
      const text = content[0]?.text ?? "";
      expect(text).toContain("hello-mcp");
      expect(text).toContain("mcp"); // 审计 source 也是 mcp，回显数据里带 source
    } finally {
      child.kill();
    }
  }, 60000);
});
