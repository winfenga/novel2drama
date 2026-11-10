/**
 * M6-8 · 级联重算触发器。
 *
 * 依据：m267-spec §2.5、core-principles §5.4.4（L313-320 映射表逐条）：
 * | 改了 | 必须重跑的检查 |
 * | 镜头时长 D | ⑥ 时间码、⑧ 动作槽、⑨ 台词字数、⑩ 密度、⑫ 锚点 |
 * | 台词文本 | ⑨ 字数、⑬ 资产引用；配音作废需重跑 ASR |
 * | 资产编号 | ⑬ 编号、⑲ 风格一致性；所有引用该资产的提示词 |
 * | 人物设定 | ③ 主体、④ 状态变体、⑲ 风格；该角色全部镜头 |
 *
 * spec §2.5 冻结映射：duration → [6,8,9,10,12]；dialogue → [9,13] + audioStale=true；
 * asset → [13,19]；character → [3,4,19]。
 *
 * 注：duration 的 ⑫（状态变化缺起止锚点）在 core-principles 表里有，
 * spec 冻结映射也含 12，两者一致；⑩「密度」覆盖运镜/表情。
 */

export type ChangeKind = "duration" | "dialogue" | "asset" | "character";

export interface AffectedChecks {
  riskItems: number[];
  rerunCausality: boolean;
  audioStale: boolean;
}

const MAPPING: Record<ChangeKind, AffectedChecks> = {
  duration: { riskItems: [6, 8, 9, 10, 12], rerunCausality: true, audioStale: false },
  dialogue: { riskItems: [9, 13], rerunCausality: true, audioStale: true },
  asset: { riskItems: [13, 19], rerunCausality: false, audioStale: false },
  character: { riskItems: [3, 4, 19], rerunCausality: false, audioStale: false },
};

/**
 * 改什么必须重跑什么——返回受影响的风险项编号列表 + 是否重跑因果审计 + 是否置 audioStale。
 * duration / dialogue 改动会改变镜头内容结构 → 重跑因果审计；
 * asset / character 改动是引用层 → 不触发因果审计重跑，但触发引用提示词重算（调用方处理）。
 */
export function affectedChecks(kind: ChangeKind): AffectedChecks {
  const m = MAPPING[kind];
  return {
    riskItems: [...m.riskItems],
    rerunCausality: m.rerunCausality,
    audioStale: m.audioStale,
  };
}
