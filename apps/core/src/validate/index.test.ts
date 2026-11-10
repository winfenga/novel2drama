// M4 出口标准测试：零告警基准（EX05 L33-52 / EX06 L68-76 骨架结构）+ 三错注入
import { describe, expect, it } from "vitest";
import { validatePrompt } from "./index.js";

// 零告警基准：Ref2VA 六段成品骨架（EX05 L33-52 的结构还原，内容为占位）
const EX05_SKELETON = `subject_definitions:
<Subject 1>: the adult woman whose identity and appearance come from <Picture 1>.
<Picture 2>: the second reference image for [Shot 1].

summary:
[reference generation] The target video references the uploaded material.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - face, hair and outfit preserved.
<Picture 2> (reference image for [Shot 1]): fully_preserved - framing preserved.

detailed_description:
The target video uses a live-action cinematic style. Facing: the woman stands in the left half of the frame, in full profile relative to the camera, facing the man on the right.
[Shot 1] The frame opens on the two of them: the woman turns her head toward the man, pivoting on her heel, and <d>[Chinese]你终于回来了。</d> she says while her lips move naturally.

overall_soundscape: Quiet room tone with soft cloth rustle and distant street ambience.

non_diegetic_music: N/A

No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.
`;

// 零告警基准：I2VA 三字段成品骨架（EX06 L68-76 的结构还原，内容为占位）
const EX06_SKELETON = `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Facing: the woman is centered in frame, in full frontal view relative to the camera. She steps forward on her toes, turning her shoulders toward the door, pivoting smoothly. <d>[Chinese]别走。</d> she says.

overall_soundscape: Soft footsteps on wood flooring and faint wind against the window.

non_diegetic_music: Solo piano, slow tempo, sparse notes with a gradual diminuendo.
`;

// Hybrid 六段骨架（编号契约层 + 连贯层的正向基准）
const HYBRID_SKELETON = `subject_definitions:
<Subject 1>: the adult woman whose identity and appearance come from <Picture 1>.
\`first_frame\`: the opening frame of [Shot 1], framing and composition follow this image.

summary:
[reference generation] The target video combines a keyframe and reference material.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - face and outfit preserved.
\`first_frame\`: fully_preserved - composition preserved.

detailed_description:
The target video uses a live-action cinematic style. Facing: the woman stands on the left of the frame, in three-quarter view relative to the camera, facing the door on the right.
[Shot 1] The sequence opens exactly on the first_frame image. The woman pushes the door open and <d>[Chinese]我回来了。</d> she says while stepping inside.

overall_soundscape: Door hinges creak, floorboards creak softly, room tone.

non_diegetic_music: N/A

No subtitles, no watermarks, no additional on-screen text, no extra characters entering the frame.
`;

describe("M4 零告警基准", () => {
  it("EX05 Ref2VA 六段骨架 → 0 个 severity≥1", () => {
    const issues = validatePrompt(EX05_SKELETON, { taskType: "ref2va" });
    const real = issues.filter((i) => i.severity >= 1);
    expect(real, JSON.stringify(real)).toEqual([]);
  });

  it("EX06 I2VA 三字段骨架 → 0 个 severity≥1", () => {
    const issues = validatePrompt(EX06_SKELETON, { taskType: "i2va" });
    const real = issues.filter((i) => i.severity >= 1);
    expect(real, JSON.stringify(real)).toEqual([]);
  });

  it("Hybrid 六段骨架 → 0 个 severity≥1", () => {
    const issues = validatePrompt(HYBRID_SKELETON, { taskType: "hybrid", expectedPictures: 1 });
    const real = issues.filter((i) => i.severity >= 1);
    expect(real, JSON.stringify(real)).toEqual([]);
  });
});

describe("M4 三错注入", () => {
  it("① 关键帧写成 <Picture 1> → 编号契约 2 分", () => {
    const bad = HYBRID_SKELETON.replace("`first_frame`: the opening frame of [Shot 1], framing and composition follow this image.", "`first_frame` <Picture 1>: the opening frame of [Shot 1].");
    const issues = validatePrompt(bad, { taskType: "hybrid", expectedPictures: 1 });
    const hit = issues.filter((i) => i.code === "V9" && i.severity === 2);
    expect(hit.length, JSON.stringify(issues)).toBeGreaterThanOrEqual(1);
  });

  it("② 删掉开场动作句 → 连贯层 2 分", () => {
    const bad = HYBRID_SKELETON.replace("The sequence opens exactly on the first_frame image. ", "");
    const issues = validatePrompt(bad, { taskType: "hybrid" });
    const hit = issues.filter((i) => i.code === "V15" && i.severity === 2);
    expect(hit.length, JSON.stringify(issues)).toBe(1);
  });

  it("③ soundscape 抄台词 → 声音层 1 分", () => {
    const bad = HYBRID_SKELETON.replace(
      "overall_soundscape: Door hinges creak, floorboards creak softly, room tone.",
      "overall_soundscape: 我回来了 door hinges creak, floorboards creak softly.",
    );
    const issues = validatePrompt(bad, { taskType: "hybrid" });
    const hit = issues.filter((i) => i.code === "V25" && i.severity === 1);
    expect(hit.length, JSON.stringify(issues)).toBeGreaterThanOrEqual(1);
  });
});
