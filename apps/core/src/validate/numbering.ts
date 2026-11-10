// M4-2 编号契约层（Hybrid 专项，h3-prompt-rules §6.2）
import type { TaskType } from "@text2drama/shared";
import type { ValidateIssue } from "./index.js";

const PICTURE_RE = /<Picture (\d+)>/g;

export function checkNumbering(text: string, taskType: TaskType, opts: { expectedPictures?: number }, issues: ValidateIssue[]): void {
  if (taskType !== "hybrid" && taskType !== "l2va" && taskType !== "fl2va") return;

  // ① 空格版 `first frame` / `last frame` → 2 分
  if (/`first frame`|`last frame`|<First Frame>|<Last Frame>/.test(text)) {
    issues.push({
      code: "V8",
      severity: 2,
      message: "关键帧字段名必须是反引号+下划线的 `first_frame` / `last_frame`，不得写空格版或自造标签",
      where: "全文",
    });
  }

  // ② 关键帧不得写成 <Picture N>（判定：正文出现 first_frame 语义同时出现 <Picture N> 挤位——
  //    机械近似：关键帧行（含 first_frame/last_frame 语义的行）里含 <Picture N>）
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/(first|last)\s*_?frame/i.test(line) && /<Picture \d+>/.test(line)) {
      issues.push({
        code: "V9",
        severity: 2,
        message: "关键帧不得写成 <Picture N>（不占 Picture 编号）",
        where: `第 ${i + 1} 行`,
      });
    }
    // ⑥ 关键帧不得写成 <Subject N>
    if (/(first|last)_frame/i.test(line) && /<Subject \d+>/.test(line)) {
      issues.push({
        code: "V10",
        severity: 2,
        message: "关键帧不得写成 <Subject N>",
        where: `第 ${i + 1} 行`,
      });
    }
  }

  // ③ <Picture 1> 恒为第一张参考图：首个 <Picture 引用必须是 1
  PICTURE_RE.lastIndex = 0;
  let first: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = PICTURE_RE.exec(text)) !== null) {
    first = m;
    break;
  }
  if (first && first[1] !== "1") {
    issues.push({
      code: "V11",
      severity: 2,
      message: `首个 <Picture> 引用必须是 <Picture 1>（实际 <Picture ${first[1]}>）`,
      where: "全文",
    });
  }

  // ④ 编号总数 = expectedPictures（去重计数，不连续也各报一条）
  PICTURE_RE.lastIndex = 0;
  const nums = new Set<number>();
  while ((m = PICTURE_RE.exec(text)) !== null) {
    nums.add(Number(m[1]));
  }
  if (typeof opts.expectedPictures === "number") {
    if (nums.size !== opts.expectedPictures) {
      issues.push({
        code: "V12",
        severity: 2,
        message: `<Picture N> 编号总数 ${nums.size} ≠ 用户给图张数 ${opts.expectedPictures}`,
        where: "全文",
      });
    }
    for (let n = 1; n <= opts.expectedPictures; n++) {
      if (!nums.has(n)) {
        issues.push({
          code: "V12",
          severity: 2,
          message: `<Picture ${n}> 缺失（编号应从 1 起连续）`,
          where: "全文",
        });
      }
    }
  }

  // ⑤ <Audio N> / <Video N> 从 1 起
  for (const kind of ["Audio", "Video"] as const) {
    const re = new RegExp(`<${kind} (\\d+)>`, "g");
    let mm: RegExpExecArray | null;
    let firstKind: number | null = null;
    const seen = new Set<number>();
    while ((mm = re.exec(text)) !== null) {
      const n = Number(mm[1]);
      if (firstKind === null) firstKind = n;
      seen.add(n);
    }
    if (firstKind !== null && firstKind !== 1) {
      issues.push({
        code: "V13",
        severity: 2,
        message: `<${kind} N> 编号必须从 1 起（实际从 ${firstKind} 起）`,
        where: "全文",
      });
    }
    if (seen.size > 0) {
      const maxN = Math.max(...seen);
      for (let n = 1; n <= maxN; n++) {
        if (!seen.has(n)) {
          issues.push({
            code: "V13",
            severity: 2,
            message: `<${kind} ${n}> 缺失（编号不连续，疑似被关键帧挤位）`,
            where: "全文",
          });
        }
      }
    }
  }

  // hybrid 必须同时有关键帧与参考素材
  if (taskType === "hybrid") {
    if (!/`(first|last)_frame`/.test(text)) {
      issues.push({
        code: "V14",
        severity: 2,
        message: "Hybrid 必须含 ≥1 关键帧（反引号 `first_frame` / `last_frame`）",
        where: "全文",
      });
    }
    if (!PICTURE_RE.test(text)) {
      issues.push({
        code: "V14",
        severity: 2,
        message: "Hybrid 必须含 ≥1 参考素材（<Picture N>）",
        where: "全文",
      });
    }
  }
}
