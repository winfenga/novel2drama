/**
 * M0-5 · 工具分发器
 *
 * 依据 `docs/m0-spec.md` §5.7（冻结签名）、§6（审计唯一写入点）。
 *
 * `dispatch()` 的八步行为序列是契约，**顺序不许变**：
 *   1. name 非字符串 → invalid_param / 400，仍写审计（name 记 String(req.name)）
 *   2. 工具不存在 → invalid_param / 400，hint 给 names() 前 10 个
 *   3. requestId 非字符串视为 undefined；缺省用 randomUUID()
 *   4. input 走 safeParse，失败 → invalid_param / 400，details 放 z.treeifyError()
 *   5. idempotent === true 且 requestId 存在 → withIdempotency
 *   6. 成功 → ok(data, { requestId, elapsedMs })，http 200
 *   7. 任何抛出 → err(e) + e.http ?? 500
 *   8. finally 里必写一条审计（错误路径也写）
 *
 * `elapsedMs` 只算一次：`stamp()` 做了记忆化，保证 `meta.elapsedMs` 与审计里的
 * `elapsedMs` 是**同一个数**，不在两处各调一次 `now()`。
 */
import { randomUUID } from "node:crypto";
import type { AuditSource, Envelope } from "@text2drama/shared";
import { DramaError, err, ok } from "@text2drama/shared";
import { z } from "zod";
import type { AuditLogger } from "./audit.js";
import { hashInput } from "./audit.js";
import { withIdempotency } from "./idempotency.js";
import type { ToolContext, createRegistry } from "./registry.js";

export interface DispatchRequest {
  name: unknown;
  input: unknown;
  requestId?: unknown;
  source: AuditSource;
}

export interface DispatchResult {
  http: number;
  body: Envelope<unknown>;
}

export interface DispatchDeps {
  registry: ReturnType<typeof createRegistry>;
  audit: AuditLogger;
  now?: () => number;
}

/** 未知工具提示里最多列几个 */
const HINT_LIMIT = 10;

export async function dispatch(
  deps: DispatchDeps,
  req: DispatchRequest,
): Promise<DispatchResult> {
  const now: () => number = deps.now ?? Date.now;
  const start = now();
  const source = req.source;

  // —— 步骤 3 的归一化提前到这里 ——
  // 它只是纯计算、没有错误路径、也不改变 §5.7 的判定次序：步骤 1/2 该抛的照抛。
  // 提前的原因是审计在**任何**路径下都需要一个 requestId，包括 name 非法那种。
  const providedId = typeof req.requestId === "string" ? req.requestId : undefined;
  const requestId = providedId ?? randomUUID();

  // 全请求只允许算一次耗时（记忆化）
  let elapsedMs: number | undefined;
  const stamp = (): number => {
    if (elapsedMs === undefined) elapsedMs = now() - start;
    return elapsedMs;
  };

  // 审计用：name 非法时按契约记 String(req.name)
  const auditName = typeof req.name === "string" ? req.name : String(req.name);
  let code: string | null = null;
  let succeeded = false;

  try {
    // —— 步骤 1：name 必须是字符串 ——
    if (typeof req.name !== "string") {
      throw new DramaError("invalid_param", {
        message: `工具名必须是字符串，收到 ${typeof req.name}`,
      });
    }

    // —— 步骤 2：工具必须存在 ——
    const tool = deps.registry.get(req.name);
    if (tool === undefined) {
      const known = deps.registry.names().slice(0, HINT_LIMIT);
      throw new DramaError("invalid_param", {
        message: `未知工具 ${req.name}`,
        hint: known.length > 0 ? `可用工具：${known.join("、")}` : "当前没有注册任何工具",
      });
    }

    // —— 步骤 4：入参校验（zod 4 的 treeifyError，不是 zod 3 的 format）——
    const parsed = tool.input.safeParse(req.input);
    if (!parsed.success) {
      throw new DramaError("invalid_param", {
        message: "参数校验失败",
        details: z.treeifyError(parsed.error),
      });
    }
    // 此处无需二次断言：AnyToolDef 已把 I/O 钉成 unknown，
    // parsed.data 是 unknown，handler 形参也是 unknown，直接传即可。

    // —— 步骤 5：幂等（只有声明 idempotent 且调用方真给了 requestId 才去重）——
    const ctx: ToolContext = { source, requestId };
    const run = (): Promise<unknown> => tool.handler(parsed.data, ctx);
    const data =
      tool.idempotent === true && providedId !== undefined
        ? await withIdempotency(providedId, run)
        : await run();

    // —— 步骤 6：成功 ——
    succeeded = true;
    return { http: 200, body: ok(data, { requestId, elapsedMs: stamp() }) };
  } catch (e) {
    // —— 步骤 7：任何抛出 ——
    const body = err(e);
    // code 从同一个 err() 结果里取，避免和 toErrorBody 的折叠规则各写一份、日后漂移
    code = body.error.code;
    const http = e instanceof DramaError ? e.http : 500;
    return { http, body };
  } finally {
    // —— 步骤 8：无论哪条路径都写一条审计 ——
    try {
      deps.audit.write({
        ts: new Date(now()).toISOString(),
        name: auditName,
        requestId,
        source,
        inputHash: hashInput(req.input),
        ok: succeeded,
        code: succeeded ? null : code,
        elapsedMs: stamp(),
      });
    } catch (auditErr) {
      // 审计是旁路：即使注入的 AuditLogger 自己爆了，也不能把已经算好的
      // 返回值替换成异常（那等于审计拖垮业务）。这是 §8「禁止吞异常」的
      // 唯一豁免点，console.error 留痕。
      console.error("[dispatch] audit.write threw", auditErr);
    }
  }
}
