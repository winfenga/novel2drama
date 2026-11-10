import { describe, it, expect } from "vitest";
import { auditCausality, type CausalNode, type CausalEdge } from "./causality.js";

const nodes: CausalNode[] = [
  { id: "a1", kind: "action", label: "挥拳" },
  { id: "a2", kind: "action", label: "转身" },
  { id: "t1", kind: "target", label: "陈默" },
  { id: "s1", kind: "state", label: "倒地" },
  { id: "e1", kind: "expression", label: "怒目" },
  { id: "snd1", kind: "sound", label: "碰撞声" },
  { id: "as1", kind: "asset", label: "PR-01" },
];

const edges: CausalEdge[] = [
  { from: "a1", to: "t1", mechanism: "拳击冲击", relation: "direct", atSec: 2, evidence: "原文第3段" },
  { from: "a1", to: "s1", mechanism: "冲击→失衡", relation: "direct", atSec: 2.5, evidence: "原文第3段" },
  { from: "s1", to: "snd1", mechanism: "失衡倒地发声", relation: "indirect", evidence: "原文第3段" },
  { from: "a2", to: "e1", mechanism: "情绪外显", relation: "direct", evidence: "原文第4段" },
];

describe("auditCausality", () => {
  it("完整链 → 无断链无冗余", () => {
    const r = auditCausality({ nodes, edges });
    expect(r.brokenChains).toEqual([]);
    expect(r.redundantActions).toEqual([]);
  });

  it("断链：边目标节点不存在 → brokenChains 非空", () => {
    const badEdges: CausalEdge[] = [
      { from: "a1", to: "ghost", mechanism: "x", relation: "direct", evidence: "e" },
    ];
    const r = auditCausality({ nodes, edges: badEdges });
    expect(r.brokenChains.length).toBeGreaterThan(0);
    expect(r.brokenChains[0]).toContain("目标节点不存在");
  });

  it("断链：动作无任何出边既记断链也记冗余（反事实）", () => {
    const r = auditCausality({ nodes, edges: [edges[0]!] }); // a2 没有出边
    expect(r.brokenChains.some((b) => b.includes("a2"))).toBe(true);
    expect(r.redundantActions).toContain("a2");
  });

  it("断链：indirect 边中转节点缺上游动作输入", () => {
    const badEdges: CausalEdge[] = [
      { from: "s1", to: "t1", mechanism: "x", relation: "indirect", evidence: "e" },
    ];
    const r = auditCausality({ nodes, edges: badEdges });
    expect(r.brokenChains.some((b) => b.includes("中转节点"))).toBe(true);
  });

  it("无证据边 → 断链", () => {
    const badEdges: CausalEdge[] = [
      { from: "a1", to: "t1", mechanism: "x", relation: "direct", evidence: "  " },
    ];
    const r = auditCausality({ nodes, edges: badEdges });
    expect(r.brokenChains.some((b) => b.includes("缺证据"))).toBe(true);
  });

  it("冗余动作：无出边的动作 → redundantActions 非空（反事实）", () => {
    const redundantNodes: CausalNode[] = [
      ...nodes,
      { id: "a3", kind: "action", label: "整理衣角" },
    ];
    const r = auditCausality({ nodes: redundantNodes, edges });
    expect(r.redundantActions).toEqual(["a3"]);
  });

  it("上一镜结束状态未衔接 → 断链（prevEndState）", () => {
    const r = auditCausality({ nodes, edges }, { nodeIds: ["s1", "s2_missing"] });
    expect(r.brokenChains.some((b) => b.includes("s2_missing"))).toBe(true);
    expect(r.brokenChains.some((b) => b.includes("未在本镜节点中衔接"))).toBe(true);
  });

  it("六种关系类型都被接受（类型层面）", () => {
    const rels = ["direct", "indirect", "correlational", "confounder", "speculative", "unverified"] as const;
    const rEdges: CausalEdge[] = rels.map((relation, i) => ({
      from: "a1",
      to: nodes[(i % (nodes.length - 1)) + 1]!.id,
      mechanism: "m",
      relation,
      evidence: "e",
    }));
    // a1 有出边，其余动作 a2 无出边会触发一条断链，但边本身合法
    const r = auditCausality({ nodes, edges: rEdges });
    expect(r.edges).toHaveLength(6);
  });

  it("非法输入不抛异常、返回空结构（不吞异常：入参形状错误是调用方契约问题，此处按空审计处理）", () => {
    const r = auditCausality(null);
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.brokenChains).toEqual([]);
    expect(r.redundantActions).toEqual([]);
  });
});
