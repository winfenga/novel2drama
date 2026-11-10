/**
 * M2-3 · 策略拼装接口（只实现机制：读文件、按序拼、覆盖查找）。
 *
 * 依据：docs/m267-spec.md §1.4 + E1（不保留 template 引擎，不接受 engine 参数）。
 * 拼装顺序（architecture L778-792，不可乱序）：
 *   base.md → shells/{shell}.md → policy-{mode}.md → themes/{theme}.md（可选）
 * 分隔符 "\n\n---\n\n"（M3-7 沿用）。
 * 覆盖查找顺序：projects/<id>/prompts/ → ~/.text2drama/prompts/ → 内置 prompts/（M3-8 同规则）——
 *   roots 数组从高到低优先级排列，先命中先用，后面的是回退。
 *
 * ⚠️ 占位文件内容是空壳——M3 才填真内容。本模块不缓存、不发请求。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PromptMode = "sfw" | "nsfw";

/** 三个 root 各放同名不同内容文件验证优先级；roots[0] 最高。 */
const SEPARATOR = "\n\n---\n\n";

const SEGMENTS = {
  base: "base.md",
  policySfw: "policy-sfw.md",
  policyNsfw: "policy-nsfw.md",
} as const;

function shellFile(shell: "six-section" | "three-field"): string {
  return join("shells", `${shell}.md`);
}

function themeFile(theme: string): string {
  return join("themes", `${theme}.md`);
}

/**
 * 在 roots（优先级从高到低）里找 relPath，返回第一个存在且可读的内容。
 * 全部找不到 → 抛错（不静默跳过：缺关键段说明 prompts 目录坏了，拼出来的 skill 是错的）。
 */
function readSegment(roots: string[], relPath: string, segmentName: string): string {
  for (const root of roots) {
    try {
      return readFileSync(join(root, relPath), "utf8");
    } catch (err) {
      // ENOENT = 该 root 没有覆盖，试下一个 root；其他错误（权限/编码）显式抛。
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      throw err;
    }
  }
  throw new Error(`assembleSkill: 找不到必需段 ${segmentName}（${relPath}），查找根：${roots.join(" → ")}`);
}

/**
 * 拼装 skill 文本。顺序：base → shell → policy → theme（可选），"\n\n---\n\n" 分隔。
 * 覆盖查找顺序：roots 从高到低；未传 roots 时调用方必须自己给内置 prompts/ 路径
 * （M2 阶段由调用方决定内置根——spec 只冻结机制，路径接线在 M3/M5）。
 */
export function assembleSkill(opts: {
  mode: PromptMode;
  shell: "six-section" | "three-field";
  theme?: string;
  /** 覆盖查找根目录；测试注入临时目录 */
  roots?: string[];
}): string {
  const roots = opts.roots ?? [];
  if (roots.length === 0) {
    throw new Error("assembleSkill: roots 不能为空——至少要有一个查找根（内置 prompts/ 目录）");
  }

  const segments: string[] = [
    readSegment(roots, SEGMENTS.base, "base"),
    readSegment(roots, shellFile(opts.shell), `shell:${opts.shell}`),
    readSegment(
      roots,
      opts.mode === "sfw" ? SEGMENTS.policySfw : SEGMENTS.policyNsfw,
      `policy-${opts.mode}`,
    ),
  ];
  if (opts.theme !== undefined) {
    segments.push(readSegment(roots, themeFile(opts.theme), `theme:${opts.theme}`));
  }

  return segments.join(SEPARATOR);
}
