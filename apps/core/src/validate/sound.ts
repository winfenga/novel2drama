// M4-5 声音层：(Sx) 连续性 / retention_analysis / soundscape / music（h3-prompt-rules §6.5）
import type { ValidateIssue } from "./index.js";
import { sectionBody, type ParsedPrompt } from "./structure.js";

const ABSTRACT_MUSIC_WORDS = ["梦幻", "情欲", "ethereal", "sensual", "dreamy", "erotic"] as const;

export function checkSound(text: string, parsed: ParsedPrompt, issues: ValidateIssue[]): void {
  // ① (Sx) 首次出现即定义、连续分配：S1→S2→S3…不许跳号
  const sIds: number[] = [];
  const sRe = /\(S(\d+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = sRe.exec(text)) !== null) {
    sIds.push(Number(m[1]));
  }
  const firstOccurrence = [...new Set(sIds)];
  for (let i = 0; i < firstOccurrence.length; i++) {
    if (firstOccurrence[i] !== i + 1) {
      issues.push({
        code: "V23",
        severity: 2,
        message: `(Sx) 分配不连续：第 ${i + 1} 个出现的声源 ID 是 (S${firstOccurrence[i]})，应为 (S${i + 1})（首次出现即定义）`,
        where: "全文",
      });
      break;
    }
  }

  // ② retention_analysis 段内不得出现 (S
  const retention = sectionBody(parsed, "retention_analysis");
  if (retention && /\(S/i.test(retention)) {
    issues.push({
      code: "V24",
      severity: 2,
      message: "retention_analysis 段内不得出现 (Sx) 声源标记",
      where: "retention_analysis",
    });
  }

  // ③ overall_soundscape 不得含 <d> 内容片段
  const soundscape = sectionBody(parsed, "overall_soundscape");
  if (soundscape) {
    const dContents = extractDContents(text);
    for (const d of dContents) {
      const probe = d.trim().replace(/[。，、！？.!,?]/g, "").slice(0, 6);
      if (probe.length >= 4 && soundscape.includes(probe)) {
        issues.push({
          code: "V25",
          severity: 1,
          message: "overall_soundscape 疑似重复了台词内容（soundscape 不重复台词）",
          where: "overall_soundscape",
        });
        break;
      }
    }
  }

  // ④ non_diegetic_music 禁抽象情绪词 → 1 分
  const music = sectionBody(parsed, "non_diegetic_music");
  if (music) {
    for (const word of ABSTRACT_MUSIC_WORDS) {
      const re = new RegExp(word, "i");
      if (re.test(music)) {
        issues.push({
          code: "V26",
          severity: 1,
          message: `non_diegetic_music 含抽象情绪词「${word}」（只许写乐器、速度、节奏、力度变化）`,
          where: "non_diegetic_music",
        });
      }
    }
  }
}

function extractDContents(text: string): string[] {
  const out: string[] = [];
  const re = /<d>\[Chinese\]([\s\S]*?)<\/d>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] ?? "");
  }
  return out;
}
