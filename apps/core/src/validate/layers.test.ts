// M4-1~M4-6 各层单测（m489-spec §1.2 六层规则逐条机械化）
import { describe, expect, it } from "vitest";
import { validatePrompt } from "./index.js";
import { parsePrompt } from "./structure.js";

describe("M4-1 结构层", () => {
  it("孤立 CR → V1 2 分", () => {
    const issues = validatePrompt("subject_definitions:\nx\rnot a newline\n", { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V1" && i.severity === 2)).toBe(true);
  });
  it("伪行（纯 >）→ V1 2 分", () => {
    const issues = validatePrompt(">\n", { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V1" && i.severity === 2)).toBe(true);
  });
  it("字段顺序错 → V2 2 分", () => {
    const text = "summary:\n[reference generation] x\n\nsubject_definitions:\n<Subject 1>: a.\n";
    const issues = validatePrompt(text, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V2" && i.severity === 2)).toBe(true);
  });
  it("t2va 带指令行 → V3 2 分；i2va 缺指令行 → V3 2 分", () => {
    const withInstruction = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Facing: x. y.\n\noverall_soundscape: a.\n\nnon_diegetic_music: b.\n";
    expect(validatePrompt(withInstruction, { taskType: "t2va" }).some((i) => i.code === "V3")).toBe(true);
    const without = "integrated_multimodal_description: [Shot 1] Facing: x. y.\n\noverall_soundscape: a.\n\nnon_diegetic_music: b.\n";
    expect(validatePrompt(without, { taskType: "i2va" }).some((i) => i.code === "V3" && i.severity === 2)).toBe(true);
  });
  it("排除行不在最后一行 → V4 2 分", () => {
    const text = "subject_definitions:\n<Subject 1>: a.\nNo subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.\n\nsummary:\n[reference generation] x\n";
    const issues = validatePrompt(text, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V4" && i.severity === 2)).toBe(true);
  });
  it("t2va 正文含参考标签 → V6 2 分", () => {
    const text = "integrated_multimodal_description: [Shot 1] <Picture 1> shows a. Facing: x.\n\noverall_soundscape: a.\n\nnon_diegetic_music: b.\n";
    const issues = validatePrompt(text, { taskType: "t2va" });
    expect(issues.some((i) => i.code === "V6" && i.severity === 2)).toBe(true);
  });
  it("parsePrompt 切段正确", () => {
    const parsed = parsePrompt("subject_definitions:\na\nsummary:\nb\n");
    expect(parsed.sections.map((s) => s.name)).toEqual(["subject_definitions", "summary"]);
    expect(parsed.sections[0]?.body).toBe("a");
    expect(parsed.sections[1]?.body).toBe("b");
  });
});

describe("M4-2 编号契约层", () => {
  const base = "subject_definitions:\n<Subject 1>: a.\n`first_frame`: b.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1>: fully_preserved - c.\n\ndetailed_description:\n[Shot 1] opens exactly on the first_frame image. d.\n\noverall_soundscape: e.\n\nnon_diegetic_music: N/A\n";
  it("空格版 `first frame` → V8 2 分", () => {
    const issues = validatePrompt(base.replace("`first_frame`", "`first frame`"), { taskType: "hybrid" });
    expect(issues.some((i) => i.code === "V8" && i.severity === 2)).toBe(true);
  });
  it("编号总数 ≠ expectedPictures → V12 2 分", () => {
    const issues = validatePrompt(base, { taskType: "hybrid", expectedPictures: 2 });
    expect(issues.some((i) => i.code === "V12")).toBe(true);
  });
  it("首个 Picture 引用不是 1 → V11 2 分", () => {
    const issues = validatePrompt(base.replace("<Subject 1>: a.", "<Picture 2>: a."), { taskType: "hybrid" });
    expect(issues.some((i) => i.code === "V11" && i.severity === 2)).toBe(true);
  });
  it("关键帧写成 <Subject N> → V10 2 分", () => {
    const issues = validatePrompt(base.replace("`first_frame`: b.", "`first_frame` <Subject 2>: b."), { taskType: "hybrid" });
    expect(issues.some((i) => i.code === "V10" && i.severity === 2)).toBe(true);
  });
  it("Hybrid 缺关键帧 → V14 2 分", () => {
    const noFrame = base.replace("`first_frame`: b.\n", "").replace("opens exactly on the first_frame image. ", "");
    const issues = validatePrompt(noFrame, { taskType: "hybrid" });
    expect(issues.some((i) => i.code === "V14" && i.severity === 2)).toBe(true);
  });
});

describe("M4-3 连贯层", () => {
  const detail = "subject_definitions:\n<Subject 1>: a.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1>: fully_preserved - c.\n\ndetailed_description:\n[Shot 1] d.\n\noverall_soundscape: e.\n\nnon_diegetic_music: N/A\n";
  it("禁写清单命中 → V16 2 分", () => {
    const bad = detail.replace("[Shot 1] d.", "[Shot 1] The camera holds still on the image for a beat, then d.");
    const issues = validatePrompt(bad, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V16" && i.severity === 2)).toBe(true);
  });
  it("有 previous 标记但缺承接/下接 → V17 2 分", () => {
    const bad = detail.replace("[Shot 1] d.", "[Shot 1] continues from previous shot. d.");
    const issues = validatePrompt(bad, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V17" && i.severity === 2)).toBe(true);
  });
});

describe("M4-4 内容层", () => {
  const detail = "subject_definitions:\n<Subject 1>: a.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1>: fully_preserved - c.\n\ndetailed_description:\n[Shot 1] Facing: left of frame. <d>[Chinese]你好。</d> she says.\n\noverall_soundscape: e.\n\nnon_diegetic_music: N/A\n";
  it("剧本台词缺失 → V19 2 分", () => {
    const issues = validatePrompt(detail, { taskType: "ref2va", scriptLines: ["你好。", "再见。"] });
    const misses = issues.filter((i) => i.code === "V19" && i.severity === 2);
    expect(misses.length).toBe(1);
    expect(misses[0]?.message).toContain("再见。");
  });
  it("无 Facing: 前缀 → V20 1 分", () => {
    const bad = detail.replace("Facing: left of frame. ", "");
    const issues = validatePrompt(bad, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V20" && i.severity === 1)).toBe(true);
  });
});

describe("M4-5 声音层", () => {
  const detail = "subject_definitions:\n<Subject 1>: a.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1> (S1): fully_preserved - c.\n\ndetailed_description:\n[Shot 1] Facing: x. <d>[Chinese]你好。</d>\n\noverall_soundscape: e.\n\nnon_diegetic_music: N/A\n";
  it("retention_analysis 含 (S → V24 2 分", () => {
    const issues = validatePrompt(detail, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V24" && i.severity === 2)).toBe(true);
  });
  it("(Sx) 跳号 → V23 2 分", () => {
    const bad = detail.replace("retention_analysis:", "retention_analysis:\n(S2) engine hum.");
    const issues = validatePrompt(bad, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V23" && i.severity === 2)).toBe(true);
  });
  it("non_diegetic_music 抽象情绪词 → V26 1 分", () => {
    const bad = detail.replace("non_diegetic_music: N/A", "non_diegetic_music: ethereal pads, dreamy texture.");
    const issues = validatePrompt(bad, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V26" && i.severity === 1)).toBe(true);
  });
});

describe("M4-6 语言层", () => {
  it("字段值含中文 → V27 2 分", () => {
    const text = "subject_definitions:\n<Subject 1>: a.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1>: fully_preserved - c.\n\ndetailed_description:\n[Shot 1] Facing: x. <d>[Chinese]你好。</d>\n\noverall_soundscape: 环境声\n\nnon_diegetic_music: N/A\n";
    const issues = validatePrompt(text, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V27" && i.severity === 2)).toBe(true);
  });
  it("台词在 <d> 外 → V30 2 分", () => {
    const text = "subject_definitions:\n<Subject 1>: a.\n\nsummary:\n[reference generation] x\n\nretention_analysis:\n<Subject 1>: fully_preserved - c.\n\ndetailed_description:\n[Shot 1] Facing: x. 她说你好。\n\noverall_soundscape: e.\n\nnon_diegetic_music: N/A\n";
    const issues = validatePrompt(text, { taskType: "ref2va" });
    expect(issues.some((i) => i.code === "V30" && i.severity === 2)).toBe(true);
  });
});
