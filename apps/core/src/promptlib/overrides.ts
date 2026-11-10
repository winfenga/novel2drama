/**
 * M3-8 · 用户覆盖三层查找（architecture §5.3.5）。
 *
 * 查找顺序：项目级 → 用户全局 → 内置。同名文件前者覆盖后者。
 * 与 assembleSkill（compliance/assembleSkill.ts）的 roots 参数同一约定：
 * roots[0] = 项目级，roots[1] = 全局，roots[2] = 内置（内置是唯一必须存在的根）。
 *
 * 总红线（m35-spec）：找不到文件**必须抛错**，不许返回占位文本或默认内容。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DramaError } from "@text2drama/shared";

/**
 * 按覆盖顺序解析提示词文件的绝对路径。
 *
 * @param name   相对 prompts/ 的文件名（如 "base.md"、"shells/six-section.md"）
 * @param roots  覆盖查找根目录列表（[项目级, 全局, 内置]）；最后一个视为内置根
 * @returns 第一个命中的绝对路径
 * @throws DramaError("invalid_param") 当所有根都不存在该文件时（含内置根缺失 = 部署损坏）
 */
export function resolvePromptFile(name: string, roots: readonly string[]): string {
  for (const root of roots) {
    const candidate = join(root, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new DramaError("invalid_param", {
    message: `提示词文件 ${name} 在任何覆盖层（项目级/全局/内置）都不存在`,
    hint: `查找根：${roots.join(" → ")}`,
  });
}

/**
 * 读取提示词文件内容（覆盖三层顺序）。
 * 找到即读；读失败（权限等 IO 错）原样上抛——不静默降级。
 */
export function loadPromptFile(name: string, roots: readonly string[]): string {
  const path = resolvePromptFile(name, roots);
  // 同步读：提示词文件小（<100KB），拼装路径是同步管线，不引入 async
  return readFileSync(path, "utf-8");
}
