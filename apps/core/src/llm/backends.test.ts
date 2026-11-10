/**
 * M5-1 测试 · pickBackend 两码分开。
 * 依据 m35-spec §1.4 出口标准用例。
 */
import { describe, expect, it } from "vitest";

import { DramaError } from "@text2drama/shared";

import { expectPickConfig, pickBackend } from "./backends.js";
import type { Backend } from "./backends.js";

function backend(over: Partial<Backend> & Pick<Backend, "id" | "roles" | "priority">): Backend {
  return {
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    enabled: true,
    ...over,
  };
}

describe("pickBackend", () => {
  it("无任何 enabled 后端 → llm_no_backend (400)", () => {
    const cfg = { llmBackends: [backend({ id: "a", roles: ["text"], priority: 1, enabled: false })], roleRouting: {} };
    try {
      pickBackend(cfg, "text");
      expect.unreachable("必须抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(DramaError);
      const de = e as DramaError;
      expect(de.code).toBe("llm_no_backend");
      expect(de.http).toBe(400);
    }
  });

  it("llmBackends 为空数组 → llm_no_backend", () => {
    const cfg = { llmBackends: [], roleRouting: {} };
    expect(() => pickBackend(cfg, "text")).toThrowError(expect.objectContaining({ code: "llm_no_backend" }));
  });

  it("roleRouting 显式路由命中 → 用它（即使 priority 更大）", () => {
    const low = backend({ id: "low", roles: ["text"], priority: 1 });
    const high = backend({ id: "high", roles: ["text"], priority: 5 });
    const cfg = { llmBackends: [low, high], roleRouting: { text: "high" } };
    expect(pickBackend(cfg, "text").id).toBe("high");
  });

  it("路由指向不干这活的后端 → 按 priority 升序兜底", () => {
    const a = backend({ id: "a", roles: ["prompt"], priority: 3 });
    const b = backend({ id: "b", roles: ["text"], priority: 2 });
    const cfg = { llmBackends: [a, b], roleRouting: { text: "a" } };
    expect(pickBackend(cfg, "text").id).toBe("b");
  });

  it("路由指向不存在的后端 → 按 priority 兜底", () => {
    const a = backend({ id: "a", roles: ["text"], priority: 2 });
    const b = backend({ id: "b", roles: ["text"], priority: 1 });
    const cfg = { llmBackends: [a, b], roleRouting: { text: "ghost" } };
    expect(pickBackend(cfg, "text").id).toBe("b");
  });

  it("无角色后端 → llm_no_role (400)，message 列出各后端能干的活", () => {
    const a = backend({ id: "a", roles: ["text", "prompt"], priority: 1 });
    const b = backend({ id: "b", roles: ["vision"], priority: 2 });
    const cfg = { llmBackends: [a, b], roleRouting: {} };
    try {
      pickBackend(cfg, "plan");
      expect.unreachable("必须抛错");
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_no_role");
      expect(de.http).toBe(400);
      expect(de.message).toContain("plan");
      expect(de.message).toContain("a(text,prompt)");
      expect(de.message).toContain("b(vision)");
    }
  });

  it("llm_no_backend 与 llm_no_role 两码确实分开", () => {
    const empty = { llmBackends: [], roleRouting: {} };
    const noRole = {
      llmBackends: [backend({ id: "a", roles: ["text"], priority: 1 })],
      roleRouting: {},
    };
    expect(() => pickBackend(empty, "text")).toThrowError(expect.objectContaining({ code: "llm_no_backend" }));
    expect(() => pickBackend(noRole, "vision")).toThrowError(expect.objectContaining({ code: "llm_no_role" }));
  });

  it("同 priority 多候选取第一个（sort 稳定序）", () => {
    const a = backend({ id: "a", roles: ["text"], priority: 1 });
    const b = backend({ id: "b", roles: ["text"], priority: 1 });
    expect(pickBackend({ llmBackends: [a, b], roleRouting: {} }, "text").id).toBe("a");
  });
});

describe("expectPickConfig", () => {
  it("cfg 非对象 → invalid_param", () => {
    expect(() => expectPickConfig(null)).toThrowError(expect.objectContaining({ code: "invalid_param" }));
    expect(() => expectPickConfig(42)).toThrowError(expect.objectContaining({ code: "invalid_param" }));
  });

  it("缺 llmBackends / roleRouting → invalid_param", () => {
    expect(() => expectPickConfig({ roleRouting: {} })).toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
    expect(() => expectPickConfig({ llmBackends: [] })).toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
  });
});
