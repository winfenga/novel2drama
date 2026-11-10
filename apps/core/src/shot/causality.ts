/**
 * M6-7 · 因果网络审计。
 *
 * 依据：m267-spec §2.4（结构冻结）、storyboard-rules §8.2（L552-573）、
 * core-principles §5.4.3：风险分查单点，因果审计查点与点之间的链——
 * **两套东西，不能合并**（execution-plan L244）。
 *
 * 本轮为规则校验器：断链 = 边引用的节点不存在 / 动作无结果边 /
 * 间接因果的中转节点缺失；反事实冗余 = 动作节点无任何出边（去掉它镜头仍成立）。
 */

export interface CausalNode {
  id: string;
  kind: "action" | "target" | "state" | "expression" | "sound" | "asset";
  label: string;
}

export type CausalRelation =
  | "direct"
  | "indirect"
  | "correlational"
  | "confounder"
  | "speculative"
  | "unverified";

export interface CausalEdge {
  from: string;
  to: string;
  mechanism: string;
  relation: CausalRelation;
  strength?: number;
  atSec?: number;
  evidence: string;
}

export interface CausalAuditResult {
  nodes: CausalNode[];
  edges: CausalEdge[];
  /** 断链：边端点缺失 / 链条中断 */
  brokenChains: string[];
  /** 反事实冗余：去掉该动作镜头仍成立 → 建议删除 */
  redundantActions: string[];
}

/** 待验证假设/推测性联系允许低置信，但不允许无证据边 */
function hasEvidence(e: CausalEdge): boolean {
  return e.evidence.trim().length > 0;
}

/**
 * 因果审计（纯规则版）：
 * 1. 边的端点必须指向存在的节点，否则断链
 * 2. 每个动作节点必须有至少一条出边（动作→结果），否则该动作无可见结果——断链
 * 3. indirect 边的 from 必须同时有来自动作节点的入边（中间节点成立），否则链条中断
 * 4. 反事实：动作节点没有任何出边（结果与它无关）→ 冗余，标记建议删除
 * 5. 所有边必须有证据；无证据边计断链
 */
export function auditCausality(shot: unknown, prevEndState?: unknown): CausalAuditResult {
  const s = shot as { nodes?: CausalNode[]; edges?: CausalEdge[] } | null | undefined;
  const nodes = Array.isArray(s?.nodes) ? s!.nodes! : [];
  const edges = Array.isArray(s?.edges) ? s!.edges! : [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const actionIds = new Set(nodes.filter((n) => n.kind === "action").map((n) => n.id));

  const brokenChains: string[] = [];
  const redundantActions: string[] = [];

  for (const e of edges) {
    if (!nodeIds.has(e.from)) {
      brokenChains.push(`边 ${e.from}→${e.to} 的起点节点不存在`);
      continue;
    }
    if (!nodeIds.has(e.to)) {
      brokenChains.push(`边 ${e.from}→${e.to} 的目标节点不存在`);
      continue;
    }
    if (!hasEvidence(e)) {
      brokenChains.push(`边 ${e.from}→${e.to} 缺证据（机制: ${e.mechanism || "无"}）`);
    }
    if (e.relation === "indirect") {
      // 中间节点必须有来自动作的入边，链条才成立
      const hasUpstream = edges.some((u) => u.to === e.from && actionIds.has(u.from));
      if (!hasUpstream) {
        brokenChains.push(`间接因果 ${e.from}→${e.to} 的中转节点 ${e.from} 缺上游动作输入`);
      }
    }
  }

  for (const id of actionIds) {
    const outEdges = edges.filter((e) => e.from === id);
    if (outEdges.length === 0) {
      // 动作无任何可见结果 → 断链
      brokenChains.push(`动作 ${id} 无结果出边（结果不可见）`);
      // 反事实检验：该动作对镜头无任何结果贡献 → 冗余
      redundantActions.push(id);
    }
  }

  // prevEndState：上一镜结束状态重建校验（事实层面衔接，storyboard-rules §六 L361）
  if (prevEndState !== undefined) {
    const prev = prevEndState as { nodeIds?: string[] } | null | undefined;
    if (Array.isArray(prev?.nodeIds)) {
      for (const id of prev!.nodeIds!) {
        if (!nodeIds.has(id)) {
          brokenChains.push(`上一镜结束状态节点 ${id} 未在本镜节点中衔接`);
        }
      }
    }
  }

  return { nodes, edges, brokenChains, redundantActions };
}
