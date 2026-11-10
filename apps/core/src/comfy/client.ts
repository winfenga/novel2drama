/**
 * M8-2 · ComfyUI 提交与心跳。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（architecture L1881-1884）。
 *
 * ★ 心跳坑（architecture L1881-1884 原文）：心跳只认 WebSocket /ws 的
 *   `progress` / `executing` 事件判活。**不许用 GET /history/{id} 判活**——
 *   它是终态查询，任务在跑时根本不返回数据，「连续 120s 无变化」永远为真，
 *   视频任务必被误杀。超过 HEARTBEAT_TIMEOUT_MS（默认 120s）没收到任何 ws 事件才判卡死。
 *
 * 传输层可注入（spec §4.4：测试全 mock 零真实网络）：
 * - `fetchImpl`  默认 globalThis.fetch，mock 时替换
 * - `wsFactory`  返回 { on(event, cb), close() } 的最小 WS 接口；生产由真实 ws 库适配
 *
 * 判活规则：每次收到 progress/executing 事件刷新 lastBeat；
 * 定时器间隔 HEARTBEAT_TIMEOUT_MS 检查，超时 → onEvent({type:"error", data:{reason:"heartbeat_timeout"}})
 * 并停止监听。done/error 事件来自 ComfyUI 的 executing(node=null)/execution_error 消息。
 */

import { DramaError } from "@text2drama/shared";

export interface ComfyClientOpts {
  baseUrl: string;
  wsUrl: string;
  /** 注入 fetch（测试 mock）；缺省用 globalThis.fetch */
  fetchImpl?: typeof fetch;
  /** 注入 WS 工厂（测试 mock）；缺省用真实 WebSocket（Node 22+ 内置全局） */
  wsFactory?: (wsUrl: string) => MinimalWebSocket;
}

/** 最小 WebSocket 接口——真实 ws 库 / Node 内置 WebSocket 都能适配进来 */
export interface MinimalWebSocket {
  on(event: "message", cb: (data: unknown) => void): void;
  on(event: "close" | "error", cb: (data?: unknown) => void): void;
  close(): void;
}

export interface ComfyEvent {
  type: "progress" | "executing" | "done" | "error";
  data: unknown;
}

/** 心跳超时默认 120s（architecture L1884） */
export const HEARTBEAT_TIMEOUT_MS = 120_000;

interface WsPayload {
  type?: unknown;
  data?: unknown;
  [k: string]: unknown;
}

function classifyMessage(msg: WsPayload): ComfyEvent["type"] | null {
  if (msg.type === "progress") return "progress";
  if (msg.type === "executing") {
    // ComfyUI 约定：executing 且 node === null 表示当前 prompt 执行结束 → done
    const node = (msg.data as { node?: unknown } | undefined)?.node;
    return node === null ? "done" : "executing";
  }
  if (msg.type === "execution_error" || msg.type === "execution_interrupted") {
    return "error";
  }
  return null;
}

export function createComfyClient(opts: ComfyClientOpts): {
  submit(workflow: unknown): Promise<{ promptId: string }>;
  watch(
    promptId: string,
    onEvent: (e: ComfyEvent) => void,
  ): () => void;
  /** OOM 自愈用：调 ComfyUI /free（unload_models + free_memory） */
  free(): Promise<void>;
  /** cancel 能力用：POST /queue delete + POST /interrupt */
  deleteFromQueue(promptId: string): Promise<void>;
  interrupt(): Promise<void>;
} {
  const doFetch = opts.fetchImpl ?? fetch.bind(globalThis);

  async function post(pathname: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(opts.baseUrl.replace(/\/$/, "") + pathname, {
        method: "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new DramaError("comfy_offline", { cause: err });
    }
    if (!res.ok) {
      throw new DramaError("comfy_offline", {
        message: `ComfyUI ${pathname} 返回 ${res.status}`,
      });
    }
    return (await res.json()) as unknown;
  }

  return {
    async submit(workflow: unknown): Promise<{ promptId: string }> {
      const json = (await post("/prompt", { prompt: workflow })) as {
        prompt_id?: unknown;
      };
      if (typeof json.prompt_id !== "string" || json.prompt_id.length === 0) {
        throw new DramaError("comfy_offline", {
          message: "ComfyUI /prompt 响应缺少 prompt_id",
        });
      }
      return { promptId: json.prompt_id };
    },

    watch(promptId: string, onEvent: (e: ComfyEvent) => void): () => void {
      let closed = false;
      let ws: MinimalWebSocket;
      try {
        ws = opts.wsFactory
          ? opts.wsFactory(opts.wsUrl)
          : (new WebSocket(opts.wsUrl) as unknown as MinimalWebSocket);
      } catch (err) {
        onEvent({ type: "error", data: { reason: "ws_connect_failed", cause: String(err) } });
        return () => {};
      }

      let lastBeat = Date.now();
      const beat = () => {
        lastBeat = Date.now();
      };

      const timer = setInterval(() => {
        if (closed) return;
        if (Date.now() - lastBeat > HEARTBEAT_TIMEOUT_MS) {
          // ★ 只按 ws 心跳判死；/history 为空不算证据（终态查询坑）
          closed = true;
          clearInterval(timer);
          try {
            ws.close();
          } catch {
            // 关闭失败不影响判死结论——ws 已经不可信
          }
          onEvent({ type: "error", data: { reason: "heartbeat_timeout" } });
        }
      }, HEARTBEAT_TIMEOUT_MS);

      ws.on("message", (raw: unknown) => {
        if (closed) return;
        let msg: WsPayload;
        try {
          msg =
            typeof raw === "string"
              ? (JSON.parse(raw) as WsPayload)
              : (raw as WsPayload);
        } catch {
          return; // 非法帧不是心跳证据，也不判死——下一帧再说
        }
        const kind = classifyMessage(msg);
        if (kind === null) return;
        beat();
        onEvent({ type: kind, data: msg.data ?? msg });
        if (kind === "done" || kind === "error") {
          closed = true;
          clearInterval(timer);
          try {
            ws.close();
          } catch {
            // 终态后关闭失败可忽略
          }
        }
      });
      ws.on("error", () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        onEvent({ type: "error", data: { reason: "ws_error" } });
      });
      ws.on("close", () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        onEvent({ type: "error", data: { reason: "ws_closed" } });
      });

      // 提交过后的任务才开始 watch——首帧事件到来前，lastBeat 已在 watch 时刻起算，
      // HEARTBEAT_TIMEOUT_MS 内必须有一条 ws 事件（progress/executing）否则判死。
      return () => {
        closed = true;
        clearInterval(timer);
        try {
          ws.close();
        } catch {
          // 幂等 unwatch
        }
      };
    },

    async free(): Promise<void> {
      await post("/free", { unload_models: true, free_memory: true });
    },

    async deleteFromQueue(promptId: string): Promise<void> {
      await post("/queue", { delete: [promptId] });
    },

    async interrupt(): Promise<void> {
      await post("/interrupt");
    },
  };
}
