/**
 * M13-9/10 · 词汇映射（AI 腔 → 人话）+ 标点校验。
 *
 * 契约：`docs/m101314-spec.md` §3.3（签名冻结）、§3.5 第 7 条。
 *
 * 数据与 `prompts/writing/glossary.md` 的替换表互为镜像（该文件是人类可读权威，
 * 本文件是可执行副本，改表必须两边同步）：
 * - `WORD_FIXES`：确定性替换（`applyWordFixes` 逐条全局替换，长词优先防截胡）；
 * - `BANNED_WORDS`：禁用/避讳列清单——其中「娇躯/娇喘/仿佛/似乎」属**过度使用类**
 *   （500 字内出现 2 次以上才判违规，glossary.md §2），代码只负责提供清单，
 *   密度判定权在 polish 自检，不在这里一刀切。
 *
 * `checkPunctuation` 只实现核心规则（punctuation.md R1+R2）：
 * `」`/`』` 前的句号一律省略（报错），但紧邻的 `！？……～` 必须保留（只在报错信息
 * 里明示保留，函数**只报不改**）。R3-R8 属符号语义判定，留给 LLM 侧按 punctuation.md 执行。
 */
import { DramaError } from "@text2drama/shared";

/** 词汇映射：AI 腔 → 人话（镜像 prompts/writing/glossary.md §1 替换表） */
export const WORD_FIXES: readonly { from: string; to: string; note?: string }[] = [
  {
    from: "感官风暴",
    to: "快感风暴",
    note: "「感官」过于学术，不够色气",
  },
  {
    from: "丢了",
    to: "去了",
    note: "机翻感错误表达；绝顶/登顶/崩坏按强度递进选用，同一场景不重复同一档",
  },
  {
    from: "掉了",
    to: "去了",
    note: "机翻感错误表达；绝顶/登顶/崩坏按强度递进选用",
  },
  {
    from: "娇躯",
    to: "胴体",
    note: "避免词汇贫乏，按情境多样化",
  },
  {
    from: "娇喘",
    to: "甜腻的呻吟",
    note: "避免词汇贫乏，按情境多样化",
  },
];

/** 禁用/避讳词清单（glossary.md §1 的「禁用/避讳」列；过度使用类见文件头说明） */
export const BANNED_WORDS: readonly string[] = [
  "感官风暴",
  "丢了",
  "掉了",
  "娇躯",
  "娇喘",
  "某种",
  "某种程度的",
  "仿佛",
  "似乎",
];

function bad(message: string, hint?: string): DramaError {
  return new DramaError("invalid_param", { message, ...(hint === undefined ? {} : { hint }) });
}

/**
 * 标点校验：`」`/`』` 前存在句号 → 报错（R1 句号省略）。
 *
 * 只报 `。` 与闭引号之间仅隔情感标点（`！？……～`）的情况——句号后面隔着正文
 * （如 `「他说。她笑了。」`）不算违规；情感标点必须保留（R2），报错信息里明示。
 *
 * @returns `{ line, message }[]`，line 为 1-based 行号；无违规返回空数组。
 */
export function checkPunctuation(text: string): { line: number; message: string }[] {
  const issues: { line: number; message: string }[] = [];
  const re = /(。+)([！？……～]*)([」』])/gu;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lines[i] ?? "")) !== null) {
      const quote = m[3] ?? "";
      const periodRun = m[1] ?? "";
      const emotional = m[2] ?? "";
      issues.push({
        line: i + 1,
        message: `${quote} 前有句号「${periodRun}」应省略${emotional !== "" ? "（紧邻的情感标点保留）" : ""}`,
      });
    }
  }
  return issues;
}

/**
 * 逐条应用词汇映射（全局替换，长词优先防止「某种程度」被「某种」截胡）。
 *
 * @returns 替换后的文本 + 实际命中的映射条目（`from → to`，按表序去重，不含未命中的）。
 */
export function applyWordFixes(text: string): { text: string; applied: string[] } {
  const sorted = [...WORD_FIXES].sort((a, b) => b.from.length - a.from.length);
  let out = text;
  const applied: string[] = [];
  for (const fix of sorted) {
    if (out.includes(fix.from)) {
      out = out.split(fix.from).join(fix.to);
      applied.push(`${fix.from} → ${fix.to}`);
    }
  }
  return { text: out, applied };
}
