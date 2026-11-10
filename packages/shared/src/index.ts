/**
 * `@text2drama/shared` —— 三方（core / mcp / web）共用地基。
 *
 * ⚠️ 本包在 M0-2 一次建完，之后**任何人不得再改**（见 `docs/m0-spec.md` §2）。
 *    改一处全崩；有异议记 `docs/worklog/M00.md`。
 *
 * 采用「源码直出」模式：`main` / `types` / `exports` 全指 `./src/index.ts`，
 * M0 不引入构建步骤，tsc 与 tsx 都直接吃 TS 源码。
 */

export {
  ERROR_CODES,
  DramaError,
  isDramaError,
  toErrorBody,
} from "./errors.js";
export type { ErrorCode, ErrorMeta } from "./errors.js";

export { ok, err } from "./envelope.js";
export type { Envelope, OkEnvelope, ErrEnvelope } from "./envelope.js";

export { AUDIT_SOURCES, isAuditSource } from "./source.js";
export type { AuditSource } from "./source.js";

// ── M1-8 收口：schemas 全量 re-export（m1-spec §4.1；仅末尾追加，不动 M0 冻结区）──

export * from "./schemas/enums.js";
export * from "./schemas/dialogue.js";
export * from "./schemas/character.js";
export * from "./schemas/project.js";
export * from "./schemas/prompt.js";
export * from "./schemas/nsfw.js";
export * from "./schemas/shot.js";
export * from "./schemas/asset.js";

// ── M3-6：promptLibrary（m35-spec §2.1 授权的唯一 shared 追加；末尾追加，不动上方 M0/M1 冻结区）──

export * from "./promptLibrary/index.js";
