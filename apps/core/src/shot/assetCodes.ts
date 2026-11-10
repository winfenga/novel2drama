/**
 * M6-5 · 资产编号分配（D4/D5 裁决落点）。
 *
 * 依据：m267-spec §2.2、storyboard-rules.md §五 L250-263：
 * - 格式：SC-01 / CH-01 / PR-01，两位数；状态变体 -A/-B/-C
 * - 一经分配永不改变；按首次出现顺序分配；先人物/场景，后道具
 * - D4：资产板模板默认 C（3D 国漫标签式），mediaLock==="realistic" 时切 A
 * - D5：场景锚定图必含俯视平面图区
 */

export type AssetKind = "scene" | "character" | "prop";

export interface AssetOccurrence {
  type: AssetKind;
  name: string;
  /** 可选状态变体名（如「白天」「黑夜」「损毁」）；未给则无变体 */
  variant?: string;
}

export interface AssetCodeEntry {
  code: string;
  /** 全局唯一基础编号（不含变体），如 SC-01 */
  baseCode: string;
  variant?: string;
  type: AssetKind;
  name: string;
}

export interface AssetCodeResult {
  /** name → 编号（含变体）。Map 保持首次出现顺序。 */
  codes: Map<string, string>;
  entries: AssetCodeEntry[];
}

const VARIANT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

const PREFIX: Record<AssetKind, string> = {
  scene: "SC",
  character: "CH",
  prop: "PR",
};

/**
 * 分配规则：
 * 1. 按首次出现顺序扫描；同 name 二次出现不重分配（返回已有编号）
 * 2. 排序键：人物/场景先，道具后——同一次分配批内道具让位于人物/场景
 *    （实现：对首次出现的新资产，scene/character 立即占号，prop 延后到批末分配）
 * 3. 编号两位数零填充，各类独立计数
 * 4. 同一资产的多个状态变体：-A/-B/-C 按首次出现顺序
 */
export function assignAssetCodes(appearingOrder: AssetOccurrence[]): AssetCodeResult {
  const counters: Record<AssetKind, number> = { scene: 0, character: 0, prop: 0 };
  const baseByAsset = new Map<string, string>();
  const variantByAsset = new Map<string, Map<string, string>>();
  const codes = new Map<string, string>();
  const entries: AssetCodeEntry[] = [];

  // 待分配道具（延后到人物/场景之后）
  const pendingProps: AssetOccurrence[] = [];

  for (const occ of appearingOrder) {
    if (baseByAsset.has(occ.name)) {
      // 二次出现：不重分配；只处理新状态变体
      const base = baseByAsset.get(occ.name)!;
      const code = resolveVariant(base, occ, variantByAsset);
      const entry: AssetCodeEntry = {
        code,
        baseCode: base,
        type: occ.type,
        name: occ.name,
        ...(occ.variant !== undefined ? { variant: occ.variant } : {}),
      };
      if (!entries.some((e) => e.code === code)) {
        entries.push(entry);
      }
      codes.set(occ.name, code);
      continue;
    }
    if (occ.type === "prop") {
      pendingProps.push(occ);
      continue;
    }
    allocate(occ, counters, baseByAsset, variantByAsset, codes, entries);
  }

  for (const occ of pendingProps) {
    allocate(occ, counters, baseByAsset, variantByAsset, codes, entries);
  }

  return { codes, entries };
}

function allocate(
  occ: AssetOccurrence,
  counters: Record<AssetKind, number>,
  baseByAsset: Map<string, string>,
  variantByAsset: Map<string, Map<string, string>>,
  codes: Map<string, string>,
  entries: AssetCodeEntry[],
): void {
  counters[occ.type] += 1;
  const base = `${PREFIX[occ.type]}-${String(counters[occ.type]).padStart(2, "0")}`;
  baseByAsset.set(occ.name, base);

  const entry: AssetCodeEntry = {
    code: base,
    baseCode: base,
    type: occ.type,
    name: occ.name,
  };
  if (occ.variant !== undefined) {
    const withVariant = `${base}-${variantLetter(base, occ.variant, variantByAsset)}`;
    entry.variant = occ.variant;
    entry.code = withVariant;
  }
  entries.push(entry);
  codes.set(occ.name, entry.code);
}

function resolveVariant(
  base: string,
  occ: AssetOccurrence,
  variantByAsset: Map<string, Map<string, string>>,
): string {
  if (occ.variant === undefined) return base;
  const letter = variantLetter(base, occ.variant, variantByAsset);
  return `${base}-${letter}`;
}

function variantLetter(
  base: string,
  variant: string,
  variantByAsset: Map<string, Map<string, string>>,
): string {
  let m = variantByAsset.get(base);
  if (m === undefined) {
    m = new Map<string, string>();
    variantByAsset.set(base, m);
  }
  const existing = m.get(variant);
  if (existing !== undefined) return existing;
  const letter = VARIANT_LETTERS[m.size] ?? String(m.size + 1);
  m.set(variant, letter);
  return letter;
}

// ── D4：资产板提示词模板选择 ──

export type AssetBoardTemplate = "A" | "B" | "C";

/**
 * D4：C（3D 国漫标签式）为默认；介质锁 realistic 时切 A（GPT_IMAGE 真人定妆）；
 * B（H3 六段式）不用于出静图——永不返回 B。
 */
export function pickAssetBoardTemplate(mediaLock: string): AssetBoardTemplate {
  return mediaLock === "realistic" ? "A" : "C";
}

// ── D5：场景锚定图必含俯视平面图区 ──

export interface SceneAnchorSpec {
  /** 主机位图占比（左约 60%） */
  main: number;
  /** 辅助机位图占比（右上约 20%） */
  aux: number;
  /** 俯视平面图占比（右下约 20%，空间关系唯一裁决） */
  topDown: number;
}

/** D5：俯视平面图必出——固定 60/20/20 布局 */
export function sceneAnchorLayout(): SceneAnchorSpec {
  return { main: 0.6, aux: 0.2, topDown: 0.2 };
}
