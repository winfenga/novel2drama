/**
 * M8-1 · 工作流注册表。
 *
 * 冻结依据：`docs/m489-spec.md` §2.2（architecture L1188-1208）。
 *
 * 规则（spec §2.3 重点用例）：
 * - `nodes.length === 0` 的工作流拒绝入库（直接跳过，不注册、不报错——坏文件不该拖垮整个注册表）
 * - JSON 解析失败 / 缺必要字段 / kind 非法 → 同样拒绝入库
 * - `requiresAdapter` 指向的文件在 dir 内不存在 → 注册但 `available:false` + reason
 *   （VDN 场景：Stage-B adapter 文件缺失时 `h3-2pass` 灰显，api-contract L863）
 * - `hidden` 条目照常入库，`available` 照常计算；「下不下拉列表展示」是 openai.ts（M8-6）的事
 *
 * context_frames 常量（decision-log §12.2）：只有 5/22/39 三个合法档位（模型训练固定档），
 * 默认 22。M8 只做常量导出；非末段不裁尾巴等编排逻辑 M12 才消费（decision-log §12.3）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** H3 长视频上下文帧合法档位（decision-log §12.2，M12 消费；M8 仅导出） */
export const CONTEXT_FRAMES = [5, 22, 39] as const;
export type ContextFrames = (typeof CONTEXT_FRAMES)[number];

export interface WorkflowEntry {
  id: string;
  label: string;
  kind: "image" | "video";
  hidden: boolean;
  /** 缺 adapter 等依赖时的原因；available === true 时为 null */
  available: boolean;
  reason: string | null;
  /** 工作流节点数组；入库前必须 nodes.length > 0 */
  nodes: unknown[];
}

function isWorkflowKind(v: unknown): v is "image" | "video" {
  return v === "image" || v === "video";
}

/** 从一个已解析的 JSON 对象构造条目；不合格返回 null（拒绝入库） */
function toEntry(id: string, parsed: unknown): WorkflowEntry | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) return null;
  if (!isWorkflowKind(obj.kind)) return null;
  const label = typeof obj.label === "string" ? obj.label : id;
  return {
    id,
    label,
    kind: obj.kind,
    hidden: obj.hidden === true,
    available: false,
    reason: null,
    nodes: obj.nodes,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createRegistry(dir: string): {
  list(): WorkflowEntry[];
  get(id: string): WorkflowEntry | undefined;
} {
  const entries = new Map<string, WorkflowEntry>();

  // —— 同步装载：spec 冻结的 createRegistry(dir) 是同步工厂，list()/get() 也是同步的，
  //    所以用 node:fs 的同步 API 扫描目录（测试用临时目录，无性能问题）。
  let fileNames: string[];
  try {
    fileNames = readdirSync(dir);
  } catch (err) {
    // 目录不存在 / 不可读 → 注册表为空。这是「没有配置任何工作流」的正常形态，
    // 不是吞错：调用方拿到的 list() 为空，openai 层自然无可用模型。
    // 原始错误挂到第一条 reason 上没有意义（没有条目可挂），记 console 便于排查。
    console.error(`[registry] 无法读取工作流目录 ${dir}:`, err);
    fileNames = [];
  }

  for (const fileName of fileNames) {
    if (!fileName.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(dir, fileName);
    if (!statSync(filePath).isFile()) continue;

    const fallbackId = fileName.replace(/\.json$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath).toString("utf8"));
    } catch {
      continue; // 解析失败 → 拒绝入库
    }

    // 兼容两种形态：文件本身就是条目对象（id 优先取文件内 id 字段），或清单文件
    const parsedObj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const candidates: { id: string; body: unknown }[] = Array.isArray(parsed)
      ? (parsed as unknown[]).map((body, i) => ({
          id:
            typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).id === "string"
              ? ((body as Record<string, unknown>).id as string)
              : `${fallbackId}:${i}`,
          body,
        }))
      : parsedObj !== null && Array.isArray(parsedObj.workflows)
        ? (parsedObj.workflows as { id?: unknown; [k: string]: unknown }[]).map((body, i) => ({
            id: typeof body.id === "string" ? body.id : `${fallbackId}:${i}`,
            body,
          }))
        : [
            {
              id:
                typeof parsedObj?.id === "string" && parsedObj.id.length > 0
                  ? parsedObj.id
                  : fallbackId,
              body: parsed,
            },
          ];

    for (const { id, body } of candidates) {
      if (typeof id !== "string" || id.length === 0) continue;
      if (entries.has(id)) continue; // 同 id 冲突：先到先得，不静默覆盖
      const entry = toEntry(id, body);
      if (entry === null) continue; // nodes.length===0 / 字段非法 → 拒绝入库

      // adapter 可用性：requiresAdapter 指向 dir 内一个必须存在的文件
      const requiresAdapter =
        typeof (body as Record<string, unknown>).requiresAdapter === "string"
          ? ((body as Record<string, unknown>).requiresAdapter as string)
          : null;
      if (requiresAdapter !== null) {
        const adapterPath = path.join(dir, requiresAdapter);
        let adapterOk = false;
        try {
          adapterOk = statSync(adapterPath).isFile();
        } catch {
          adapterOk = false;
        }
        if (!adapterOk) {
          entry.available = false;
          entry.reason = `missing adapter: ${requiresAdapter}`;
          entries.set(id, entry);
          continue;
        }
      }

      entry.available = true;
      entry.reason = null;
      entries.set(id, entry);
    }
  }

  return {
    list(): WorkflowEntry[] {
      return [...entries.values()];
    },
    get(id: string): WorkflowEntry | undefined {
      return entries.get(id);
    },
  };
}
