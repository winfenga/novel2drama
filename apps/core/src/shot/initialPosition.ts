/**
 * M6-4 · 第 0 秒初始空间位置（数据结构 + 规则校验器）。
 *
 * 依据：m267-spec §2.1 + E3 漂移裁决：本轮只做数据结构 + 规则校验器
 * （initialPosition 非空、含方位词、ASCII 站位图可解析）；
 * 从 CF 台账重建是 M3/LLM 产物接入后的事。
 * 依据：storyboard-rules.md §六 L355-365：初始位置从事实与上一镜「结束状态」
 * 重建，不沿用渲染帧；镜内位移必须可由初始位置连续推出。
 */

/** 单个实体的第 0 秒状态 */
export interface InitialPositionEntry {
  /** 人物/道具名（引用资产编号，如 CH-01 / PR-02） */
  ref: string;
  kind: "character" | "prop" | "scene_anchor";
  /** 方位词：左/右/前/后/中央/门口/桌后 等 */
  position: string;
  /** 面朝方向（Facing 三要素的方向面） */
  facing?: string;
  /** 姿态（站/坐/躺/持物…） */
  pose?: string;
}

/** ASCII 站位图（可解析的行块） */
export interface AsciiLayout {
  /** 原始行（含边框/标记） */
  lines: string[];
  /** 解析出的标记：ref → 图中标记字符 */
  markers: Map<string, string>;
}

export interface InitialPosition {
  shotId: string;
  entries: InitialPositionEntry[];
  layout: AsciiLayout | null;
}

export interface PositionCheckResult {
  ok: boolean;
  /** 违规清单（规则校验器产物，非 LLM） */
  violations: string[];
}

/** 方位词表（storyboard-rules §六 L357：左/右/前/后/中央/门口/桌后） */
const POSITION_WORDS = ["左", "右", "前", "后", "中央", "门口", "窗边", "桌后", "墙角", "床上", "门后"] as const;

const ASCII_LINE = /^[\s\-+|A-Za-z0-9\u4e00-\u9fff[\]()：:·*#@]+$/;

/**
 * 规则校验器（E3）：
 * 1. 非空：至少一个 entry（scene_anchor 之外）
 * 2. 每个 entry 的 position 必须含方位词
 * 3. layout 存在时行可解析（字符集合法）、markers 里每个 ref 都在 entries 中
 */
export function validateInitialPosition(pos: InitialPosition): PositionCheckResult {
  const violations: string[] = [];

  const entityEntries = pos.entries.filter((e) => e.kind !== "scene_anchor");
  if (entityEntries.length === 0) {
    violations.push("初始位置为空：至少需要一个人/道具的方位条目");
  }

  for (const e of pos.entries) {
    if (!POSITION_WORDS.some((w) => e.position.includes(w))) {
      violations.push(`${e.ref} 的方位「${e.position}」不含方位词（${POSITION_WORDS.join("/")}）`);
    }
  }

  if (pos.layout !== null) {
    if (pos.layout.lines.length === 0) {
      violations.push("ASCII 站位图为空块");
    }
    for (let i = 0; i < pos.layout.lines.length; i++) {
      if (!ASCII_LINE.test(pos.layout.lines[i]!)) {
        violations.push(`ASCII 站位图第 ${i + 1} 行含不可解析字符`);
      }
    }
    for (const [ref] of pos.layout.markers) {
      if (!pos.entries.some((e) => e.ref === ref)) {
        violations.push(`ASCII 站位图标记 ${ref} 不在方位条目中`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** 解析 ASCII 站位图：约定标记格式 `@CH-01` / `@PR-02` 出现在图中 */
export function parseAsciiLayout(lines: string[]): AsciiLayout {
  const markers = new Map<string, string>();
  for (const line of lines) {
    const re = /@([A-Z]{2}-\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      markers.set(m[1]!, m[0]);
    }
  }
  return { lines, markers };
}
