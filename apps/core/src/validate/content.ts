// M4-4 内容层：台词逐字 / 朝向三要素 / 无动机转向（h3-prompt-rules §6.4）
import type { ValidateIssue } from "./index.js";
import { sectionBody, type ParsedPrompt } from "./structure.js";

const D_RE = /<d>\[Chinese\]([\s\S]*?)<\/d>/g;

export function checkContent(text: string, parsed: ParsedPrompt, opts: { scriptLines?: string[] }, issues: ValidateIssue[]): void {
  const detail = sectionBody(parsed, "detailed_description");
  const body = detail || text;

  // ① 剧本台词逐字覆盖：每句须在某个 <d>[Chinese]...</d> 内出现
  if (opts.scriptLines && opts.scriptLines.length > 0) {
    D_RE.lastIndex = 0;
    const blocks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = D_RE.exec(body)) !== null) {
      blocks.push(m[1] ?? "");
    }
    for (const line of opts.scriptLines) {
      const normalized = line.trim();
      if (normalized === "") continue;
      const covered = blocks.some((b) => b.includes(normalized));
      if (!covered) {
        issues.push({
          code: "V19",
          severity: 2,
          message: `台词未覆盖：剧本句「${normalized.slice(0, 20)}${normalized.length > 20 ? "…" : ""}」未在任何 <d>[Chinese]…</d> 内逐字出现`,
          where: "detailed_description",
        });
      }
    }
  }

  // ② Facing: 前缀存在（每个人物朝向写明——机械化为存在性检查）
  if (!/(^|\n)\s*Facing:/m.test(body) && !/Facing:/i.test(body)) {
    issues.push({
      code: "V20",
      severity: 1,
      message: "未发现 Facing: 朝向句（每个人物、每个镜头的朝向应写明）",
      where: "detailed_description",
    });
  }

  // ③ 无朝向写法（she looks at him 类）→ 1 分
  const vague = /\b(she|he|it)\s+(looks|stares|gazes)\s+at\s+(him|her|it|them)\b/i.exec(text);
  if (vague) {
    const lineNo = text.slice(0, vague.index).split("\n").length;
    issues.push({
      code: "V21",
      severity: 1,
      message: "疑似无朝向写法（仅写 looks at him 类，未写相对镜头 + 画框左右 + 两人相对关系）",
      where: `第 ${lineNo} 行`,
    });
  }

  // ④ 无动机转向：转身处未写转身动作 → 1 分
  const turn = /\bturns?\s+(a?round|to)\b/i.exec(text);
  if (turn && !/(\bturning\b|\bpivots?\b|\bspin)/i.test(text)) {
    issues.push({
      code: "V22",
      severity: 1,
      message: "出现转身但未描述转身动作本身（无动机转向）",
      where: `第 ${text.slice(0, turn.index).split("\n").length} 行`,
    });
  }
}
