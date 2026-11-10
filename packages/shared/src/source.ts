/**
 * 审计来源枚举 —— `mcp` / `api` / `gui` 三值。
 * 依据：`docs/m0-spec.md` §5.3、§9 漂移 D8。
 */

export const AUDIT_SOURCES = ["mcp", "api", "gui"] as const;

export type AuditSource = (typeof AUDIT_SOURCES)[number];

export function isAuditSource(v: unknown): v is AuditSource {
  return typeof v === "string" && (AUDIT_SOURCES as readonly string[]).includes(v);
}
