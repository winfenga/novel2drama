/**
 * M3-7 · TK 分段注入映射（decision-log §十九）。
 *
 * 段 id 与来源：
 * - S1 工作流骨架 / S2 写作规范 / S5 标点校对 / S6 素材库指南：在 novel_nsfw 流程文件，
 *   不在 themes/tk.md（主题包只承载 S3/S4）
 * - S3 拟声词规则层 / S4 场景专项词库：themes/tk.md（锚点 `<!-- tk-segment:... -->`）
 *
 * 注入规则（§十九硬规则）：
 * - draft → [S1]（只给流程骨架；S2-S4 是写作内容段，初稿用不上）
 * - fill  → 按 sceneTypes 从 S3/S4 裁剪（C 类不含振动器档位段；A 类不含 ♡/❤ 段）
 * - polish → [S2, S5]
 * - 单次附加的 TK 段 ≤ 2（软上限，本函数保证：返回数组长度恒 ≤ 2）
 *
 * 本函数只做**映射逻辑**，不读文件——段内容按返回的 id 由调用方取（S3/S4 从 tk.md
 * 锚点切，S1/S2/S5/S6 从流程文件取）。
 */

/** TK 分段 id（§十九 S1-S6；S7 使用例不入注入池） */
export type TkSegment = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

/** M13 五阶段中与提示词/润色相关的三阶段（§十九注入时机表的行） */
export type TkStage = "draft" | "fill" | "polish";

/** 场景类型（EX15 §1）：fill 阶段按此裁剪 S3/S4 内容 */
export type TkSceneType = "A" | "B" | "C1" | "C2";

const MAX_SEGMENTS_PER_CALL = 2;

/**
 * 按创作阶段与场景类型返回本次 LLM 调用应注入的 TK 段 id 列表（长度恒 ≤ 2）。
 *
 * @param stage      draft=初稿 / fill=占位符填充 / polish=润色校对
 * @param sceneTypes fill 阶段的场景类型集合（空数组 = 未判定，返回裁剪前的候选）
 */
export function tkSegmentsFor(stage: TkStage, sceneTypes: readonly TkSceneType[] = []): TkSegment[] {
  switch (stage) {
    case "draft":
      // §十九：draft 只给流程骨架段（内容段留给 fill）
      return ["S1"];

    case "fill": {
      // fill：流程段 S1 + 内容段（S3/S4 按场景裁剪）= 2 段封顶
      const hasC = sceneTypes.includes("C1") || sceneTypes.includes("C2");
      const hasA = sceneTypes.includes("A");
      const hasB = sceneTypes.includes("B");

      // S3 规则层裁剪：纯 A 类场景无 ♡/❤ 相关规则段？——S3 是规则整体，
      // 裁剪粒度在 tk.md 锚点内（S3-b-c类/S3-symbols），此处按 sceneTypes 决定要不要带上符号规则
      const wantsSymbols = hasB;
      // S4 词库层裁剪：C 类场景不含振动器档位段（tk-segment:S4-vibe 按需排除）
      const wantsVibeLib = !hasC;

      // 段 id 细分：S3 在 tk.md 内有子锚点（S3-symbols / S4-vibe），retrieval 返回主段 id，
      // 子段裁剪信息通过填充 S4/S3 的变体 id 表达（调用方按场景过滤子锚点）
      if (hasC) {
        // C 类：符号段无用（C 类禁 ♡/❤），振动器词库排除——返回 S1 + S3（core+laughter+c-tolerance）
        return ["S1", "S3"];
      }
      if (hasA && !hasB) {
        // 纯 A 类：无快感符号段，无振动器档位段
        return ["S1", "S3"];
      }
      // B 类在场景里：S3 + S4（含符号规则与振动器档位）
      void wantsSymbols;
      void wantsVibeLib;
      return ["S1", "S4"];
    }

    case "polish":
      // polish：写作规范段 + 标点校对段
      return ["S2", "S5"];

    default: {
      const exhaustive: never = stage;
      void exhaustive;
      throw new Error("unreachable");
    }
  }
}

// MAX_SEGMENTS_PER_CALL 供调用方断言用（导出常量而非魔法数）
export { MAX_SEGMENTS_PER_CALL };
