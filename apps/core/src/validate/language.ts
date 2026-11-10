// M4-6 语言层：官方语法英文 / 台词 <d>[Chinese]（h3-prompt-rules §6.6）
import type { ValidateIssue } from "./index.js";
import { ALL_SECTION_NAMES, EXCLUSION_LINE, SUMMARY_TAGS, type ParsedPrompt } from "./structure.js";

export function checkLanguage(text: string, parsed: ParsedPrompt, issues: ValidateIssue[]): void {
  const lines = parsed.lines;

  // ① 字段名/标签/时间戳/枚举/排除行保留英文：字段行含中文字符 → 2 分
  for (const line of lines) {
    const header = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (!header) continue;
    const name = header[1] ?? "";
    const rest = header[2] ?? "";
    if (!ALL_SECTION_NAMES.includes(name)) continue;
    // <d>[Chinese]…</d> 内的中文豁免（三字段壳台词内联在字段行）
    const outsideD = rest.replace(/<d>\[Chinese\][\s\S]*?<\/d>/g, "");
    if (/[\u4e00-\u9fff]/.test(outsideD)) {
      issues.push({
        code: "V27",
        severity: 2,
        message: `字段行「${name}:」的值含中文（官方语法部分必须保留英文；台词应放 <d>[Chinese]…</d>）`,
        where: `第 ${lines.indexOf(line) + 1} 行`,
      });
    }
  }

  // ①b summary 枚举段级检查（正文行内含 [tag]）
  const summaryLine = parsed.sections.find((s) => s.name === "summary");
  if (summaryLine && !SUMMARY_TAGS.some((t) => summaryLine.body.includes(`[${t}]`))) {
    issues.push({
      code: "V28",
      severity: 1,
      message: "summary 前缀未用标准英文枚举值",
      where: "summary",
    });
  }

  // ② 排除行被翻译成中文 → 2 分
  if (/[{【\[]?(无|不要)(字幕|水印)/.test(text) && !lines.some((l) => l.trim() === EXCLUSION_LINE)) {
    issues.push({
      code: "V29",
      severity: 2,
      message: "技术排除行被译成中文（必须逐字保留英文排除行）",
      where: "全文",
    });
  }

  // ③ 中文台词出现在 <d>[Chinese]</d> 之外 → 2 分（逐行检查，<d>…</d> 行豁免）
  let inD = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/<d>\[Chinese\]/.test(line)) inD = true;
    const isDLine = inD;
    if (/<\/d>/.test(line)) {
      // 行尾闭合：本行剩余部分仍按界外检查
      const after = line.split("</d>").slice(1).join("</d>");
      inD = false;
      if (/[\u4e00-\u9fff]/.test(after)) {
        issues.push({
          code: "V30",
          severity: 2,
          message: "中文台词出现在 </d> 闭合之后（台词只能在 <d>[Chinese]…</d> 内）",
          where: `第 ${i + 1} 行`,
        });
      }
      continue;
    }
    if (!isDLine && /[\u4e00-\u9fff]/.test(line)) {
      // 字段行已在 V27 报过；此处只报正文行
      const header = /^[a-z_]+:/i.test(line.trim());
      if (!header) {
        issues.push({
          code: "V30",
          severity: 2,
          message: "说明性正文出现中文（台词必须在 <d>[Chinese]…</d> 内逐字保留）",
          where: `第 ${i + 1} 行`,
        });
      }
    }
  }
}
