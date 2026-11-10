/**
 * M5-1 · 后端选择 —— pickBackend。
 *
 * 冻结依据：`docs/m35-spec.md` §1.2（签名一字不改）、`docs/architecture.md` L628-655（判定顺序逐行照抄）。
 *
 * 两码语义必须分开（M2 的 gate.ts 已依赖）：
 * - `llm_no_backend` (400)：一个启用的后端都没有
 * - `llm_no_role`   (400)：有启用的后端，但该角色没人干，message 列出各后端能干的活
 *
 * 红线：抛错直接上抛，不做任何 template / 本地兜底降级（execution-plan §8.2）。
 */
import { DramaError } from "@text2drama/shared";

import type { LlmBackend, Role } from "../config/types.js";

/** M5 语义下的后端 = config 冻结的 LlmBackend（单一来源，不另造类型） */
export type Backend = LlmBackend;
export type { Role };

export interface PickBackendConfig {
  llmBackends: Backend[];
  roleRouting: Partial<Record<Role, string>>;
}

/**
 * 把 unknown 的配置收窄成 pickBackend 需要的形状（llmChat / connectivity 的 cfg: unknown 入口用）。
 * 不合法显式抛 `invalid_param`，绝不猜。
 */
export function expectPickConfig(cfg: unknown): PickBackendConfig {
  if (typeof cfg !== "object" || cfg === null) {
    throw new DramaError("invalid_param", {
      message: "LLM 配置不是对象（缺 llmBackends/roleRouting）",
    });
  }
  const c = cfg as { llmBackends?: unknown; roleRouting?: unknown };
  if (!Array.isArray(c.llmBackends) || typeof c.roleRouting !== "object" || c.roleRouting === null) {
    throw new DramaError("invalid_param", {
      message: "LLM 配置缺少 llmBackends 数组或 roleRouting 对象",
    });
  }
  return cfg as PickBackendConfig;
}

/**
 * pickBackend 判定顺序（architecture L628-655，一字不改）：
 * ① 无任何 enabled 后端 → DramaError "llm_no_backend" (400)
 * ② roleRouting 显式路由命中 → 用它
 * ③ 路由没配/指向无效 → 按 priority 升序取第一个 roles 含该角色的
 * ④ 一个都没有 → DramaError "llm_no_role" (400)，message 列出各后端能干的活
 */
export function pickBackend(cfg: PickBackendConfig, role: Role): Backend {
  // 先判「有没有启用的后端」——这跟「该角色没后端」是两回事，错误提示不一样
  const enabled = cfg.llmBackends.filter((b) => b.enabled);
  if (enabled.length === 0) {
    throw new DramaError("llm_no_backend", {
      message: "没有任何启用的 LLM 后端，请先在设置页配置",
    });
  }

  // 优先显式路由
  const routed = cfg.roleRouting[role];
  if (routed !== undefined) {
    const b = enabled.find((x) => x.id === routed);
    if (b !== undefined && b.roles.includes(role)) return b;
    // 路由指向了不存在的/不干这活的后端 → 视同没配，走 ③ 兜底
  }

  // 退而求其次：按 priority 升序取第一个能干这活的
  const candidates = enabled
    .filter((b) => b.roles.includes(role))
    .sort((a, b) => a.priority - b.priority);
  if (candidates.length === 0) {
    throw new DramaError("llm_no_role", {
      message:
        `角色 ${role} 没有可用后端。已启用的后端能干的活：` +
        enabled.map((b) => `${b.id}(${b.roles.join(",")})`).join(" / "),
    });
  }
  return candidates[0] as Backend;
}
