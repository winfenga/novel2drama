/**
 * M5-3/M5-4 测试 · llmChat 错分类 + temperature 重试 + stripReasoning。
 * 全 mock fetch（vi.stubGlobal），零真实网络。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DramaError } from "@text2drama/shared";

import { llmChat } from "./chat.js";
import { chatWithRetry, stripReasoning } from "./retry.js";

const CFG = {
  llmBackends: [
    {
      id: "test",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "m1",
      roles: ["text"],
      priority: 1,
      enabled: true,
    },
  ],
  roleRouting: {},
} as const;

const OPTS = { role: "text" as const, system: "sys", userText: "usr" };

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("llmChat 错分类", () => {
  it("200 正常响应 → content 与 usage", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const r = await llmChat(CFG, OPTS);
    expect(r.content).toBe("hello");
    expect(r.usage).toEqual({ prompt: 10, completion: 5 });
    const fn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody["model"]).toBe("m1");
  });

  it("401 → llm_auth (502)", async () => {
    mockFetchOnce(401, "unauthorized");
    try {
      await llmChat(CFG, OPTS);
      expect.unreachable();
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_auth");
      expect(de.http).toBe(502);
    }
  });

  it("403 → llm_auth", async () => {
    mockFetchOnce(403, {});
    await expect(llmChat(CFG, OPTS)).rejects.toThrowError(expect.objectContaining({ code: "llm_auth" }));
  });

  it("404 → llm_model_not_found (502)", async () => {
    mockFetchOnce(404, {});
    try {
      await llmChat(CFG, OPTS);
      expect.unreachable();
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_model_not_found");
      expect(de.http).toBe(502);
    }
  });

  it("500 → llm_unreachable (502)，message 带状态码", async () => {
    mockFetchOnce(500, "boom");
    try {
      await llmChat(CFG, OPTS);
      expect.unreachable();
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_unreachable");
      expect(de.http).toBe(502);
      expect(de.message).toContain("500");
    }
  });

  it("fetch 网络拒绝 → llm_unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(llmChat(CFG, OPTS)).rejects.toThrowError(
      expect.objectContaining({ code: "llm_unreachable" }),
    );
  });

  it("超时 abort（fake timers 推进 120s）→ llm_unreachable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("LLM 调用超时")),
          );
        }),
      ),
    );
    const p = llmChat(CFG, OPTS);
    const assertion = expect(p).rejects.toThrowError(
      expect.objectContaining({ code: "llm_unreachable" }),
    );
    await vi.advanceTimersByTimeAsync(120_001);
    await assertion;
    vi.useRealTimers();
  });

  it("调用方 signal 提前取消 → llm_unreachable（不吞）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("调用方取消")));
        }),
      ),
    );
    const ac = new AbortController();
    const p = llmChat(CFG, { ...OPTS, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrowError(expect.objectContaining({ code: "llm_unreachable" }));
  });

  it("200 但缺 content 字段 → llm_unreachable（不猜默认值）", async () => {
    mockFetchOnce(200, { choices: [{ message: {} }] });
    await expect(llmChat(CFG, OPTS)).rejects.toThrowError(
      expect.objectContaining({ code: "llm_unreachable" }),
    );
  });

  it("llm_no_backend 优先于发请求（一个 enabled 都没有）", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const cfg = { llmBackends: [{ ...CFG.llmBackends[0], enabled: false }], roleRouting: {} };
    await expect(llmChat(cfg, OPTS)).rejects.toThrowError(
      expect.objectContaining({ code: "llm_no_backend" }),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("私网未标 local → llm_private_url，不发请求", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const cfg = {
      llmBackends: [{ ...CFG.llmBackends[0], baseUrl: "http://127.0.0.1:11434/v1" }],
      roleRouting: {},
    };
    await expect(llmChat(cfg, OPTS)).rejects.toThrowError(
      expect.objectContaining({ code: "llm_private_url" }),
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("temperature 重试", () => {
  it("第一次报错文案含 temperature → 用 temperature=1 重试一次并成功", async () => {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const calls = fn.mock.calls.length;
      if (calls === 1) {
        return new Response("temperature out of range: 0.6 not supported", { status: 400 });
      }
      const body = JSON.parse(init?.body as string) as { temperature: number };
      expect(body.temperature).toBe(1);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fn);
    const out = await chatWithRetry(CFG, OPTS);
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("两次都失败（第二次仍 temperature 错）→ 原错上抛，不吞", async () => {
    const fn = vi.fn(async () => new Response("temperature unsupported", { status: 400 }));
    vi.stubGlobal("fetch", fn);
    try {
      await chatWithRetry(CFG, OPTS);
      expect.unreachable();
    } catch (e) {
      const de = e as DramaError;
      expect(de.code).toBe("llm_unreachable");
      expect(de.message).toContain("temperature");
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("非温度相关错误 → 不重试，原错上抛", async () => {
    const fn = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fn);
    await expect(chatWithRetry(CFG, OPTS)).rejects.toThrowError(
      expect.objectContaining({ code: "llm_unreachable" }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("成功则不重试，输出过 stripReasoning", async () => {
    const fn = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "<think>私密思考</think>答案" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fn);
    const out = await chatWithRetry(CFG, OPTS);
    expect(out).toBe("答案");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("stripReasoning", () => {
  it("<think> 块剥离", () => {
    expect(stripReasoning("<think>内部推理</think>正文")).toBe("正文");
  });

  it("<|…|> 特殊 token 剥离", () => {
    expect(stripReasoning("<|begin_of_thought|>推理<|end_of_thought|>正文")).toBe("推理正文");
  });

  it("markdown fence 剥离", () => {
    expect(stripReasoning("```markdown\n正文内容\n```")).toBe("正文内容");
  });

  it("「思考过程：」元行剥离（含 ** 与前缀装饰）", () => {
    expect(stripReasoning("思考过程：先想一下\n正文")).toBe("正文");
    expect(stripReasoning("**Thinking**: hmm\n正文")).toBe("正文");
  });

  it("多行正文保留，只去元行", () => {
    expect(stripReasoning("备注: x\nA\nB")).toBe("A\nB");
  });
});
