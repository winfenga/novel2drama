// M4-1 结构层：段数/字段名顺序/枚举白名单/排除行位置/孤立 CR 扫描（h3-prompt-rules §6.1）
import type { TaskType } from "@text2drama/shared";
import type { ValidateIssue } from "./index.js";

export const THREE_FIELD_SECTIONS = [
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;
export const SIX_SECTION_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;
export const ALL_SECTION_NAMES: readonly string[] = [
  ...THREE_FIELD_SECTIONS,
  ...SIX_SECTION_SECTIONS,
];
export const EXCLUSION_LINE =
  "No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.";
export const INSTRUCTION_LINE =
  "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
export const SUMMARY_TAGS = [
  "keyframe completion",
  "reference generation",
  "video editing",
  "video continuation",
  "audio reuse",
  "audio reference",
] as const;

const HEADER_RE = /^(subject_definitions|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music|integrated_multimodal_description):/;

export interface ParsedSection {
  name: string;
  body: string;
  startLine: number; // 1-based
}
export interface ParsedPrompt {
  lines: string[];
  sections: ParsedSection[];
  /** 排除行行号（1-based）；不存在为 -1 */
  exclusionLine: number;
  /** 第一条非空行是否为逐字指令行 */
  hasInstruction: boolean;
  /** 伪行行号（1-based） */
  pseudoLines: number[];
}

export function expectedSections(taskType: TaskType): readonly string[] {
  return taskType === "ref2va" || taskType === "hybrid"
    ? SIX_SECTION_SECTIONS
    : THREE_FIELD_SECTIONS;
}

export function sectionBody(parsed: ParsedPrompt, name: string): string {
  const found = parsed.sections.find((s) => s.name === name);
  return found ? found.body : "";
}

export function parsePrompt(text: string): ParsedPrompt {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  const pseudoLines: number[] = [];
  let exclusionLine = -1;
  let hasInstruction = false;
  let current: ParsedSection | null = null;
  let currentBody: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const no = i + 1;
    if (line.trim() === EXCLUSION_LINE) {
      exclusionLine = no;
      if (current) {
        sections.push({ name: current.name, body: currentBody.join("\n").trim(), startLine: current.startLine });
        current = null;
        currentBody = [];
      }
      continue;
    }
    if (!hasInstruction && sections.length === 0 && current === null && line.trim() !== "") {
      hasInstruction = line.trim() === INSTRUCTION_LINE;
    }
    const header = HEADER_RE.exec(line);
    if (header) {
      if (current) {
        sections.push({ name: current.name, body: currentBody.join("\n").trim(), startLine: current.startLine });
      }
      current = { name: header[1] ?? "", body: "", startLine: no };
      currentBody = [line.slice(header[0].length).trim()];
      continue;
    }
    if (current) {
      currentBody.push(line);
      continue;
    }
    // 伪行：非空、纯空白或纯 `>`（真空行是段间分隔符，不算）
    if (line.length > 0 && (/^\s+$/.test(line) || /^[>\s]+$/.test(line))) {
      pseudoLines.push(no);
    }
  }
  if (current) {
    sections.push({ name: current.name, body: currentBody.join("\n").trim(), startLine: current.startLine });
  }
  return { lines, sections, exclusionLine, hasInstruction, pseudoLines };
}
