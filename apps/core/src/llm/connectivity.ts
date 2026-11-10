/**
 * M5-5 · 后端连通性测试。
 *
 * 冻结依据：`docs/m35-spec.md` §1.2 —— GET {baseUrl}/models，能列模型即通；
 * target="*" 全测，否则只测 id 匹配的后端。
 *
 * 结果是诊断报告不是业务结果：单条后端失败记录 ok:false + detail，**不抛错**——
 * 这不是静默降级（不产生任何业务默认值），是测试工具的结构化输出。
 * 配置本身不合法（cfg 非 LLmConfig 形状、target 后端不存在）仍显式抛 DramaError。
 */
import { DramaError } from "@text2drama/shared";

import { expectPickConfig } from "./backends.js";
import { assertBaseUrl } from "./netPolicy.js";
import type { Backend } from "./backends.js";

export interface ConnectivityResult {
  id: string;
  ok: boolean;
  detail?: string;
}

function isBackend(v: unknown): v is Backend {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Backend).id === "string" &&
    typeof (v as Backend).baseUrl === "string" &&
    typeof (v as Backend).apiKey === "string" &&
    typeof (v as Backend).model === "string" &&
    Array.isArray((v as Backend).roles) &&
    typeof (v as Backend).priority === "number" &&
    typeof (v as Backend).enabled === "boolean"
  );
}

/** 测单个后端：assertBaseUrl 先过（不合法记失败，不中断其余目标） */
async function testOne(b: Backend): Promise<ConnectivityResult> {
  try {
    assertBaseUrl(b);
    const endpoint = b.baseUrl.replace(/\/$/, "") + "/models";
    const r = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${b.apiKey}` },
    });
    if (!r.ok) {
      return { id: b.id, ok: false, detail: `GET /models 返回 ${r.status}` };
    }
    const data = (await r.json()) as { data?: unknown[]; models?: unknown[] };
    const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : undefined;
    if (list === undefined) {
      return { id: b.id, ok: false, detail: "响应里既没有 data 也没有 models 数组，不是 OpenAI 兼容 /models" };
    }
    return { id: b.id, ok: true, detail: `可列 ${list.length} 个模型` };
  } catch (e) {
    // 测试工具吞错：目的就是把每个后端的失败原因变成结构化结果返回给调用方，
    // 而不是让一个后端挂掉拖垮整份诊断报告。这里不产生任何业务默认值（spec §3 授权的审计/工具吞点之一）。
    const msg = e instanceof Error ? e.message : String(e);
    return { id: b.id, ok: false, detail: msg };
  }
}

/**
 * 连通性测试。target = "*" 全测 enabled 后端；否则按 id 精确匹配（含 disabled 的也可单测）。
 */
export async function testBackends(cfg: unknown, target: string): Promise<ConnectivityResult[]> {
  const conf = expectPickConfig(cfg);
  const backends = conf.llmBackends.filter(isBackend);
  const enabled = backends.filter((b) => b.enabled);

  const targets =
    target === "*"
      ? enabled
      : backends.filter((b) => b.id === target);
  if (targets.length === 0) {
    throw new DramaError("invalid_param", {
      message: `连通性测试目标 ${target} 不存在于 llmBackends（"*" 表示全部 enabled 后端）`,
    });
  }
  return Promise.all(targets.map(testOne));
}
