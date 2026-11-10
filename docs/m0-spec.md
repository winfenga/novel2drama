# M0 施工契约 · 冻结版

> **本文件是 M0 期间所有子代理的唯一事实来源。**
> 动手前先读完本文件，再读自己那一节的依据行号。
> **不要自行发挥命名、路径、签名。** 有疑问就在日志里记一条 `[BLOCKED]`，等主会话裁决。

依据：`execution-plan.md` §5 的 M0 段（L135-148）、`architecture.md` L372-492 / L1912-1940、`api-contract.md` L10-86 / L620-760 / L772-785、`mcp-tools.md` L501-531。

---

## 1. 版本与工具链（已实测，不要再查）

| 项 | 值 | 说明 |
|---|---|---|
| Node | `v24.19.0` | 本机实际 |
| pnpm | `12.4.1` | 本机实际 |
| TypeScript | `5.9.3` | **不用 7.x**（Go 原生重写版，太新） |
| zod | `4.6.7` | MCP SDK 1.32.2 声明支持 `^3.25 \|\| ^4.0` |
| express | `5.3.0` | |
| @types/express | `5.0.6` | |
| @types/node | `24.19.2` | 对齐 Node 24 |
| vitest | `3.2.7` | **不用 5.x** |
| @modelcontextprotocol/sdk | `1.32.2` | |
| tsx | `4.23.15` | 跑 TS 入口，不编译 |

**M0 不装 `better-sqlite3`**（需要本地编译，M0 用不到，M1 再说）。
**M0 不建 `apps/web`**（React 是 M11 的事；M0-2 声明的 `apps/{core,mcp,web}` 中 web 部分延后，已记入 `M00.md`）。

---

## 2. 目录与文件归属（谁写哪个，不许越界）

```
text2drama/
├─ package.json                    ← A
├─ pnpm-workspace.yaml             ← A
├─ tsconfig.base.json              ← A
├─ .npmrc                          ← A
├─ apps/
│  ├─ core/
│  │  ├─ package.json              ← A
│  │  ├─ tsconfig.json             ← A
│  │  ├─ vitest.config.ts          ← E
│  │  ├─ src/
│  │  │  ├─ paths.ts               ← A
│  │  │  ├─ config/{types,load,save,mask}.ts   ← B
│  │  │  ├─ auth/{token,guard}.ts  ← B
│  │  │  ├─ tools/
│  │  │  │  ├─ registry.ts         ← C
│  │  │  │  ├─ dispatcher.ts       ← C
│  │  │  │  ├─ echo.ts             ← C
│  │  │  │  ├─ audit.ts            ← D
│  │  │  │  └─ idempotency.ts      ← D
│  │  │  ├─ routes/tools.ts        ← E
│  │  │  ├─ server.ts              ← E
│  │  │  └─ index.ts               ← E
│  │  └─ test/*.test.ts            ← E
│  └─ mcp/
│     ├─ package.json              ← A
│     ├─ tsconfig.json             ← A
│     └─ src/{index,forward}.ts    ← E
└─ packages/shared/
   ├─ package.json                 ← A
   ├─ tsconfig.json                ← A
   └─ src/{index,errors,envelope,source}.ts   ← A（全包）
```

> 归属代号：**A** = foundation（M0-2）· **B** = config-auth（M0-3/M0-4）· **C** = dispatch-core（M0-5）· **D** = audit-idem（M0-6/M0-7）· **E** = integrator+verifier（M0-8）
>
> **A 一次把 `packages/shared/` 整个建完**（含 `errors.ts` 的 37 条错误码、`envelope.ts`、`source.ts`）。
> 这样 B/C/D 三条轨道启动时**不再互相依赖**，可以真并行。
> `packages/shared/` 建完后**任何人不得再改**——它是三方共用的地基，改一处全崩。有异议记日志。

---

## 3. 命名与路径常量

| 常量 | 值 |
|---|---|
| 包作用域 | `@text2drama/shared` / `@text2drama/core` / `@text2drama/mcp` |
| 默认端口 | `8400`（`DRAMA_PORT` 覆盖） |
| 数据根目录 | `~/.text2drama`（`DRAMA_HOME` 覆盖） |
| 配置文件 | `$DRAMA_HOME/config.json`，权限 `0600` |
| 审计目录 | `$DRAMA_HOME/logs/`，文件名 `tools-YYYYMMDD.jsonl` |
| GUI dev 端口 | `3400`（仅 Origin 白名单用） |

**旧目录 `~/.novel2drama` 若存在而 `~/.text2drama` 不存在，读旧目录、写新目录**——在 `paths.ts` 里做一次 `legacyFallback`，不要搬文件。

---

## 4. TypeScript 配置（照抄，别改）

`tsconfig.base.json` 的 `compilerOptions` 固定为：

```json
{
  "target": "ES2023",
  "lib": ["ES2023"],
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "verbatimModuleSyntax": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true,
  "resolveJsonModule": true,
  "noEmit": true
}
```

- `verbatimModuleSyntax: true` → **类型导入必须写 `import type { X } from "..."`**，否则 tsc 报错。
- `noUncheckedIndexedAccess: true` → `arr[0]` 类型是 `T | undefined`，要处理。
- `NodeNext` + `"type": "module"` → **相对导入必须带 `.js` 后缀**（`import { x } from "./y.js"`）。

`packages/shared/package.json` 用「源码直出」模式，**不编译**：

```json
{
  "name": "@text2drama/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`apps/*` 依赖它时写 `"@text2drama/shared": "workspace:*"`。这样 tsc 和 tsx 都直接读源码，**M0 不引入构建步骤**。

---

## 5. 冻结接口（按这个写，签名一个字都别改）

### 5.1 `packages/shared/src/errors.ts` —— 错误码表唯一权威实现
```ts
export interface ErrorMeta { http: number; message: string }

/** 36 条来自 api-contract.md §0.3（L45-83），第 37 条 delivery_incomplete 来自 §8.5.9（L1256）*/
export const ERROR_CODES = {
  project_not_found: { http: 404, message: "项目不存在" },
  // …逐条抄全，见 §7 清单
} as const satisfies Record<string, ErrorMeta>;

export type ErrorCode = keyof typeof ERROR_CODES;

export class DramaError extends Error {
  constructor(
    code: ErrorCode,
    opts?: { message?: string; hint?: string; details?: unknown; cause?: unknown },
  );
  readonly code: ErrorCode;
  readonly http: number;
  readonly hint?: string;
  readonly details?: unknown;
}

export function isDramaError(e: unknown): e is DramaError;

/** 非 DramaError 一律折成 invalid_param(400)，但 cause 保留原始错误供日志 */
export function toErrorBody(e: unknown): {
  code: ErrorCode; message: string; hint?: string; details?: unknown;
};
```

### 5.2 `packages/shared/src/envelope.ts`

```ts
export interface OkEnvelope<T> { ok: true; data: T; meta: { requestId: string; elapsedMs: number } }
export interface ErrEnvelope { ok: false; error: { code: string; message: string; hint?: string; details?: unknown } }
export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;
export function ok<T>(data: T, meta: OkEnvelope<T>["meta"]): OkEnvelope<T>;
export function err(e: unknown): ErrEnvelope;
```

### 5.3 `packages/shared/src/source.ts`

```ts
export const AUDIT_SOURCES = ["mcp", "api", "gui"] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];
export function isAuditSource(v: unknown): v is AuditSource;
```

### 5.4 `apps/core/src/tools/audit.ts`

```ts
import type { AuditSource } from "@text2drama/shared";

export interface AuditEntry {
  ts: string;            // ISO8601 UTC
  name: string;
  requestId: string;
  source: AuditSource;
  inputHash: string;     // sha256(input JSON) 前 16 位 hex
  ok: boolean;
  code: string | null;
  elapsedMs: number;
}

export interface AuditLogger {
  /** 追加一行 jsonl；目录不存在自动建；失败不抛（审计不能拖垮业务），但要 console.error */
  write(entry: AuditEntry): void;
  read(opts?: { from?: string; to?: string; name?: string }): AuditEntry[];
  /** 30 天前的 tools-*.jsonl 删掉 */
  prune(olderThanDays?: number): number;
}

export function createAuditLogger(opts: { dir: string; now?: () => Date }): AuditLogger;
export function hashInput(input: unknown): string;
```

### 5.5 `apps/core/src/tools/idempotency.ts`

```ts
export interface IdempotencyOptions { ttlMs?: number; now?: () => number; maxEntries?: number }

/**
 * key 为空 → 直接执行，不缓存。
 * 命中未过期 → 返回**同一份 result 引用**（不深拷贝）。
 * 只缓存成功结果；抛错的不缓存。
 * maxEntries 默认 1000，超了按 at 升序淘汰最旧的。
 */
export function withIdempotency<T>(
  key: string | undefined, fn: () => Promise<T>, opts?: IdempotencyOptions,
): Promise<T>;

export function resetIdempotencyCache(): void;  // 测试用
```

### 5.6 `apps/core/src/tools/registry.ts`

```ts
import type { ZodType } from "zod";
import type { AuditSource } from "@text2drama/shared";

export interface ToolContext {
  source: AuditSource;
  requestId: string;
  signal?: AbortSignal;
}

export interface ToolDef<I, O> {
  name: string;
  description: string;
  input: ZodType<I>;
  /** true = 该工具的写操作接受 requestId 幂等去重 */
  idempotent?: boolean;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export type AnyToolDef = ToolDef<unknown, unknown>;
export type Registry = ReturnType<typeof createRegistry>;

export function defineTool<I, O>(def: ToolDef<I, O>): AnyToolDef;
export function createRegistry(tools: readonly AnyToolDef[]): {
  get(name: string): AnyToolDef | undefined;
  has(name: string): boolean;
  names(): string[];
};
```

> **`ToolDef` 泛型必须可协变传参**：`defineTool` 内部对 `handler` 做一次 `as AnyToolDef` 断言（唯一允许的断言）。
> `dispatch` 拿到的 `input` 是 `unknown`，调 `tool.input.safeParse` 拿到 `I` 后传 `handler`，此时也需要一次断言（同样只此一处，注释说明）。
> **不要为了让类型干净而把 `AnyToolDef` 改成 `any`**——`unknown` 能逼你在两处写断言，`any` 会让整个工具链静默失型。

### 5.7 `apps/core/src/tools/dispatcher.ts`

```ts
import type { Envelope, AuditSource } from "@text2drama/shared";
import type { AuditLogger } from "./audit.js";

export interface DispatchRequest {
  name: unknown; input: unknown; requestId?: unknown; source: AuditSource;
}

export interface DispatchResult { http: number; body: Envelope<unknown> }

export interface DispatchDeps {
  registry: ReturnType<typeof createRegistry>;
  audit: AuditLogger;
  now?: () => number;
}

export async function dispatch(deps: DispatchDeps, req: DispatchRequest): Promise<DispatchResult>;
```

**`dispatch` 的固定行为序列**（顺序不许变）：

1. `name` 非字符串 → `invalid_param` / 400，**仍写审计**（`name` 记为 `String(req.name)`）
2. 工具不存在 → `invalid_param` / 400，message 写明「未知工具 X」，`hint` 给 `registry.names()` 前 10 个
3. `requestId` 非字符串则视为 `undefined`
4. `input` 用 `tool.input.safeParse` 校验；失败 → `invalid_param` / 400，`details` 放 `z.treeifyError(result.error)`（zod 4 的 API）
5. `tool.idempotent === true` 且 `requestId` 存在 → 走 `withIdempotency`
6. 成功 → `{ ok: true, data, meta:{ requestId, elapsedMs } }`，http 200
7. 任何抛出 → `err(e)` + `e.http ?? 500`
8. **无论哪条路径，`finally` 里必须写一条审计**

`requestId` 未提供时，`meta.requestId` 用 `crypto.randomUUID()` 生成。

### 5.8 `apps/core/src/tools/echo.ts`

```ts
defineTool({
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
})
```

### 5.9 `apps/core/src/paths.ts`

```ts
export interface DramaPaths {
  home: string;
  configFile: string;        // 写路径，恒为新目录 $DRAMA_HOME
  legacyConfigFile: string;  // 只读回退路径，恒为 ~/.novel2drama/config.json，可能不存在
  logDir: string;
  dataDir: string;
}
export function resolvePaths(env?: NodeJS.ProcessEnv): DramaPaths;
```

> **v1 修正（2026-11-10，施工中发现）**：初版只有四个字段、把 legacyFallback 做进了 `configFile`。
> 那样 `saveConfig` 会把配置**写回旧目录**，与「读旧、写新」相反。
> 现在读写两条路径分开：`paths.ts` 只提供路径，**回退判断由 `loadConfig` 做**——
> `existsSync(paths.configFile)` 为假且 `existsSync(paths.legacyConfigFile)` 为真时读旧的，其余一律写新的。

### 5.10 `apps/core/src/config/*`

```ts
// types.ts
export const ROLES = ["text", "prompt", "plan"] as const;
export type Role = (typeof ROLES)[number];

export interface LlmBackend {
  id: string; label?: string; baseUrl: string; apiKey: string; model: string;
  roles: Role[]; priority: number; enabled: boolean; local?: boolean;
}
export interface GenerationConfig { resolution: string; fps: number }
export interface DramaConfig {
  version: 1;
  token: string;
  llmBackends: LlmBackend[];
  roleRouting: Partial<Record<Role, string>>;
  generation: GenerationConfig;
}

// load.ts
export function defaultConfig(): DramaConfig;              // token 用 crypto.randomBytes(18).toString("hex")
/**
 * 读顺序：paths.configFile → 不存在则 paths.legacyConfigFile → 都不存在则建默认并落盘到 paths.configFile。
 * **无论从哪读到，保存一律写 paths.configFile（新目录）。**
 */
export function loadConfig(env?: NodeJS.ProcessEnv): DramaConfig;
export function validateConfig(cfg: unknown): DramaConfig; // zod；失败抛 invalid_param

// save.ts
/** temp + fsync + rename + chmod 0600；同目录下 `.config.json.<pid>.tmp` */
export function saveConfig(cfg: DramaConfig, env?: NodeJS.ProcessEnv): void;

// mask.ts
/** 所有 apiKey → "***"，并补 hasKey: boolean；返回新对象，不改入参 */
export function maskConfig(cfg: DramaConfig): Omit<DramaConfig, "token"> & {
  llmBackends: (Omit<LlmBackend, "apiKey"> & { apiKey: "***"; hasKey: boolean })[];
};
```

### 5.11 `apps/core/src/auth/*`

```ts
// token.ts
export function timingSafeEqualStr(a: string, b: string): boolean;  // crypto.timingSafeEqual，长度不等直接 false

// guard.ts
export const ALLOWED_ORIGINS: readonly string[];  // http://127.0.0.1:3400 / http://localhost:3400 / http://127.0.0.1:8400

export interface GuardInput {
  headers: Record<string, string | string[] | undefined>;
  method: string;
}
export interface GuardResult { ok: true; source: AuditSource } | { ok: false; http: number; code: ErrorCode; message: string }
export function guard(input: GuardInput, cfg: DramaConfig): GuardResult;
```

**`guard` 判定顺序**（不许改）：

1. `Sec-Fetch-Site: cross-site` → `403 token_invalid`，message 写「跨站请求被拒绝」
2. 解析凭据：`x-drama-token` 或 `Authorization: Bearer <t>`；都没有 → `401 token_invalid`
3. 与 `cfg.token` 常量时间比较，不等 → `401 token_invalid`
4. `Origin` 存在且不在 `ALLOWED_ORIGINS` → `403 token_invalid`
5. `x-drama-source` 解析，非法值 → `400 invalid_param`；缺省 → `api`；合法 → 该值

> `Authorization: Bearer` 与 `x-drama-token` 二者等价。**API 文档 §6.2 说 `/api/tools` 只收 `x-drama-token`**，
> M0 放宽为两种都收，理由是 GUI 也要能走 `/api/tools` 并记成 `gui`。**此为已知文档漂移，已报备（见 §9）。**

### 5.12 `apps/core/src/server.ts` / `routes/tools.ts` / `index.ts`

```ts
// server.ts
export interface AppDeps { cfg: DramaConfig; log?: Pick<Console, "info" | "error" | "warn"> }
export function createApp(deps: AppDeps): import("express").Express;

// routes/tools.ts
export function toolsRouter(deps: { registry; audit; cfg }): import("express").Router;

// index.ts
export function startServer(): Promise<{ server; close(): Promise<void>; port: number }>;
```

- `POST /api/tools` body：`{ name, input, requestId?, source? }`（`source` 若给，与 header 冲突时以 `x-drama-source` 为准）
- `GET /api/ping` → `{ ok: true, data: { pong: true, version } }`，**不鉴权**（健康检查）
- 默认监听 `127.0.0.1`，**不许绑 `0.0.0.0`**
- `express.json({ limit: "8mb" })`
- 错误中间件：`toErrorBody` + `err()`

### 5.13 `apps/mcp/src/*`

```ts
// forward.ts
export interface ForwardConfig { baseUrl: string; token: string }
export async function callTool(cfg: ForwardConfig, name: string, input: unknown, requestId?: string):
  Promise<{ ok: true; result: unknown } | { ok: false; error: { code: string; message: string; hint?: string } }>;

// index.ts
export async function startMcpServer(): Promise<void>;
```

- 转发头：`x-drama-token`、`content-type: application/json`、**`x-drama-source: mcp`**
- 工具清单：M0 只有 `echo`；其余 M1 之后注册
- **MCP 层零业务**：不校验、不改写、不缓存

---

## 6. 审计写入点（唯一）

**只有 `dispatch()` 写审计。** 路由层、MCP 层、工具 handler 都不许写。

---

## 7. 错误码清单（36 + 1，逐条抄进 `ERROR_CODES`）

```
404 project_not_found      409 asset_in_use         400 llm_no_backend
404 shot_not_found         400 llm_no_role          400 llm_private_url
404 scene_not_found        502 llm_unreachable      502 llm_auth
404 asset_not_found        502 llm_model_not_found  502 llm_bad_json
429 token_budget_exceeded  409 task_busy            404 task_not_found
400 confirm_run_required   503 vram_insufficient    503 queue_full
503 comfy_offline          500 comfy_out_of_memory  500 workflow_unavailable
409 gpu_lock_held          500 video2x_failed       503 voice_offline
409 voice_not_loaded       400 voice_no_reference   200 source_video_truncated
400 unsupported_video_media 400 missing_reference_image 400 missing_reference_media
400 duplicate_frame_role   400 hybrid_needs_keyframe 400 hybrid_needs_reference
400 invalid_task_type_for_media 400 invalid_param   401 token_invalid
500 delivery_incomplete
```

- `source_video_truncated` 是**非错误标记**（http 200）：进表，但**不许当作 `DramaError` 抛出**，只作为结果字段存在。
- 中文 `message` 见 `api-contract.md` L47-83 原文，逐条照抄，别自创。

---

## 8. 质量标准（每个子代理交活前自查）

| 项 | 要求 |
|---|---|
| `pnpm exec tsc --noEmit` | 0 error（在自己包目录下跑） |
| 禁止 `any` | 除 `AnyToolDef` 那一处（已在 §5.6 说明） |
| 禁止 `@ts-ignore` | 真要压，写 `@ts-expect-error` 加原因 |
| 禁止吞异常 | `catch {}` 必须有注释说明为什么能吞；审计写入是唯一允许的 |
| 禁止静默降级 | 见 `execution-plan.md` §8.2 |
| 相对导入 | 必须带 `.js` |
| 类型导入 | 必须 `import type` |

---

## 9. 已知文档漂移（照本文件做，别回去改文档）

| # | 漂移 | 本文件裁决 |
|---|---|---|
| D8 | `API` §6.2 说 `/api/tools` 只收 `x-drama-token`，但 M0-8 要求审计有三 source | 两种凭据都收，用 `x-drama-source` 区分 |
| D9 | 主目录 `~/.novel2drama` vs 产品改名 | 新 `~/.text2drama`；旧的**只读**回退，绝不写回 |
| D10 | `M0-2` 声明含 `apps/web` | M0 不建，M11 再建 |
| D11 | 初版 `DramaPaths` 只有四字段，回退做进了 `configFile` | 加 `legacyConfigFile`，读写分离（见 §5.9 修正说明） |

---

## 10. 日志（硬要求，漏了就白干）

每人只写自己负责里程碑的日志文件：

| 归属 | 写哪个文件 |
|---|---|
| A / B / C / D | `docs/worklog/M00.md`（**追加，不覆盖**） |
| E | `docs/worklog/M00.md` |

> **⚠️ M0 全员共用一个 `M00.md`。** 追加时必须**先读全文再追加到末尾**，并且**一次写完一整条**，
> 不要分多次写中间态——避免与其他代理的追加互相覆盖。
> 若发现自己的条目被覆盖了：在末尾追加 `[CORRECTION #N] 我方 [00X] 被覆盖，重录如下`，把内容重贴一遍。
> **绝不删除或改写别人写的任何一行。**

模板见 `docs/worklog/M00.md` 末尾「条目模板」节。七个字段一个都不能空，「踩到的坑」和「关键决定」最重要。
