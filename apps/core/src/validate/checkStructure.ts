// M4-1 校验执行：结构层 issue 生成
import type { TaskType } from "@text2drama/shared";
import type { ValidateIssue } from "./index.js";
import {
  EXCLUSION_LINE,
  INSTRUCTION_LINE,
  SUMMARY_TAGS,
  expectedSections,
  parsePrompt,
  type ParsedPrompt,
} from "./structure.js";

export function checkStructure(text: string, taskType: TaskType, issues: ValidateIssue[]): ParsedPrompt {
  const parsed = parsePrompt(text);

  // 孤立 CR（/\r(?!\n)/）→ 2 分
  const lone = /\r(?!\n)/g;
  let m: RegExpExecArray | null;
  while ((m = lone.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    issues.push({
      code: "V1",
      severity: 2,
      message: "发现孤立 CR（\\r 不跟 \\n），文件字节不干净",
      where: `第 ${before.split("\n").length} 行`,
    });
    break; // 一处即报，避免刷屏
  }

  // 伪行（纯空白 / 纯 >）→ 2 分
  for (const no of parsed.pseudoLines) {
    issues.push({
      code: "V1",
      severity: 2,
      message: "发现伪行（纯空白或纯 '>'）",
      where: `第 ${no} 行`,
    });
  }

  // 段集合与顺序白名单
  const expected = expectedSections(taskType);
  const actualNames = parsed.sections.map((s) => s.name);
  const sameOrder = expected.length === actualNames.length
    && expected.every((name, i) => name === actualNames[i]);
  if (!sameOrder) {
    issues.push({
      code: "V2",
      severity: 2,
      message: `字段名或顺序不符白名单：期望 [${expected.join(", ")}]，实际 [${actualNames.join(", ") || "无"}]`,
      where: "全文",
    });
  }

  // 指令行：t2va 无；i2va 逐字
  if (taskType === "t2va" && parsed.hasInstruction) {
    issues.push({
      code: "V3",
      severity: 2,
      message: "T2VA 无视觉素材，不得写指令行",
      where: "第 1 行",
    });
  }
  if (taskType === "i2va" && !parsed.hasInstruction) {
    issues.push({
      code: "V3",
      severity: 2,
      message: `I2VA 缺逐字指令行：${INSTRUCTION_LINE}`,
      where: "第 1 行",
    });
  }

  // 排除行：存在则必须是最后一行
  if (parsed.exclusionLine >= 0) {
    const lastContent = parsed.lines.reduce((acc, l, i) => (l.trim() !== "" ? i + 1 : acc), 0);
    if (parsed.exclusionLine !== lastContent) {
      issues.push({
        code: "V4",
        severity: 2,
        message: `技术排除行必须是最后一行（当前在第 ${parsed.exclusionLine} 行，最后内容在第 ${lastContent} 行）`,
        where: `第 ${parsed.exclusionLine} 行`,
      });
    }
  }

  // summary 枚举白名单（六段壳才有 summary 段）
  const summary = parsed.sections.find((s) => s.name === "summary");
  if (summary && !SUMMARY_TAGS.some((tag) => summary.body.includes(`[${tag}]`))) {
    issues.push({
      code: "V5",
      severity: 1,
      message: `summary 未使用标准任务前缀（可选：[${SUMMARY_TAGS.join(" / ")}]）`,
      where: `第 ${summary.startLine} 行起`,
    });
  }

  // t2va 正文不得出现任何参考标签
  if (taskType === "t2va" && /<(Picture|Audio|Video|Subject) \d+>/.test(text)) {
    issues.push({
      code: "V6",
      severity: 2,
      message: "T2VA 无视觉素材，正文不得出现 <Picture N>/<Audio N>/<Video N>/<Subject N>",
      where: "全文",
    });
  }

  if (!parsed.lines.some((l) => l.trim() === EXCLUSION_LINE) && taskType !== "t2va") {
    // 排除行缺失不强制（EX06 骨架即无排除行），只提示
    issues.push({
      code: "V7",
      severity: 0,
      message: "未发现技术排除行（壳模板建议附在 non_diegetic_music 之后）",
      where: "全文",
    });
  }

  return parsed;
}
