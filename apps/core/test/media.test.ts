/**
 * M7 测试：deriveTaskType / materialCheck / frames / refVideo / workflow。
 * spec §3.3 重点用例全覆盖。纯函数，不发网络请求。
 */

import { describe, expect, it } from "vitest";

import { deriveTaskType, type RefItem } from "../src/media/deriveTaskType.js";
import { checkMaterials } from "../src/media/materialCheck.js";
import { framesToSeconds, secondsToFrames } from "../src/media/frames.js";
import { alignRefVideo } from "../src/media/refVideo.js";
import { pickWorkflowFile } from "../src/media/workflow.js";

const img = (role: RefItem["role"]): RefItem => ({ role, kind: "image" });
const vid = (role: RefItem["role"]): RefItem => ({ role, kind: "video" });

// ── M7-1 deriveTaskType ──

describe("deriveTaskType", () => {
  it("空 refs → t2va", () => {
    expect(deriveTaskType([])).toBe("t2va");
  });

  it("只有 first → i2va", () => {
    expect(deriveTaskType([img("first")])).toBe("i2va");
  });

  it("只有 last → l2va", () => {
    expect(deriveTaskType([img("last")])).toBe("l2va");
  });

  it("first + last → fl2va", () => {
    expect(deriveTaskType([img("first"), img("last")])).toBe("fl2va");
  });

  it("只有参考（character 图）→ ref2va", () => {
    expect(deriveTaskType([img("character")])).toBe("ref2va");
  });

  it("只有参考（scene 图）→ ref2va", () => {
    expect(deriveTaskType([img("scene")])).toBe("ref2va");
  });

  it("参考视频 → ref2va", () => {
    expect(deriveTaskType([vid("auto")])).toBe("ref2va");
  });

  it("判定顺序：refs=[first, character] → hybrid 不是 ref2va", () => {
    expect(deriveTaskType([img("first"), img("character")])).toBe("hybrid");
  });

  it("判定顺序：last + video 参考 → hybrid（hybrid 最高优先）", () => {
    expect(deriveTaskType([img("last"), vid("auto")])).toBe("hybrid");
  });

  it("audio 也算参考素材", () => {
    expect(deriveTaskType([{ role: "auto", kind: "audio" }])).toBe("ref2va");
    expect(deriveTaskType([img("first"), { role: "auto", kind: "audio" }])).toBe("hybrid");
  });

  it("auto role 的图不算参考素材（口径与 ARCH hasRefs 一致）", () => {
    expect(deriveTaskType([img("auto")])).toBe("t2va");
  });
});

// ── M7-2 checkMaterials：唯一一张表 ──

describe("checkMaterials", () => {
  it("t2va 无媒体 → ok", () => {
    expect(checkMaterials("t2va", [])).toEqual({ ok: true });
  });

  it("t2va 带媒体 → invalid_task_type_for_media", () => {
    const r = checkMaterials("t2va", [img("first")]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_task_type_for_media");
  });

  it("i2va 缺 first 帧 → missing_reference_image", () => {
    expect(checkMaterials("i2va", [])).toMatchObject({ ok: false, code: "missing_reference_image" });
    expect(checkMaterials("i2va", [img("last")])).toMatchObject({ ok: false, code: "missing_reference_image" });
  });

  it("l2va 缺 last 帧 → missing_reference_image", () => {
    expect(checkMaterials("l2va", [img("first")])).toMatchObject({ ok: false, code: "missing_reference_image" });
  });

  it("i2va 带参考素材 → invalid_task_type_for_media（不改路）", () => {
    expect(checkMaterials("i2va", [img("first"), img("character")])).toMatchObject({
      ok: false,
      code: "invalid_task_type_for_media",
    });
  });

  it("i2va 合法：恰好 1 张 first、无参考 → ok", () => {
    expect(checkMaterials("i2va", [img("first")])).toEqual({ ok: true });
  });

  it("fl2va 缺首/尾 → missing_reference_image", () => {
    expect(checkMaterials("fl2va", [img("first")])).toMatchObject({ ok: false, code: "missing_reference_image" });
    expect(checkMaterials("fl2va", [])).toMatchObject({ ok: false, code: "missing_reference_image" });
  });

  it("fl2va 带参考 → invalid_task_type_for_media", () => {
    expect(checkMaterials("fl2va", [img("first"), img("last"), img("scene")])).toMatchObject({
      ok: false,
      code: "invalid_task_type_for_media",
    });
  });

  it("fl2va 合法 → ok", () => {
    expect(checkMaterials("fl2va", [img("first"), img("last")])).toEqual({ ok: true });
  });

  it("ref2va 无素材 → missing_reference_media", () => {
    expect(checkMaterials("ref2va", [])).toMatchObject({ ok: false, code: "missing_reference_media" });
  });

  it("ref2va 带关键帧 → invalid_task_type_for_media", () => {
    expect(checkMaterials("ref2va", [img("character"), img("first")])).toMatchObject({
      ok: false,
      code: "invalid_task_type_for_media",
    });
  });

  it("ref2va 合法 → ok", () => {
    expect(checkMaterials("ref2va", [img("character")])).toEqual({ ok: true });
    expect(checkMaterials("ref2va", [vid("auto")])).toEqual({ ok: true });
  });

  it("ref2va 超限额：图 >6 / 音频 >2 / 视频 >1 → invalid_param", () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map(() => img("character"));
    expect(checkMaterials("ref2va", seven)).toMatchObject({ ok: false, code: "invalid_param" });
    const threeAudios: RefItem[] = [
      { role: "auto", kind: "audio" },
      { role: "auto", kind: "audio" },
      { role: "auto", kind: "audio" },
    ];
    expect(checkMaterials("ref2va", threeAudios)).toMatchObject({ ok: false, code: "invalid_param" });
    expect(checkMaterials("ref2va", [vid("auto"), vid("auto")])).toMatchObject({ ok: false, code: "invalid_param" });
  });

  it("hybrid 只有关键帧（缺参考素材）→ hybrid_needs_reference", () => {
    expect(checkMaterials("hybrid", [img("first")])).toMatchObject({ ok: false, code: "hybrid_needs_reference" });
  });

  it("hybrid 只有参考（缺关键帧）→ hybrid_needs_keyframe", () => {
    expect(checkMaterials("hybrid", [img("character")])).toMatchObject({ ok: false, code: "hybrid_needs_keyframe" });
  });

  it("hybrid 两类齐 → ok（参考沿用 ref2va 限额）", () => {
    expect(checkMaterials("hybrid", [img("first"), img("character")])).toEqual({ ok: true });
    // 7 张参考图超限额
    const seven = [img("first"), ...[1, 2, 3, 4, 5, 6, 7].map(() => img("character"))];
    expect(checkMaterials("hybrid", seven)).toMatchObject({ ok: false, code: "invalid_param" });
  });

  it("同一 role 标两次（两张首帧）→ duplicate_frame_role", () => {
    expect(checkMaterials("i2va", [img("first"), img("first")])).toMatchObject({
      ok: false,
      code: "duplicate_frame_role",
    });
    expect(checkMaterials("fl2va", [img("first"), img("first"), img("last")])).toMatchObject({
      ok: false,
      code: "duplicate_frame_role",
    });
  });
});

// ── M7-3 frames ──

describe("secondsToFrames", () => {
  it("向上对齐到 17n+5 网格（裁决：spec §3.3 用例为准，见 frames.ts 头注释）", () => {
    // raw=120 → n=ceil(115/17)=7 → 124（api-contract L972：5→124，误差 +0.17s）
    expect(secondsToFrames(5)).toBe(124);
    expect(secondsToFrames(10)).toBe(243);
    expect(secondsToFrames(15)).toBe(362);
    // 12 秒（raw=288 → n=ceil(283/17)=17 → 294 帧 = 12.25s，正偏差 +0.25s）
    expect(secondsToFrames(12)).toBe(294);
  });

  it("0.5 秒粒度输入：向上取整方向", () => {
    // raw = 12 < 17+5 → n = ceil(7/17) = 1 → 22 帧（0.5s → 最小非零网格档）
    expect(secondsToFrames(0.5)).toBe(22);
    // raw = 36 → n = ceil(31/17) = 2 → 39 帧
    expect(secondsToFrames(1.5)).toBe(39);
  });

  it("防御性封顶 362（ARCH L1539-1541）", () => {
    expect(secondsToFrames(20)).toBe(362);
    expect(secondsToFrames(60)).toBe(362);
  });

  it("framesToSeconds 直接除 24", () => {
    expect(framesToSeconds(124)).toBeCloseTo(124 / 24);
    expect(framesToSeconds(362)).toBeCloseTo(15.0833, 3);
    expect(framesToSeconds(0)).toBe(0);
  });
});

// ── M7-4 refVideo ──

describe("alignRefVideo", () => {
  it("23.4s → truncated=true、frames=362（spec 重点用例）", () => {
    expect(alignRefVideo(23.4)).toEqual({ frames: 362, truncated: true });
  });

  it("8s → truncated=false", () => {
    // raw = 192 → n = floor(187/17) = 11 → 192（192 = 17*11+5 恰好对齐）
    expect(alignRefVideo(8)).toEqual({ frames: 192, truncated: false });
  });

  it("15s 内未截断，返回值 ≤362 且为 17n+5 形状", () => {
    const r = alignRefVideo(12.3);
    expect(r.truncated).toBe(false);
    expect(r.frames).toBeLessThanOrEqual(362);
    expect((r.frames - 5) % 17).toBe(0);
  });

  it("零/负时长 → frames=0", () => {
    expect(alignRefVideo(0)).toEqual({ frames: 0, truncated: false });
    expect(alignRefVideo(-3)).toEqual({ frames: 0, truncated: false });
  });
});

// ── M7-5 workflow ──

describe("pickWorkflowFile", () => {
  it("characterSwap 优先 → swap-vdn（spec 重点用例）", () => {
    expect(pickWorkflowFile({ characterSwap: true, useVdn: false, vdnAdapterAvailable: false })).toBe(
      "h3-character-swap-vdn.json",
    );
    expect(pickWorkflowFile({ characterSwap: true, useVdn: true, vdnAdapterAvailable: true })).toBe(
      "h3-character-swap-vdn.json",
    );
  });

  it("useVdn && adapter → vdn", () => {
    expect(pickWorkflowFile({ characterSwap: false, useVdn: true, vdnAdapterAvailable: true })).toBe(
      "h3-ref2va-drama-vdn.json",
    );
  });

  it("无 vdn → 原链路", () => {
    expect(pickWorkflowFile({ characterSwap: false, useVdn: false, vdnAdapterAvailable: false })).toBe(
      "h3-ref2va-drama.json",
    );
    expect(pickWorkflowFile({ characterSwap: false, useVdn: false, vdnAdapterAvailable: true })).toBe(
      "h3-ref2va-drama.json",
    );
  });

  it("useVdn 但缺 adapter → 回退无 vdn，不报错（spec 重点用例）", () => {
    expect(pickWorkflowFile({ characterSwap: false, useVdn: true, vdnAdapterAvailable: false })).toBe(
      "h3-ref2va-drama.json",
    );
  });
});
