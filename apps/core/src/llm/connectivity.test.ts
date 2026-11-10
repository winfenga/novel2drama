/**
 * M5-5 测试 · testBackends（全 mock fetch，零真实网络）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DramaError } from "@text2drama/shared";

import { testBackends } from "./connectivity.js";

const CFG = {
  llmBackends: [
    {
      id: "cloud",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk",
      model: "m",
      roles: ["text"],
      priority: 1,
      enabled: true,
    },
    {
      id: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "ollama",
      model: "qwen",
      roles: ["prompt"],
      priority: 2,
      enabled: true,
      local: true,
    },
    {
      id: "off",
      baseUrl: "https://disabled.example.com/v1",
      apiKey: "k",
      model: "m",
      roles: ["text"],
      priority: 3,
      enabled: false,
    },
  ],
  roleRouting: {},
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("testBackends", () => {
  it("target='*' 测所有 enabled 后端，能列模型 → ok:true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })),
    );
    const rs = await testBackends(CFG, "*");
    expect(rs).toHaveLength(2); // disabled 的 off 不测
    expect(rs.map((r) => r.id).sort()).toEqual(["cloud", "local"]);
    for (const r of rs) {
      expect(r.ok).toBe(true);
      expect(r.detail).toContain("2");
    }
  });

  it("单后端失败 → 该条 ok:false 带 detail，其他条不受影响", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("127.0.0.1")) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );
    const rs = await testBackends(CFG, "*");
    const local = rs.find((r) => r.id === "local");
    const cloud = rs.find((r) => r.id === "cloud");
    expect(local?.ok).toBe(false);
    expect(local?.detail).toContain("404");
    expect(cloud?.ok).toBe(true);
  });

  it("fetch 抛网络错 → ok:false 不中断", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("127.0.0.1")) throw new Error("ECONNREFUSED");
        return new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 });
      }),
    );
    const rs = await testBackends(CFG, "*");
    expect(rs.find((r) => r.id === "local")).toMatchObject({ ok: false });
    expect(rs.find((r) => r.id === "cloud")?.ok).toBe(true);
  });

  it("响应缺 data/models 数组 → ok:false（不猜）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ weird: 1 }), { status: 200 })),
    );
    const rs = await testBackends(CFG, "cloud");
    expect(rs[0]).toMatchObject({ ok: false });
  });

  it("target 指定单个 id → 只测它（disabled 也可单测）", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const rs = await testBackends(CFG, "off");
    expect(rs).toHaveLength(1);
    expect(rs[0]?.id).toBe("off");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(String((fn.mock.calls[0] as unknown as [string])[0])).toContain("disabled.example.com");
  });

  it("target 不存在 → invalid_param", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(testBackends(CFG, "ghost")).rejects.toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
  });

  it("私网未标 local 的后端 → 该条 ok:false（llm_private_url 被 testOne 接住进 detail）", async () => {
    const cfg = {
      llmBackends: [{ ...CFG.llmBackends[1], local: undefined }],
      roleRouting: {},
    };
    vi.stubGlobal("fetch", vi.fn());
    const rs = await testBackends(cfg, "*");
    expect(rs[0]?.ok).toBe(false);
    expect(rs[0]?.detail).toContain("内网");
  });
});
