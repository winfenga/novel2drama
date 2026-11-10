// M4-3 连贯层：first_frame 启动 / 0.5s / 禁写清单 / 链上条目（h3-prompt-rules §6.3）
import type { ValidateIssue } from "./index.js";
import { sectionBody, type ParsedPrompt } from "./structure.js";

const FORBIDDEN_OPENING = [
  "holds still on the image",
  "the frame holds",
  "remains motionless",
  "freezes for a moment",
  "stays still before",
  "a brief pause before",
  "the shot lingers",
  "slowly comes to life",
] as const;

const OPENING_SENTENCE = "opens exactly on the first_frame image";

export function checkCoherence(text: string, parsed: ParsedPrompt, hasFirstFrame: boolean, issues: ValidateIssue[]): void {
  // ① 有首帧分支：开场句必须逐字出现
  if (hasFirstFrame && !text.includes(OPENING_SENTENCE)) {
    issues.push({
      code: "V15",
      severity: 2,
      message: "有首帧时 [Shot 1] 必须从 first_frame 内部启动（缺逐字句 opens exactly on the first_frame image）",
      where: "detailed_description",
    });
  }

  // ② 禁写清单 8 条，任一命中 → 2 分
  for (const phrase of FORBIDDEN_OPENING) {
    const re = new RegExp(phrase.replace(/ /g, "\\s+"), "i");
    const hit = re.exec(text);
    if (hit) {
      const lineNo = text.slice(0, hit.index).split("\n").length;
      issues.push({
        code: "V16",
        severity: 2,
        message: `禁写清单命中：「${phrase}」（停留/定格/缓缓起手类写法）`,
        where: `第 ${lineNo} 行`,
      });
    }
  }

  // ③ 链上条目：有 previous 标记时，承接/下接两行 + 延续说明必须存在
  const hasPreviousMark = /previous/i.test(text);
  if (hasPreviousMark) {
    if (!/承接/.test(text) || !/下接/.test(text)) {
      issues.push({
        code: "V17",
        severity: 2,
        message: "链上条目文件头缺「承接」/「下接」两行",
        where: "文件头",
      });
    }
    if (!/(continues? seamlessly|自上一帧延续|无停顿)/i.test(text)) {
      issues.push({
        code: "V17",
        severity: 1,
        message: "链上条目未写明「动作自上一帧延续、中间无停顿」",
        where: "detailed_description",
      });
    }
  }

  // ④ 抬眼/呼吸/视线移动当开场动作 → 1 分（启发式：出现在 [Shot 1] 段的纯视线动作）
  const detail = sectionBody(parsed, "detailed_description");
  const shot1 = /\[Shot 1\]([^\[]*)/i.exec(detail);
  if (shot1 && /(blink|blinks|breath(e|es|ing)|glance)/i.test(shot1[1] ?? "") && !/(then|and then|after|while)/i.test(shot1[1] ?? "")) {
    issues.push({
      code: "V18",
      severity: 1,
      message: "[Shot 1] 开场疑似把抬眼/呼吸/视线移动当成了开场动作",
      where: "detailed_description [Shot 1]",
    });
  }
}
