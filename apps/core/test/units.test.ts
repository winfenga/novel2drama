/**
 * M0-8 · 单测：guard 六路 / dispatch 四路 / 幂等命中 / mask 不泄露 / errors 37 条。
 *
 * 全部直接消费冻结模块，不重建逻辑。
 */
import { describe, expect, it } from "vitest";
import { ERROR_CODES, toErrorBody } from "@text2drama/shared";

import { guard } from "../src/auth/guard.js";
import { maskConfig } from "../src/config/mask.js";
import type { DramaConfig } from "../src/config/types.js";
import { dispatch } from "../src/tools/dispatcher.js";
import { defineTool } from "../src/tools/registry.js";
import { withIdempotency, resetIdempotencyCache } from "../src/tools/idempotency.js";
import { createAuditLogger } from "../src/tools/audit.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const CFG: DramaConfig = {
  version: 1,
  token: "abcdef1234567890",
  llmBackends: [
    { id: "b1", baseUrl: "https://api.example.com", apiKey: "sk-secret", model: "m1", roles: ["text"], priority: 1, enabled: true },
  ],
  roleRouting: { text: "b1" },
  generation: { resolution: "1080x1920", fps: 24 },
};

const hdr = (extra: Record<string, string> = {}): Record<string, string> => extra;

// —— guard 六路 ——

describe("guard 六路", () => {
  it("跨站 403", () => {
    const g = guard(
      { headers: hdr({ "sec-fetch-site": "cross-site", "x-drama-token": CFG.token }), method: "POST" },
      CFG,
    );
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.http).toBe(403);
  });

  it("无凭据 401", () => {
    const g = guard({ headers: hdr(), method: "POST" }, CFG);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.http).toBe(401);
  });

  it("错 token 401", () => {
    const g = guard({ headers: hdr({ "x-drama-token": "wrong" }), method: "POST" }, CFG);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.http).toBe(401);
  });

  it("坏 Origin 403", () => {
    const g = guard(
      { headers: hdr({ "x-drama-token": CFG.token, origin: "http://evil.example.com" }), method: "POST" },
      CFG,
    );
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.http).toBe(403);
  });

  it("坏 source 400", () => {
    const g = guard(
      { headers: hdr({ "x-drama-token": CFG.token, "x-drama-source": "hacker" }), method: "POST" },
      CFG,
    );
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.http).toBe(400);
  });

  it("正常通过（三 source 均放行）", () => {
    for (const s of ["mcp", "api", "gui"] as const) {
      const g = guard(
        { headers: hdr({ "x-drama-token": CFG.token, "x-drama-source": s }), method: "POST" },
        CFG,
      );
      expect(g).toEqual({ ok: true, source: s });
    }
  });
});

// —— dispatch 四路 ——

const noopAudit = createAuditLogger({ dir: join(mkdtempSync(join(tmpdir(), "td-audit-")), "logs") });

const demoTool = defineTool({
  name: "demo",
  description: "test",
  input: z.object({ n: z.number() }),
  idempotent: true,
  handler: async (input) => ({ got: input.n }),
});
const demoRegistry = {
  get: (n: string) => (n === "demo" ? demoTool : undefined),
  has: (n: string) => n === "demo",
  names: () => ["demo"],
};

describe("dispatch 四路", () => {
  it("成功 200", async () => {
    const r = await dispatch({ registry: demoRegistry, audit: noopAudit }, { name: "demo", input: { n: 1 }, source: "api" });
    expect(r.http).toBe(200);
    if (r.body.ok) expect(r.body.data).toEqual({ got: 1 });
  });

  it("name 非字符串 400（仍写审计）", async () => {
    const r = await dispatch({ registry: demoRegistry, audit: noopAudit }, { name: 42, input: {}, source: "api" });
    expect(r.http).toBe(400);
    if (!r.body.ok) expect(r.body.error.code).toBe("invalid_param");
  });

  it("未知工具 400 且 hint 列工具", async () => {
    const r = await dispatch({ registry: demoRegistry, audit: noopAudit }, { name: "nope", input: {}, source: "api" });
    expect(r.http).toBe(400);
    if (!r.body.ok) expect(r.body.error.hint).toContain("demo");
  });

  it("schema 校验失败 400", async () => {
    const r = await dispatch({ registry: demoRegistry, audit: noopAudit }, { name: "demo", input: { n: "x" }, source: "api" });
    expect(r.http).toBe(400);
    if (!r.body.ok) {
      expect(r.body.error.code).toBe("invalid_param");
      expect(r.body.error.details).toBeDefined();
    }
  });

  // —— 幂等命中 ——

  it("幂等：同 requestId 第二次不执行 handler", async () => {
    resetIdempotencyCache();
    let calls = 0;
    const tool = defineTool({
      name: "counter",
      description: "test",
      input: z.object({}).default({}),
      idempotent: true,
      handler: async () => ({ calls: ++calls }),
    });
    const reg = {
      get: (n: string) => (n === "counter" ? tool : undefined),
      has: (n: string) => n === "counter",
      names: () => ["counter"],
    };
    const req = { name: "counter", input: {}, requestId: "id-1", source: "mcp" as const };
    const r1 = await dispatch({ registry: reg, audit: noopAudit }, req);
    const r2 = await dispatch({ registry: reg, audit: noopAudit }, req);
    expect(calls).toBe(1);
    if (r1.body.ok && r2.body.ok) expect(r1.body.data).toEqual(r2.body.data);
    resetIdempotencyCache();
  });

  it("withIdempotency 直接验证：空 key 不缓存", async () => {
    resetIdempotencyCache();
    let n = 0;
    const fn = async (): Promise<number> => ++n;
    await withIdempotency(undefined, fn);
    await withIdempotency(undefined, fn);
    expect(n).toBe(2);
    resetIdempotencyCache();
  });
});

// —— mask 不泄露 ——

describe("maskConfig", () => {
  it("apiKey 变 *** 且 token 整体不出现", () => {
    const m = maskConfig(CFG) as unknown as Record<string, unknown>;
    expect(m.token).toBeUndefined();
    const backends = m.llmBackends as { apiKey: string; hasKey: boolean }[];
    expect(backends[0]?.apiKey).toBe("***");
    expect(backends[0]?.hasKey).toBe(true);
    expect(JSON.stringify(m)).not.toContain("sk-secret");
    expect(JSON.stringify(m)).not.toContain(CFG.token);
  });
});

// —— errors 37 条 ——

describe("ERROR_CODES", () => {
  it("恰好 37 条", () => {
    expect(Object.keys(ERROR_CODES).length).toBe(37);
  });

  it("每条都有 number 类 http 与非空 message", () => {
    for (const [code, meta] of Object.entries(ERROR_CODES)) {
      expect(typeof meta.http, code).toBe("number");
      expect(meta.message.length, code).toBeGreaterThan(0);
    }
  });

  it("非 DramaError 折成 invalid_param", () => {
    expect(toErrorBody(new Error("boom")).code).toBe("invalid_param");
  });
});
