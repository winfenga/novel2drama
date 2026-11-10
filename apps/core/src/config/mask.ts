/**
 * 配置脱敏 —— 对外只给 `"***"`，密钥永不出服务端。
 *
 * 冻结签名：`docs/m0-spec.md` §5.10。
 * 依据：`docs/api-contract.md` §5.3（L674-690，Key 一律 `"***"` + 补 `hasKey`）。
 *
 * ⚠️ `token` 字段**整体不返回**：它是本机所有调用方的凭据，
 *    泄漏等于把 `/api/tools` 的写权限交给任何能读 `GET /api/config` 的人。
 */
import type { DramaConfig, LlmBackend } from "./types.js";

/** 脱敏后的后端形状 */
export type MaskedBackend = Omit<LlmBackend, "apiKey"> & {
  apiKey: "***";
  /** 原 apiKey 非空即 true —— 前端据此显示「已配置 / 未配置」 */
  hasKey: boolean;
};

/** 脱敏后的配置形状（无 token） */
export type MaskedConfig = Omit<DramaConfig, "token"> & {
  llmBackends: MaskedBackend[];
};

/** 密钥在响应体中的占位符 */
export const MASKED_KEY = "***";

/**
 * 返回**全新对象**，不改入参。
 *
 * 连 `roles` 数组也一并复制：脱敏结果常被直接交给 JSON.stringify 或再修改
 * （比如 PUT 前的 diff），共享内层引用会让「脱敏视图」和「真实配置」互相污染。
 */
export function maskConfig(cfg: DramaConfig): MaskedConfig {
  const { token: _token, ...rest } = cfg;
  void _token; // 显式丢弃：token 不进脱敏结果

  return {
    ...rest,
    llmBackends: cfg.llmBackends.map((b) => {
      const { apiKey, ...others } = b;
      return {
        ...others,
        roles: [...b.roles],
        apiKey: MASKED_KEY,
        hasKey: apiKey.length > 0,
      };
    }),
    roleRouting: { ...cfg.roleRouting },
    generation: { ...cfg.generation },
  };
}
