/**
 * M0-5 · 回声工具
 *
 * 依据 `docs/m0-spec.md` §5.8，逐字照抄：M0 联调用，原样返回输入 + 服务端时间 + pid。
 * `idempotent: true` —— 同一个 requestId 重复调只执行一次 handler，用来验证 M0-7 的幂等链路。
 */
import { z } from "zod";
import { defineTool } from "./registry.js";

export const echoTool = defineTool({
  name: "echo",
  description: "回声工具，M0 联调用。原样返回输入，附带服务端时间与 pid。",
  input: z.object({ text: z.string().optional() }).default({}),
  idempotent: true,
  handler: async (input, ctx) => ({
    echo: input.text ?? "",
    source: ctx.source,
    requestId: ctx.requestId,
    serverTime: new Date().toISOString(),
    pid: process.pid,
  }),
});
