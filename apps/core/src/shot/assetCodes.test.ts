import { describe, it, expect } from "vitest";
import {
  assignAssetCodes,
  pickAssetBoardTemplate,
  sceneAnchorLayout,
} from "./assetCodes.js";

describe("assignAssetCodes", () => {
  it("按首次出现顺序分配 SC→CH→PR 两位数编号", () => {
    const r = assignAssetCodes([
      { type: "scene", name: "客厅" },
      { type: "character", name: "林晚" },
      { type: "prop", name: "茶杯" },
    ]);
    expect(r.codes.get("客厅")).toBe("SC-01");
    expect(r.codes.get("林晚")).toBe("CH-01");
    expect(r.codes.get("茶杯")).toBe("PR-01");
    expect(r.codes.size).toBe(3);
  });

  it("同类多个资产递增编号", () => {
    const r = assignAssetCodes([
      { type: "character", name: "林晚" },
      { type: "character", name: "陈默" },
      { type: "scene", name: "客厅" },
      { type: "scene", name: "天台" },
    ]);
    expect(r.codes.get("林晚")).toBe("CH-01");
    expect(r.codes.get("陈默")).toBe("CH-02");
    expect(r.codes.get("客厅")).toBe("SC-01");
    expect(r.codes.get("天台")).toBe("SC-02");
  });

  it("先人物/场景后道具：道具首次出现早也延后编号", () => {
    const r = assignAssetCodes([
      { type: "prop", name: "茶杯" },
      { type: "character", name: "林晚" },
    ]);
    expect(r.codes.get("林晚")).toBe("CH-01");
    expect(r.codes.get("茶杯")).toBe("PR-01");
  });

  it("同资产二次出现不重分配", () => {
    const r = assignAssetCodes([
      { type: "character", name: "林晚" },
      { type: "character", name: "陈默" },
      { type: "character", name: "林晚" },
    ]);
    expect(r.codes.get("林晚")).toBe("CH-01");
    expect(r.codes.size).toBe(2);
  });

  it("状态变体 -A/-B/-C 按首次出现顺序", () => {
    const r = assignAssetCodes([
      { type: "scene", name: "客厅", variant: "白天" },
      { type: "scene", name: "客厅", variant: "黑夜" },
      { type: "scene", name: "客厅", variant: "损毁" },
      { type: "scene", name: "客厅", variant: "白天" }, // 重复变体不新增字母
      { type: "scene", name: "客厅" }, // 无变体回基础编号
    ]);
    expect(r.codes.get("客厅")).toBe("SC-01");
    const variants = r.entries.map((e) => e.code);
    expect(variants).toContain("SC-01-A");
    expect(variants).toContain("SC-01-B");
    expect(variants).toContain("SC-01-C");
    expect(r.entries.filter((e) => e.code === "SC-01-A").length).toBe(1);
    expect(r.entries[r.entries.length - 1]!.code).toBe("SC-01");
  });
});

describe("pickAssetBoardTemplate（D4）", () => {
  it("默认 C（3D 国漫标签式）", () => {
    expect(pickAssetBoardTemplate("anime")).toBe("C");
    expect(pickAssetBoardTemplate("2.5D")).toBe("C");
    expect(pickAssetBoardTemplate("illustration")).toBe("C");
  });

  it("mediaLock realistic → A（GPT_IMAGE 真人定妆）", () => {
    expect(pickAssetBoardTemplate("realistic")).toBe("A");
  });

  it("永不返回 B（H3 六段式不用于出静图）", () => {
    for (const m of ["anime", "2.5D", "realistic", "illustration"]) {
      expect(pickAssetBoardTemplate(m)).not.toBe("B");
    }
  });
});

describe("sceneAnchorLayout（D5）", () => {
  it("俯视平面图必出，60/20/20", () => {
    const l = sceneAnchorLayout();
    expect(l.main).toBe(0.6);
    expect(l.aux).toBe(0.2);
    expect(l.topDown).toBe(0.2);
    expect(l.main + l.aux + l.topDown).toBeCloseTo(1);
  });
});
