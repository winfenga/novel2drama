/**
 * M5-2 测试 · 内网判定与 assertBaseUrl（全静态输入，无网络）。
 * 依据 m35-spec §1.4：loopback/私网/link-local 各一条 + 公网一条；local:true 放行；local:false 拦。
 */
import { describe, expect, it } from "vitest";

import { DramaError } from "@text2drama/shared";

import { assertBaseUrl, isPrivateAddress } from "./netPolicy.js";
import type { Backend } from "./backends.js";

function backend(over: Partial<Backend> & Pick<Backend, "id" | "baseUrl">): Backend {
  return {
    apiKey: "sk-test",
    model: "m",
    roles: ["text"],
    priority: 1,
    enabled: true,
    ...over,
  };
}

describe("isPrivateAddress", () => {
  const privates = [
    "http://127.0.0.1:11434/v1", // loopback（IPv4）
    "http://localhost:11434/v1", // loopback（名字）
    "http://10.1.2.3/v1", // private 10/8
    "http://172.16.0.9/v1", // private 172.16/12
    "http://192.168.1.5:8080/v1", // private 192.168/16
    "http://169.254.3.4/v1", // linkLocal（旧正则漏的）
    "http://100.64.0.1/v1", // carrierGradeNat（云内网）
    "http://0.0.0.0/v1", // unspecified
    "http://[::1]:11434/v1", // loopback（IPv6）
    "http://[fe80::1]/v1", // linkLocal（IPv6）
    "http://[fc00::1]/v1", // uniqueLocal
    "http://[::ffff:127.0.0.1]/v1", // IPv4-mapped loopback
  ];
  it.each(privates)("内网 %s → true", (u) => {
    expect(isPrivateAddress(u)).toBe(true);
  });

  const publics = [
    "https://api.deepseek.com/v1",
    "https://8.8.8.8/v1",
    "http://example.com:8080/v1",
  ];
  it.each(publics)("公网 %s → false", (u) => {
    expect(isPrivateAddress(u)).toBe(false);
  });

  it("裸主机名兼容（127.0.0.1 / localhost / api.deepseek.com）", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("localhost")).toBe(true);
    expect(isPrivateAddress("api.deepseek.com")).toBe(false);
  });
});

describe("assertBaseUrl", () => {
  it("公网地址放行（无论 local 与否）", () => {
    expect(() => assertBaseUrl(backend({ id: "ds", baseUrl: "https://api.deepseek.com/v1" }))).not.toThrow();
  });

  it("内网 + local:true → 放行（本地 Ollama 场景）", () => {
    expect(() =>
      assertBaseUrl(backend({ id: "ollama", baseUrl: "http://127.0.0.1:11434/v1", local: true })),
    ).not.toThrow();
  });

  it("内网 + local:false → llm_private_url (400)", () => {
    try {
      assertBaseUrl(backend({ id: "bad", baseUrl: "http://192.168.1.5:11434/v1", local: false }));
      expect.unreachable("必须抛错");
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_private_url");
      expect(de.http).toBe(400);
      expect(de.message).toContain("bad");
      expect(de.message).toContain("local");
    }
  });

  it("内网 + 未标 local → llm_private_url（外部地址伪装内网仍拦）", () => {
    expect(() => assertBaseUrl(backend({ id: "bad", baseUrl: "http://10.0.0.1/v1" }))).toThrowError(
      expect.objectContaining({ code: "llm_private_url" }),
    );
  });

  it("非法协议 → invalid_param", () => {
    expect(() => assertBaseUrl(backend({ id: "bad", baseUrl: "file:///etc/passwd" }))).toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
    expect(() => assertBaseUrl(backend({ id: "bad", baseUrl: "ftp://x/v1" }))).toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
  });

  it("非法 URL → invalid_param", () => {
    expect(() => assertBaseUrl(backend({ id: "bad", baseUrl: "::::not-a-url" }))).toThrowError(
      expect.objectContaining({ code: "invalid_param" }),
    );
  });
});
