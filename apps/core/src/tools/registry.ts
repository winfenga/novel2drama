/**
 * M0-5 · 工具注册表
 *
 * 依据 `docs/m0-spec.md` §5.6（冻结签名）。
 *
 * `ToolDef<I, O>` 是泛型可协变传参的，但 `strictFunctionTypes` 下 `handler` 的参数是
 * 逆变的：`(input: I) => ...` 不能直接赋给 `(input: unknown) => ...`。
 * 所以 `defineTool` 里非要一次断言不可——全项目仅此一处（见 §5.6 的说明）。
 * 故意**不**把 `AnyToolDef` 改成 `any`：`unknown` 会逼出这一处断言，
 * 而 `any` 会让整个工具链静默失型。
 */
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

export function defineTool<I, O>(def: ToolDef<I, O>): AnyToolDef {
  // 【全项目唯一允许的断言】ToolDef<I, O> → ToolDef<unknown, unknown>。
  // 理由见文件头：strictFunctionTypes 让 handler 参数逆变，不断言就没法收进
  // 同质数组。断言后 I/O 全变 unknown，dispatch 侧因此不需要第二次断言。
  return def as AnyToolDef;
}

export function createRegistry(tools: readonly AnyToolDef[]): {
  get(name: string): AnyToolDef | undefined;
  has(name: string): boolean;
  names(): string[];
} {
  const byName = new Map<string, AnyToolDef>();
  for (const tool of tools) {
    // 重名是装配期的手写错误，静默覆盖会让先注册的那个永久不可见，
    // 属于「静默降级」，直接炸出来（启动期失败，不会外泄给 HTTP 调用方）。
    if (byName.has(tool.name)) {
      throw new Error(`工具名重复注册：${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  return {
    get(name: string): AnyToolDef | undefined {
      return byName.get(name);
    },
    has(name: string): boolean {
      return byName.has(name);
    },
    /** 保持注册顺序；dispatch 的未知工具 hint 依赖这个顺序取前 10 个 */
    names(): string[] {
      return [...byName.keys()];
    },
  };
}
