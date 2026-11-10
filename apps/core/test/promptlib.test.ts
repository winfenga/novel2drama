/**
 * M3-7/M3-8 收尾测试：TK 分段注入映射 + 用户覆盖三层 + 拼装集成 + tk.md 锚点完整性。
 *
 * 依据：docs/m35-spec.md §2.6/§2.7/§3（不静默降级总红线）；docs/decision-log.md §十八/§十九。
 * 拼装集成用真实 prompts/ 内容（内置根），非临时目录——M3-7 的交付就是「真内容能被 assembleSkill 拼对」。
 * 纪律：禁 any / @ts-ignore / 吞异常；不用 toBeTruthy 掩盖失败细节。
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { DramaError } from "@text2drama/shared";
import { MAX_SEGMENTS_PER_CALL, tkSegmentsFor, type TkSceneType } from "../src/promptlib/retrieval.js";
import { loadPromptFile, resolvePromptFile } from "../src/promptlib/overrides.js";
import { assembleSkill } from "../src/compliance/assembleSkill.js";

/** 内置 prompts/ 根（测试文件位于 apps/core/test/，上溯三级到仓库根） */
const PROMPTS_DIR = fileURLToPath(new URL("../../../prompts", import.meta.url));

describe("tkSegmentsFor · 三阶段注入映射（decision-log §十九）", () => {
  it("draft → 只给流程骨架 [S1]；polish → [S2,S5]", () => {
    expect(tkSegmentsFor("draft")).toEqual(["S1"]);
    expect(tkSegmentsFor("polish")).toEqual(["S2", "S5"]);
  });

  it("fill 按场景类型裁剪：C1/C2/纯 A → [S1,S3]；含 B → [S1,S4]", () => {
    // C 类不含振动器档位段（S4-vibe 排除）
    expect(tkSegmentsFor("fill", ["C1"])).toEqual(["S1", "S3"]);
    expect(tkSegmentsFor("fill", ["C2"])).toEqual(["S1", "S3"]);
    expect(tkSegmentsFor("fill", ["A", "C1"])).toEqual(["S1", "S3"]);
    // 纯 A 类无快感符号段
    expect(tkSegmentsFor("fill", ["A"])).toEqual(["S1", "S3"]);
    // B 类在场景里 → 词库层注入
    expect(tkSegmentsFor("fill", ["B"])).toEqual(["S1", "S4"]);
    expect(tkSegmentsFor("fill", ["A", "B"])).toEqual(["S1", "S4"]);
  });

  it("返回长度恒 ≤ 2（软上限）：16 个场景子集 × 三阶段", () => {
    const types = ["A", "B", "C1", "C2"] as const;
    for (let mask = 0; mask < 16; mask++) {
      const subset: TkSceneType[] = types.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const stage of ["draft", "fill", "polish"] as const) {
        expect(tkSegmentsFor(stage, subset).length).toBeLessThanOrEqual(MAX_SEGMENTS_PER_CALL);
      }
    }
  });
});

describe("resolvePromptFile · 覆盖三层优先级（M3-8）", () => {
  const dirs: string[] = [];

  function tmpRoot(): string {
    const d = mkdtempSync(join(tmpdir(), "t2d-overrides-"));
    dirs.push(d);
    return d;
  }

  function seed(root: string, rel: string, content: string): void {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("三层同名文件 → 项目级赢（roots[0] 优先）", () => {
    const r1 = tmpRoot();
    const r2 = tmpRoot();
    const r3 = tmpRoot();
    seed(r1, "base.md", "BASE-项目");
    seed(r2, "base.md", "BASE-全局");
    seed(r3, "base.md", "BASE-内置");
    // 路径命中项目级，读到的内容也是项目级版本
    expect(resolvePromptFile("base.md", [r1, r2, r3])).toBe(join(r1, "base.md"));
    expect(loadPromptFile("base.md", [r1, r2, r3])).toBe("BASE-项目");
  });

  it("只有内置层有 → 返回内置路径（兜底回退）", () => {
    const r1 = tmpRoot();
    const r2 = tmpRoot();
    const r3 = tmpRoot();
    seed(r3, "shells/three-field.md", "SHELL3-内置");
    expect(resolvePromptFile("shells/three-field.md", [r1, r2, r3])).toBe(
      join(r3, "shells", "three-field.md"),
    );
  });

  it("所有层都不存在 → 抛 DramaError invalid_param（不静默降级）", () => {
    const r1 = tmpRoot();
    const r2 = tmpRoot();
    const r3 = tmpRoot();
    try {
      resolvePromptFile("missing.md", [r1, r2, r3]);
      throw new Error("应当抛错却没抛（不静默降级总红线）");
    } catch (e) {
      if (!(e instanceof DramaError)) throw e;
      expect(e.code).toBe("invalid_param");
      expect(e.message).toContain("不存在");
    }
  });
});

describe("assembleSkill · 真实 prompts/ 内容拼装集成（M3-7 交付）", () => {
  it("nsfw + six-section：三段分隔、介质锁定在 L0-L5 表之前、L4 裁决后口径", () => {
    const out = assembleSkill({ mode: "nsfw", shell: "six-section", roots: [PROMPTS_DIR] });
    // base + shell + policy 三段，分隔符 "\n\n---\n\n" 恰好两个
    expect(out.split("\n\n---\n\n")).toHaveLength(3);
    // 介质锁定条款必须在改动条款（L0-L5 档位表）之前（nsfw-design §七硬约束）。
    // 注意：不能 indexOf("L0")——policy-nsfw.md 文件头「依据」引用里就有 "L0-L5 修订口径"，
    // 会先于 §0 介质锁定出现造成误判；锚定档位表标题 "## 1. L0"（不依赖连字符变体）才准。
    expect(out).toContain("介质锁定");
    expect(out.indexOf("介质锁定")).toBeLessThan(out.indexOf("## 1. L0"));
    // L4 文案是裁决后口径（m35-spec §2.4/§4-F3）
    expect(out).toContain("可见范围由用户在使用时决定");
  });
});

describe("tk.md · 分段锚点完整性（S3 六段 + S4 三段，顺序正确）", () => {
  const ANCHORS = [
    "<!-- tk-segment:S3-core -->",
    "<!-- tk-segment:S3-laughter -->",
    "<!-- tk-segment:S3-symbols -->",
    "<!-- tk-segment:S3-c-tolerance -->",
    "<!-- tk-segment:S3-gag-sens -->",
    "<!-- tk-segment:S3-rules -->",
    "<!-- tk-segment:S4-parts -->",
    "<!-- tk-segment:S4-vibe -->",
    "<!-- tk-segment:S4-mix -->",
  ];

  it("9 个锚点齐全且按 S3→S4 顺序出现", () => {
    const text = readFileSync(join(PROMPTS_DIR, "themes", "tk.md"), "utf8");
    const positions = ANCHORS.map((anchor) => text.indexOf(anchor));
    // 全部存在（indexOf 不为 -1）
    expect(positions).not.toContain(-1);
    // 顺序正确：位置随数组下标严格递增（无重复锚点）
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
