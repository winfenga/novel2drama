// M4 · validatePrompt 总入口（m489-spec §1.2 冻结签名）
import type { TaskType } from "@text2drama/shared";
import { checkStructure } from "./checkStructure.js";
import { checkNumbering } from "./numbering.js";
import { checkCoherence } from "./coherence.js";
import { checkContent } from "./content.js";
import { checkSound } from "./sound.js";
import { checkLanguage } from "./language.js";

export interface ValidateIssue {
  /** 对应 M6 风险分 20 项里的编号（⑭⑰ 等）或 M4 自有编号（V1-Vn） */
  code: string;
  severity: 0 | 1 | 2;
  message: string;
  /** 定位到哪一段/哪一行 */
  where?: string;
}
export interface ValidateOptions {
  taskType: TaskType;
  /** 内容层逐字校验的基准（剧本台词表） */
  scriptLines?: string[];
  /** 编号总数 = 用户给图张数 */
  expectedPictures?: number;
}

/** 总入口：六层全跑，返回全部 issue；2 分不许出片的判定由调用方（M8 提交前）做 */
export function validatePrompt(promptText: string, opts: ValidateOptions): ValidateIssue[] {
  const issues: ValidateIssue[] = [];
  const parsed = checkStructure(promptText, opts.taskType, issues);
  checkNumbering(promptText, opts.taskType, { expectedPictures: opts.expectedPictures }, issues);

  // 有首帧分支 = 挂关键帧锚点的壳；i2va/ref2va 的 <Picture 1> 不是 first_frame 分支
  const hasFirstFrame = opts.taskType === "hybrid" || opts.taskType === "fl2va" || opts.taskType === "l2va";
  checkCoherence(promptText, parsed, hasFirstFrame, issues);
  checkContent(promptText, parsed, { scriptLines: opts.scriptLines }, issues);
  checkSound(promptText, parsed, issues);
  checkLanguage(promptText, parsed, issues);
  return issues;
}

export { checkStructure, checkNumbering, checkCoherence, checkContent, checkSound, checkLanguage };
export * from "./structure.js";
