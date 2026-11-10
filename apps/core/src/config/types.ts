/**
 * 配置层类型 + zod schema。
 *
 * 冻结来源：`docs/m0-spec.md` §5.10（签名一个字都不能改）、`docs/api-contract.md` §5.2 / §5.3。
 * 依据：`architecture.md` L523-542（llmBackends 表 / roleRouting / priority 语义）。
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// 类型（冻结）
// ---------------------------------------------------------------------------

export const ROLES = ["text", "prompt", "plan"] as const;
export type Role = (typeof ROLES)[number];

export interface LlmBackend {
  id: string;
  label?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  roles: Role[];
  priority: number;
  enabled: boolean;
  /** 显式声明为本地后端，才允许 loopback / 私网地址（见 net.ts 的 assertBaseUrl） */
  local?: boolean;
}

export interface GenerationConfig {
  resolution: string;
  fps: number;
}

export interface DramaConfig {
  version: 1;
  token: string;
  llmBackends: LlmBackend[];
  roleRouting: Partial<Record<Role, string>>;
  generation: GenerationConfig;
}

// ---------------------------------------------------------------------------
// zod schema
// ---------------------------------------------------------------------------

const RoleSchema = z.enum(ROLES);

export const LlmBackendSchema = z.object({
  id: z.string().min(1, "id 不能为空"),
  label: z.string().optional(),
  baseUrl: z.string().min(1, "baseUrl 不能为空"),
  apiKey: z.string(),
  model: z.string().min(1, "model 不能为空"),
  roles: z.array(RoleSchema).min(1, "roles 至少给一个角色"),
  priority: z.number().int("priority 必须是整数"),
  enabled: z.boolean(),
  local: z.boolean().optional(),
});

export const GenerationConfigSchema = z.object({
  // 形如 1080x1920；具体合法性由出图侧再判，这里只挡明显写错的
  resolution: z.string().regex(/^\d+x\d+$/, "resolution 形如 1080x1920"),
  fps: z.number().int("fps 必须是整数").positive("fps 必须大于 0"),
});

export const RoleRoutingSchema = z.object({
  text: z.string().optional(),
  prompt: z.string().optional(),
  plan: z.string().optional(),
});

/**
 * 全量配置 schema。
 *
 * 标成 `z.ZodType<DramaConfig>` 是刻意的：让 tsc 校验 schema 输出与冻结接口一致，
 * 将来谁加字段忘了改另一边，这里直接编译不过。
 */
export const DramaConfigSchema: z.ZodType<DramaConfig> = z.object({
  version: z.literal(1),
  token: z.string().min(1, "token 不能为空"),
  llmBackends: z.array(LlmBackendSchema),
  roleRouting: RoleRoutingSchema,
  generation: GenerationConfigSchema,
});

/** 校验单个后端配置（PUT /api/config 用） */
export const LlmBackendsSchema = z.array(LlmBackendSchema);
