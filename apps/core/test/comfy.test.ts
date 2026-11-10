/**
 * M8 · ComfyUI 生成后端 —— 六子任务测试（全 mock，零真实网络 / 零真实 WS）。
 *
 * 冻结依据：`docs/m489-spec.md` §2.3 出口标准。三个 ★ 用例全写死：
 * ① 心跳坑：ws progress 持续到达而 /history 返回空 → 任务不判死
 * ② assertReallyUpscaling：resolution ≤ 原短边 → 抛错（消息含两个数值）
 * ③ openai 包络坑：响应体不含 ok/data 顶层键（形状断言，openai SDK 兼容）
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { DramaError } from "@text2drama/shared";

import { createRegistry, CONTEXT_FRAMES } from "../src/comfy/registry.js";
import {
  createComfyClient,
  HEARTBEAT_TIMEOUT_MS,
  type MinimalWebSocket,
} from "../src/comfy/client.js";
import { createQueue } from "../src/comfy/queue.js";
import { createCancelCapability } from "../src/comfy/cancel.js";
import {
  assertReallyUpscaling,
  buildSeedVr2UpscaleWorkflow,
  createUpscaleFlow,
} from "../src/comfy/upscale.js";
import { createOpenAiRouter } from "../src/comfy/openai.js";

// ── 临时目录 helper（registry / openai 测试用） ──

const tmpDirs: string[] = [];
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2d-reg-"));
  tmpDirs.push(dir);
  return dir;
}
function writeJson(dir: string, name: string, obj: unknown): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(obj));
}
function writeRaw(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content);
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// ────────────────────────── M8-1 registry ──────────────────────────

describe("M8-1 registry", () => {
  it("★ nodes.length===0 的工作流拒绝入库", () => {
    const dir = makeTempDir();
    writeJson(dir, "empty.json", { id: "empty", kind: "image", nodes: [] });
    const reg = createRegistry(dir);
    expect(reg.get("empty")).toBeUndefined();
    expect(reg.list().length).toBe(0);
  });

  it("缺 adapter → available:false + reason", () => {
    const dir = makeTempDir();
    writeJson(dir, "h3.json", {
      id: "h3-2pass",
      label: "H3 两阶段",
      kind: "video",
      nodes: [{ class_type: "H3Sampler" }],
      requiresAdapter: "stage-b-adapter.json",
    });
    const reg = createRegistry(dir);
    const entry = reg.get("h3-2pass");
    expect(entry).toBeDefined();
    expect(entry?.available).toBe(false);
    expect(entry?.reason).toContain("stage-b-adapter.json");
  });

  it("adapter 存在 → available:true；hidden 照常入库", () => {
    const dir = makeTempDir();
    writeJson(dir, "ad.json", { any: true });
    writeJson(dir, "w.json", {
      id: "image-krea2-aesthetics",
      label: "Krea2",
      kind: "image",
      hidden: true,
      nodes: [{ class_type: "X" }],
      requiresAdapter: "ad.json",
    });
    const reg = createRegistry(dir);
    const e = reg.get("image-krea2-aesthetics");
    expect(e?.available).toBe(true);
    expect(e?.hidden).toBe(true);
    expect(e?.reason).toBeNull();
  });

  it("JSON 解析失败 / kind 非法的文件跳过，不拖垮其他条目", () => {
    const dir = makeTempDir();
    writeRaw(dir, "bad.json", "{not json");
    writeJson(dir, "wrongkind.json", { id: "x", kind: "audio", nodes: [1] });
    writeJson(dir, "good.json", {
      id: "good",
      kind: "image",
      nodes: [{ class_type: "Y" }],
    });
    const reg = createRegistry(dir);
    expect(reg.get("good")?.available).toBe(true);
    expect(reg.list().length).toBe(1);
  });
});

describe("CONTEXT_FRAMES 常量（decision-log §12.2）", () => {
  it("只有 5/22/39 三个合法档位，M8 仅导出（M12 消费）", () => {
    expect(CONTEXT_FRAMES).toEqual([5, 22, 39]);
  });
});

// ────────────────────────── M8-2 client：★心跳坑 ──────────────────────────

/** 可编程 mock WS：测试手动注入事件 */
class MockWebSocket implements MinimalWebSocket {
  handlers: Record<string, ((data?: unknown) => void)[]> = {};
  on(event: string, cb: (data?: unknown) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(): void {
    (this.handlers["close"] ?? []).forEach((cb) => cb());
  }
  /** 测试注入一条 ComfyUI ws 消息 */
  emit(msg: unknown): void {
    (this.handlers["message"] ?? []).forEach((cb) => cb(JSON.stringify(msg)));
  }
}

/** ★用例①配套：client 不提供 /history 判活——fetch mock 记录 /history 调用，必须为 0 */
function clientWithMockWs(ws: MockWebSocket, fetchLog: string[]) {
  return createComfyClient({
    baseUrl: "http://mock-comfy",
    wsUrl: "ws://mock-comfy/ws",
    fetchImpl: async (url, init) => {
      fetchLog.push(String(url));
      void init;
      return new Response(JSON.stringify({ prompt_id: "p1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    wsFactory: () => ws,
  });
}

describe("M8-2 client 心跳", () => {
  it(
    "★ /history 返回空但 ws 有 progress → 任务保持 running 不误杀（不用 /history 判活）",
    async () => {
      vi.useFakeTimers();
      try {
        const ws = new MockWebSocket();
        const fetchLog: string[] = [];
        const client = clientWithMockWs(ws, fetchLog);
        const events: { type: string; data: unknown }[] = [];
        client.watch("p1", (e) => events.push(e));

        // 模拟视频长跑 10 分钟：每 30s 一条 progress，/history 一直查不到数据
        // （真实场景就是 architecture L1882「任务在跑时 /history 根本不返回数据」）
        for (let t = 0; t < 20; t++) {
          await vi.advanceTimersByTimeAsync(30_000);
          ws.emit({ type: "progress", data: { value: t * 5, max: 100, prompt_id: "p1" } });
        }
        // 没有任何 error（heartbeat_timeout）事件 → 未误杀
        const errEvents = events.filter((e) => e.type === "error");
        expect(errEvents).toEqual([]);
        expect(events.filter((e) => e.type === "progress").length).toBe(20);
        // ★ 且全程未调 GET /history——判活只认 ws
        expect(fetchLog.some((u) => u.includes("/history"))).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    },
    20_000,
  );

  it("超过 HEARTBEAT_TIMEOUT_MS 无任何 ws 事件 → 判死（heartbeat_timeout）", async () => {
    vi.useFakeTimers();
    try {
      const ws = new MockWebSocket();
      const client = clientWithMockWs(ws, []);
      const events: { type: string; data: unknown }[] = [];
      client.watch("p1", (e) => events.push(e));
      // 心跳定时器每 HEARTBEAT_TIMEOUT_MS 触发一次，检查阈值是「超过」；
      // advance 两个周期保证 120s 边界稳定越过
      await vi.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS * 2 + 1_000);
      const err = events.find((e) => e.type === "error");
      expect(err).toBeDefined();
      expect((err?.data as { reason?: string } | undefined)?.reason).toBe(
        "heartbeat_timeout",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("executing node=null → done；execution_error → error", () => {
    const ws = new MockWebSocket();
    const client = clientWithMockWs(ws, []);
    const events: { type: string; data: unknown }[] = [];
    client.watch("p1", (e) => events.push(e));
    ws.emit({ type: "executing", data: { node: "4", prompt_id: "p1" } });
    ws.emit({ type: "executing", data: { node: null, prompt_id: "p1" } });
    expect(events.map((e) => e.type)).toEqual(["executing", "done"]);
  });

  it("submit：POST /prompt → promptId；响应缺 prompt_id 报错不猜", async () => {
    const client = createComfyClient({
      baseUrl: "http://mock",
      wsUrl: "ws://mock/ws",
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
      wsFactory: () => new MockWebSocket(),
    });
    await expect(client.submit({ 1: {} })).rejects.toMatchObject({
      code: "comfy_offline",
    });
  });

  it("fetch 网络错误 → comfy_offline（不静默降级）", async () => {
    const client = createComfyClient({
      baseUrl: "http://mock",
      wsUrl: "ws://mock/ws",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      wsFactory: () => new MockWebSocket(),
    });
    await expect(client.submit({})).rejects.toMatchObject({
      code: "comfy_offline",
    });
  });
});

// ────────────────────────── M8-3 queue ──────────────────────────

function makeQueueDeps(overrides?: {
  vramFree?: () => Promise<number>;
  free?: () => Promise<void>;
}) {
  const freeCalls: number[] = [];
  let vramFree = overrides?.vramFree ?? (async () => 8192);
  const deps = {
    vramFree: () => vramFree(),
    free: overrides?.free ?? (async () => { freeCalls.push(Date.now()); }),
    downgrade: undefined,
    pollIntervalMs: 5,
    setVramFree: (fn: () => Promise<number>) => { vramFree = fn; },
  };
  return { deps, freeCalls };
}

describe("M8-3 queue", () => {
  it("cap=1 串行：第二个任务等第一个跑完才开始", async () => {
    const { deps } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    const order: string[] = [];
    let release1: (() => void) | undefined;
    const gate1 = new Promise<void>((r) => { release1 = r; });

    void queue.enqueue({
      id: "t1",
      estimateVramMB: 100,
      run: async () => {
        order.push("t1-start");
        await gate1;
        order.push("t1-end");
      },
    });
    await vi.waitFor(() => expect(order).toEqual(["t1-start"]));
    expect(queue.status()).toMatchObject({ running: "t1" });
    void queue.enqueue({
      id: "t2",
      estimateVramMB: 100,
      run: async () => { order.push("t2-start"); },
    });
    expect(order).toEqual(["t1-start"]); // 串行：t2 未开始
    release1?.();
    await vi.waitFor(() => expect(order).toEqual(["t1-start", "t1-end", "t2-start"]));
    expect(queue.status().running).toBeNull();
  });

  it("队列超长 → queue_full (503)", async () => {
    const { deps } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 1 },
      deps,
    );
    // t0 占住 running（显存充足，进入 run 后永不结束）
    deps.setVramFree?.(async () => 8192);
    void queue.enqueue({
      id: "t0",
      estimateVramMB: 1,
      run: async () => { await new Promise(() => {}); },
    });
    await vi.waitFor(() => expect(queue.status().running).toBe("t0"));
    void queue.enqueue({ id: "t2", estimateVramMB: 1, run: async () => {} }); // 占满队列
    await expect(
      queue.enqueue({ id: "t3", estimateVramMB: 1, run: async () => {} }),
    ).rejects.toSatisfy((e: unknown) => {
      const de = e as DramaError;
      return de instanceof DramaError && de.code === "queue_full" && de.http === 503;
    });
  });

  it("显存不足 → 挂起（suspended=true），恢复后继续执行", async () => {
    const { deps } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    let freeMB = 500; // 低于 1024
    deps.setVramFree?.(async () => freeMB);
    const ran: string[] = [];
    void queue.enqueue({
      id: "t1",
      estimateVramMB: 6000,
      run: async () => { ran.push("t1"); },
    });
    // 挂起判定给足轮询窗口（pollIntervalMs=5，至少跑完一次守门检查）
    await new Promise((r) => setTimeout(r, 50));
    expect(queue.status().suspended).toBe(true);
    expect(ran).toEqual([]); // 挂起中不执行
    freeMB = 4096; // 显存释放
    await vi.waitFor(() => expect(ran).toEqual(["t1"]));
    expect(queue.status().suspended).toBe(false);
    expect(queue.lastError()).toBeNull();
  });

  it("显存守门等待中被取消 → vram_insufficient 记入 lastError", async () => {
    const { deps } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    deps.setVramFree?.(async () => 500);
    void queue.enqueue({ id: "t1", estimateVramMB: 6000, run: async () => {} });
    await new Promise((r) => setTimeout(r, 50)); // 给足守门轮询窗口
    expect(queue.status().suspended).toBe(true);
    queue.cancelQueued("t1"); // 挂起等待期间取消
    await vi.waitFor(() => {
      const le = queue.lastError();
      expect(le).not.toBeNull();
      expect((le?.error as DramaError).code).toBe("vram_insufficient");
    });
  });

  it("OOM → 调 /free + 降档重试一次成功", async () => {
    const { deps, freeCalls } = makeQueueDeps();
    let attempts = 0;
    const downgrades: number[] = [];
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      {
        ...deps,
        downgrade: (task) => {
          downgrades.push(1);
          return { ...task, run: task.run }; // 降档钩子被调用的证据
        },
      },
    );
    await queue.enqueue({
      id: "t1",
      estimateVramMB: 1,
      run: async () => {
        attempts++;
        if (attempts === 1) {
          throw new DramaError("comfy_out_of_memory");
        }
      },
    });
    await vi.waitFor(() => expect(attempts).toBe(2)); // 重试了一次
    expect(freeCalls.length).toBe(1); // /free 调用一次
    expect(downgrades.length).toBe(1);
    expect(queue.lastError()).toBeNull(); // 重试成功，无错误记录
  });

  it("第二次 OOM → 原错上抛（comfy_out_of_memory），不静默降级", async () => {
    const { deps, freeCalls } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    const boom = async (): Promise<void> => {
      throw new DramaError("comfy_out_of_memory");
    };
    void queue.enqueue({ id: "t1", estimateVramMB: 1, run: boom });
    // OOM → /free 一次 → 重试 → 再 OOM → 原错上抛进 lastError（不静默降级）
    await vi.waitFor(() => expect(freeCalls.length).toBe(1));
    await vi.waitFor(() => {
      const le = queue.lastError();
      expect(le).not.toBeNull();
      expect((le?.error as DramaError).code).toBe("comfy_out_of_memory");
      expect((le?.error as DramaError).http).toBe(500);
    });
  });

  it("非 OOM 错误直接上抛，不走 /free 重试", async () => {
    const { deps, freeCalls } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    void queue.enqueue({
      id: "t1",
      estimateVramMB: 1,
      run: async () => { throw new DramaError("comfy_offline"); },
    });
    await vi.waitFor(() => {
      const le = queue.lastError();
      expect(le).not.toBeNull();
      expect((le?.error as DramaError).code).toBe("comfy_offline");
    });
    expect(freeCalls.length).toBe(0);
  });
});

// ────────────────────────── M8-4 cancel：幂等 ──────────────────────────

describe("M8-4 cancel", () => {
  function setup() {
    const { deps } = makeQueueDeps();
    const queue = createQueue(
      { concurrencyCap: 1, vramGuardMB: 1024, maxQueueLength: 10 },
      deps,
    );
    const remoteCalls: string[] = [];
    const client = createComfyClient({
      baseUrl: "http://mock",
      wsUrl: "ws://mock/ws",
      fetchImpl: async (url, init) => {
        remoteCalls.push(`${init?.method ?? "GET"} ${String(url)}`);
        return new Response("{}", { status: 200 });
      },
      wsFactory: () => new MockWebSocket(),
    });
    const unwatches: string[] = [];
    const promptIds = new Map<string, string>([["t1", "p1"]]);
    const cancel = createCancelCapability(client, queue, {
      getPromptId: (id) => promptIds.get(id),
      unwatch: (id) => unwatches.push(id),
    });
    return { queue, remoteCalls, unwatches, cancel };
  }

  it("取消已提交任务：本地移除 + queue delete + interrupt + unwatch", async () => {
    const { queue, remoteCalls, unwatches, cancel } = setup();
    void queue.enqueue({ id: "t1", estimateVramMB: 1, run: async () => {} });
    await cancel.cancel("t1");
    expect(queue.status().queued).toBe(0); // 本地移除
    expect(unwatches).toEqual(["t1"]); // abort 轮询
    expect(remoteCalls.some((c) => c.includes("/queue"))).toBe(true); // queue delete
    expect(remoteCalls.some((c) => c.includes("/interrupt"))).toBe(true);
  });

  it("★ 幂等：重复取消不抛、远端动作只做一次", async () => {
    const { remoteCalls, cancel } = setup();
    await cancel.cancel("t1");
    await expect(cancel.cancel("t1")).resolves.toBeUndefined(); // 不抛
    await expect(cancel.cancel("t1")).resolves.toBeUndefined();
    const remoteCount = remoteCalls.length;
    await cancel.cancel("t1");
    expect(remoteCalls.length).toBe(remoteCount); // 第二次起无新远端调用
  });

  it("取消未知任务也返成功（幂等生命周期语义）", async () => {
    const { cancel } = setup();
    await expect(cancel.cancel("nonexistent")).resolves.toBeUndefined();
  });
});

// ────────────────────────── M8-5 upscale：★用例② ──────────────────────────

describe("M8-5 upscale", () => {
  it("★ resolution ≤ 原短边 → 抛错，message 含两个数值", () => {
    // 等值
    expect(() => assertReallyUpscaling(1168, 1168)).toThrowError(/1168/);
    // 缩小：两个数值都在 message 里（spec 要求「消息含两个数值」）
    try {
      assertReallyUpscaling(2016, 1080);
      expect.unreachable("必须抛错");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("2016");
      expect(msg).toContain("1080");
      expect((e as DramaError).code).toBe("invalid_param");
    }
  });

  it("resolution > 原短边 → 通过（不抛）", () => {
    expect(() => assertReallyUpscaling(1168, 1440)).not.toThrow();
  });

  it("SeedVR2 三件套参数结构：官方三节点，不许走 UNETLoader 通用链", () => {
    const { prompt, nodeIds } = buildSeedVr2UpscaleWorkflow({
      assetPath: "in.png",
      resolution: 1440,
    });
    const classes = Object.values(prompt).map(
      (n) => (n as { class_type: string }).class_type,
    );
    // 三件套（architecture L1224-1229）
    expect(classes).toContain("SeedVR2LoadDiTModel");
    expect(classes).toContain("SeedVR2LoadVAEModel");
    expect(classes).toContain("SeedVR2VideoUpscaler");
    // 坑：通用链必须不存在（L1234-1237 已废弃）
    expect(classes).not.toContain("UNETLoader");
    expect(classes).not.toContain("VAELoader");
    expect(classes).not.toContain("KSampler");
    // 关键实测参数（L1270-1290）
    const up = prompt[nodeIds.upscaler] as { inputs: Record<string, unknown> };
    expect(up.inputs.batch_size).toBe(1); // 静态图必须 1
    expect(up.inputs.offload_device).toBe("cpu");
    expect(up.inputs.color_correction).toBe("lab");
    expect(up.inputs.resolution).toBe(1440); // 目标短边
    const dit = prompt[nodeIds.dit] as { inputs: Record<string, unknown> };
    expect(dit.inputs.cache_model).toBe(true);
    expect(dit.inputs.offload_device).toBe("cpu"); // cache_model=true 硬约束
    const vae = prompt[nodeIds.vae] as { inputs: Record<string, unknown> };
    expect(vae.inputs.encode_tiled).toBe(true);
    expect(vae.inputs.decode_tiled).toBe(true);
  });

  it("submitImageUpscale：先断言再提交；断言不过不发 /prompt", async () => {
    const posts: string[] = [];
    const client = createComfyClient({
      baseUrl: "http://mock",
      wsUrl: "ws://mock/ws",
      fetchImpl: async (url) => {
        posts.push(String(url));
        return new Response(JSON.stringify({ prompt_id: "px" }), { status: 200 });
      },
      wsFactory: () => new MockWebSocket(),
    });
    const flow = createUpscaleFlow(client);
    await expect(
      flow.submitImageUpscale({ assetPath: "a.png", srcShortEdge: 1168, resolution: 1080 }),
    ).rejects.toMatchObject({ code: "invalid_param" });
    expect(posts).toEqual([]); // 缩图请求根本没出网
    const { promptId } = await flow.submitImageUpscale({
      assetPath: "a.png",
      srcShortEdge: 1168,
      resolution: 1440,
    });
    expect(promptId).toBe("px");
    expect(posts.some((u) => u.includes("/prompt"))).toBe(true);
  });
});

// ────────────────────────── M8-6 openai：★用例③ 包络坑 ──────────────────────────

describe("M8-6 openai /v1/*", () => {
  function mockRegistry() {
    const dir = makeTempDir();
    writeJson(dir, "a.json", {
      id: "moss-sft-8step", label: "MOSS 8步", kind: "image", nodes: [{ class_type: "X" }],
    });
    writeJson(dir, "b.json", {
      id: "krea2-aesthetics", label: "Krea2", kind: "image", hidden: true, nodes: [{ class_type: "X" }],
    });
    writeJson(dir, "c.json", {
      id: "h3-2pass", label: "H3", kind: "video", nodes: [{ class_type: "Y" }],
    });
    writeJson(dir, "d.json", {
      id: "h3-2pass-vdn", label: "H3 VDN", kind: "video", nodes: [{ class_type: "Y" }],
      requiresAdapter: "missing-adapter.bin",
    }); // 缺 adapter → 不可用 → 不出现在 /v1/models
    const reg = createRegistry(dir);
    return reg;
  }

  /** 起真实本地 http server 挂 router（mock HTTP 层，零外部网络） */
  const tmpServers: http.Server[] = [];
  async function serve(router: express.Router): Promise<string> {
    const app = express();
    app.use(express.json());
    app.use("/v1", router);
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    tmpServers.push(server);
    return `http://127.0.0.1:${port}`;
  }
  afterEach(() => {
    for (const s of tmpServers.splice(0)) s.close();
  });

  it("★ /v1/models 顶层键是 object/data（openai SDK 形状），不含 ok 包络", async () => {
    const reg = mockRegistry();
    const base = await serve(createOpenAiRouter({ registry: reg }));
    const res = await fetch(`${base}/v1/models`);
    const body = (await res.json()) as Record<string, unknown>;
    // ★ 形状断言：顶层键必须恰好是 openai SDK 期望的
    expect(Object.keys(body).sort()).toEqual(["data", "object"]);
    expect(body.object).toBe("list");
    const items = body.data as { id: string; object: string; owned_by: string }[];
    expect(items.every((m) => m.object === "model" && m.owned_by === "local")).toBe(true);
    // ★ 不许出现包络顶层键
    expect("ok" in body).toBe(false);
    // available 过滤：缺 adapter 的 h3-2pass-vdn 被剔除；hidden 默认不出现
    expect(items.map((m) => m.id).sort()).toEqual(["h3-2pass", "moss-sft-8step"]);
    // ?all=1 展开 hidden
    const resAll = await fetch(`${base}/v1/models?all=1`);
    const bodyAll = (await resAll.json()) as { data: { id: string }[] };
    expect(bodyAll.data.map((m) => m.id).sort()).toEqual([
      "h3-2pass", "krea2-aesthetics", "moss-sft-8step",
    ]);
  });

  it("★ /v1/images/generations 响应形状符合 openai SDK，不含 ok 包络", async () => {
    const reg = mockRegistry();
    const base = await serve(
      createOpenAiRouter({
        registry: reg,
        submitImage: async () => ({ assetUrls: ["http://files/a.png", "http://files/b.png"] }),
      }),
    );
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "moss-sft-8step", prompt: "a cat", n: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // ★ openai SDK images 形状：{ created, data: [{url}] }——顶层只有这两个键
    expect(Object.keys(body).sort()).toEqual(["created", "data"]);
    expect("ok" in body).toBe(false);
    const data = body.data as { url: string }[];
    expect(data.length).toBe(2);
    expect(data[0]?.url).toBe("http://files/a.png");
  });

  it("失败形状：{ error: { message, type, code } }，同样不套 ok/data", async () => {
    const reg = mockRegistry();
    const base = await serve(createOpenAiRouter({ registry: reg }));
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "no-such", prompt: "x" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]);
    expect("ok" in body).toBe(false);
    expect("data" in body).toBe(false);
    const err = body.error as { message: string; type: string; code: string };
    expect(err.type).toBe("invalid_request_error");
    expect(err.code).toBe("llm_model_not_found");
  });

  it("POST /v1/videos：任务制形状 + deriveTaskType 推导回显（hybrid 最高优先）", async () => {
    const reg = mockRegistry();
    const submitted: { taskType?: string }[] = [];
    const base = await serve(
      createOpenAiRouter({
        registry: reg,
        submitVideo: async (o) => {
          submitted.push(o);
          return { taskId: "tsk_1", promptId: "p1" };
        },
      }),
    );
    // refs=[first, character] → hybrid（与 M7 推导一致）
    const res = await fetch(`${base}/v1/videos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "h3-2pass",
        prompt: "p",
        durationSec: 5,
        refs: [
          { assetId: "a", kind: "image", role: "first" },
          { assetId: "c", kind: "image", role: "character" },
        ],
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    // ★ 任务制形状：id/object/status/created_at/model/metadata——没有 ok
    expect(Object.keys(body).sort()).toEqual([
      "created_at", "id", "metadata", "model", "object", "status",
    ]);
    expect(body.object).toBe("video");
    expect(body.status).toBe("queued");
    const meta = body.metadata as Record<string, unknown>;
    expect(meta.derivedTaskType).toBe("hybrid");
    expect(meta.promptShell).toBe("six-section");
    expect(meta.frames).toBe(124); // 5s → 124 帧（M7 ceil 裁决）
    expect(submitted[0]?.taskType).toBe("hybrid");
  });

  it("durationSec 超出 5–15 整数 → 400 invalid_param，不封顶截断", async () => {
    const reg = mockRegistry();
    const base = await serve(createOpenAiRouter({ registry: reg }));
    for (const bad of [4, 16, 5.5]) {
      const res = await fetch(`${base}/v1/videos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "h3-2pass", prompt: "p", durationSec: bad }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("invalid_param");
    }
  });

  it("显式 taskType 与素材冲突 → invalid_task_type_for_media，不静默改路", async () => {
    const reg = mockRegistry();
    const base = await serve(createOpenAiRouter({ registry: reg }));
    const res = await fetch(`${base}/v1/videos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "h3-2pass",
        prompt: "p",
        durationSec: 5,
        taskType: "i2va", // 带参考素材却传 i2va → 冲突
        refs: [{ assetId: "c", kind: "image", role: "character" }],
      }),
    });
    const body = (await res.json()) as { error?: { code?: string } };
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("invalid_task_type_for_media");
  });

  it("GET /v1/videos/:id：queued/completed/failed 三态同形状，completed 附 url", async () => {
    const reg = mockRegistry();
    const tasks = new Map([
      ["tsk_a", { id: "tsk_a", status: "queued" as const }],
      ["tsk_b", { id: "tsk_b", status: "completed" as const, url: "/v1/videos/vid_tsk_b/content" }],
      ["tsk_c", { id: "tsk_c", status: "failed" as const, error: { code: "comfy_out_of_memory", message: "OOM" } }],
    ]);
    const base = await serve(
      createOpenAiRouter({
        registry: reg,
        getVideoTask: (id) => tasks.get(id),
      }),
    );
    const q = await (await fetch(`${base}/v1/videos/vid_tsk_a`)).json() as Record<string, unknown>;
    expect("ok" in q).toBe(false);
    expect(q.status).toBe("queued");
    const c = await (await fetch(`${base}/v1/videos/vid_tsk_b`)).json() as Record<string, unknown>;
    expect(c.url).toBe("/v1/videos/vid_tsk_b/content");
    const f = await (await fetch(`${base}/v1/videos/vid_tsk_c`)).json() as Record<string, unknown>;
    expect((f.error as { code: string }).code).toBe("comfy_out_of_memory");
    const nf = await fetch(`${base}/v1/videos/vid_none`);
    expect(nf.status).toBe(404);
    const nfBody = (await nf.json()) as { error: { code: string } };
    expect(nfBody.error.code).toBe("task_not_found");
  });
});
