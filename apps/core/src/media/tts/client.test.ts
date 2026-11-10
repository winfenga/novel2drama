/**
 * M9-1/M9-2 测试 · TTS client（锁包装/幂等/离线）与 batch（Task 包装/实测时长/透传/409）。
 * fetch / lock 全 mock，零真实网络。
 */
import { describe, expect, it } from "vitest";
import { DramaError } from "@text2drama/shared";

import { createGpuLock, type GpuLock } from "../../gpu/lock.js";
import { createTtsClient, type FetchLike } from "./client.js";
import { synthesizeBatch } from "./batch.js";

const okJson = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function mockFetch(handler: (url: string, init?: { method?: string; body?: string }) => {
  status: number;
  body: unknown;
}): FetchLike & { calls: { url: string; init?: { method?: string; body?: string } }[] } {
  const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
  const fn = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return okJson(status, body);
  };
  return Object.assign(fn, { calls });
}

describe("M9-1 tts/client", () => {
  it("load：先 acquire('tts') 再 POST /api/load；成功返回 warnings", async () => {
    const lock = createGpuLock();
    const fetchMock = mockFetch(() => ({ status: 200, body: { ok: true, warnings: ["VRAM 低水位"] } }));
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    const r = await client.load();
    expect(r.warnings).toEqual(["VRAM 低水位"]);
    expect(fetchMock.calls[0]).toEqual({
      url: "http://127.0.0.1:17863/api/load",
      init: { method: "POST" },
    });
    expect(lock.status()).toEqual({ holder: "tts" }); // 持锁段：load→batch→unload
  });

  it("load：锁被 comfyui 占用 → gpu_lock_held，且不发 HTTP", async () => {
    const lock = createGpuLock();
    await lock.acquire("comfyui");
    const fetchMock = mockFetch(() => ({ status: 200, body: {} }));
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    await expect(client.load()).rejects.toMatchObject({ code: "gpu_lock_held", details: { holder: "comfyui" } });
    expect(fetchMock.calls).toHaveLength(0); // 不许直连绕过锁
  });

  it("load：服务不可达 → voice_offline(503)，锁释放回可用态", async () => {
    const lock = createGpuLock();
    const failing: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: failing });
    await expect(client.load()).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(DramaError);
      expect((e as DramaError).code).toBe("voice_offline");
      expect((e as DramaError).http).toBe(503);
      return true;
    });
    expect(lock.status()).toEqual({ holder: null }); // 失败不静默持锁
  });

  it("load：幂等（服务端 ok:true 重复加载不报错）", async () => {
    const lock = createGpuLock();
    const fetchMock = mockFetch(() => ({ status: 200, body: { ok: true } }));
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    await expect(client.load()).resolves.toMatchObject({ warnings: [] });
    await expect(client.load()).resolves.toMatchObject({ warnings: [] });
  });

  it("unload：POST /api/unload 成功后 release 锁", async () => {
    const lock = createGpuLock();
    const fetchMock = mockFetch(() => ({ status: 200, body: { ok: true } }));
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    await client.load();
    expect(lock.status().holder).toBe("tts");
    await client.unload();
    expect(lock.status()).toEqual({ holder: null }); // 唤醒 ComfyUI 排队
    const last = fetchMock.calls[fetchMock.calls.length - 1]!;
    expect(last).toEqual({
      url: "http://127.0.0.1:17863/api/unload",
      init: { method: "POST" },
    });
  });

  it("unload：HTTP 失败也 release（finally），原错上抛", async () => {
    const lock = createGpuLock();
    let fail = false;
    const fetchMock = mockFetch(() =>
      fail ? { status: 500, body: { error: "boom" } } : { status: 200, body: { ok: true } },
    );
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    await client.load();
    fail = true;
    await expect(client.unload()).rejects.toBeInstanceOf(DramaError);
    expect(lock.status()).toEqual({ holder: null });
  });
});

describe("M9-2 tts/batch", () => {
  function loadedLock(): GpuLock {
    const lock = createGpuLock();
    // 模拟 load 成功后的持锁态（同步不可行，acquire 是 async —— 测试里先 await）
    return lock;
  }

  async function makeLoaded(): Promise<GpuLock> {
    const lock = loadedLock();
    await lock.acquire("tts");
    return lock;
  }

  const batchBody = {
    ok: true,
    jobId: "8acd2d498da8",
    status: "done",
    results: [
      { id: "s001", ok: true, durationSec: 4.63, sampleRate: 48000 },
      { id: "s002", ok: true, durationSec: 2.11, sampleRate: 48000 },
    ],
  };

  it("成功：jobId 包装为 taskId；durationSec 用实测值；emotion/strength/durationFactor 透传", async () => {
    const lock = await makeLoaded();
    const fetchMock = mockFetch(() => ({ status: 200, body: batchBody }));
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: fetchMock });
    const r = await synthesizeBatch(
      client,
      lock,
      [
        { id: "s001", text: "夜色渐深。" },
        { id: "s002", text: "你终于来了。", emotion: "angry", strength: 0.9, durationFactor: 1.2 },
      ],
      "流萤.wav",
      { fetch: fetchMock },
    );
    expect(r.taskId).toBe("8acd2d498da8");
    expect(r.items).toEqual([
      { id: "s001", durationSec: 4.63, sampleRate: 48000 },
      { id: "s002", durationSec: 2.11, sampleRate: 48000 },
    ]);
    const init = fetchMock.calls[0]!.init!;
    const sent = JSON.parse(init!.body!) as Record<string, unknown>;
    expect(sent).toMatchObject({ voice: "流萤.wav", wait: true });
    expect((sent.items as unknown[])[1]).toMatchObject({ emotion: "angry", strength: 0.9, durationFactor: 1.2 });
  });

  it("未持锁直接合成 → gpu_lock_held（不许绕锁）", async () => {
    const lock = createGpuLock(); // 未 load
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock, fetch: mockFetch(() => ({ status: 200, body: batchBody })) });
    await expect(synthesizeBatch(client, lock, [{ text: "hi" }], "v.wav", { fetch: mockFetch(() => ({ status: 200, body: batchBody })) }))
      .rejects.toMatchObject({ code: "gpu_lock_held" });
  });

  it("服务返回 409 → voice_not_loaded(409)", async () => {
    const lock = await makeLoaded();
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock });
    await expect(
      synthesizeBatch(client, lock, [{ text: "hi" }], "v.wav", {
        fetch: mockFetch(() => ({ status: 409, body: { error: "model not loaded" } })),
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as DramaError).code).toBe("voice_not_loaded");
      expect((e as DramaError).http).toBe(409);
      return true;
    });
  });

  it("网络失败 → voice_offline(503)", async () => {
    const lock = await makeLoaded();
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock });
    const failing: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(synthesizeBatch(client, lock, [{ text: "hi" }], "v.wav", { fetch: failing }))
      .rejects.toMatchObject({ code: "voice_offline" });
  });

  it("单条失败不静默：jobId 正常但 item ok:false → 上抛带 failures", async () => {
    const lock = await makeLoaded();
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock });
    await expect(
      synthesizeBatch(client, lock, [{ id: "s001", text: "a" }, { id: "s002", text: "b" }], "v.wav", {
        fetch: mockFetch(() => ({
          status: 200,
          body: {
            ok: true,
            jobId: "j1",
            results: [
              { id: "s001", ok: true, durationSec: 1.0 },
              { id: "s002", ok: false, error: "voice 文件不存在" },
            ],
          },
        })),
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const de = e as DramaError;
      expect(de.code).toBe("voice_offline");
      expect(de.details).toMatchObject({ jobId: "j1", failures: [{ id: "s002", error: "voice 文件不存在" }] });
      return true;
    });
  });

  it("空 items / 空 voice → invalid_param / voice_no_reference", async () => {
    const lock = await makeLoaded();
    const client = createTtsClient({ baseUrl: "http://127.0.0.1:17863", lock });
    await expect(synthesizeBatch(client, lock, [], "v.wav")).rejects.toMatchObject({ code: "invalid_param" });
    await expect(synthesizeBatch(client, lock, [{ text: "a" }], "")).rejects.toMatchObject({ code: "voice_no_reference" });
  });
});

