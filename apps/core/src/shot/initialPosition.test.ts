import { describe, it, expect } from "vitest";
import {
  validateInitialPosition,
  parseAsciiLayout,
  type InitialPosition,
} from "./initialPosition.js";

function pos(overrides: Partial<InitialPosition>): InitialPosition {
  return {
    shotId: "S01",
    entries: [{ ref: "CH-01", kind: "character", position: "左侧", facing: "前", pose: "站" }],
    layout: null,
    ...overrides,
  };
}

describe("validateInitialPosition（E3 规则校验器）", () => {
  it("合法位置 → ok=true", () => {
    const r = validateInitialPosition(pos({}));
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("空条目 → 违规", () => {
    const r = validateInitialPosition(pos({ entries: [] }));
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toContain("初始位置为空");
  });

  it("position 不含方位词 → 违规", () => {
    const r = validateInitialPosition(
      pos({ entries: [{ ref: "CH-01", kind: "character", position: "神秘的地方" }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toContain("CH-01");
    expect(r.violations[0]).toContain("方位词");
  });

  it("ASCII 站位图可解析", () => {
    const layout = parseAsciiLayout([
      "+-----+",
      "|@CH-01  @PR-02|",
      "+-----+",
    ]);
    const r = validateInitialPosition(
      pos({
        entries: [
          { ref: "CH-01", kind: "character", position: "中央" },
          { ref: "PR-02", kind: "prop", position: "桌后" },
        ],
        layout,
      }),
    );
    expect(r.ok).toBe(true);
    expect(layout.markers.get("CH-01")).toBe("@CH-01");
    expect(layout.markers.get("PR-02")).toBe("@PR-02");
  });

  it("ASCII 图标记不在方位条目中 → 违规", () => {
    const layout = parseAsciiLayout(["|@CH-09|"]);
    const r = validateInitialPosition(pos({ layout }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes("CH-09"))).toBe(true);
  });

  it("ASCII 图含不可解析字符 → 违规", () => {
    const layout = parseAsciiLayout(["|@CH-01\u0001|"]);
    const r = validateInitialPosition(pos({ layout }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes("不可解析"))).toBe(true);
  });

  it("scene_anchor 条目不计入非空要求", () => {
    const r = validateInitialPosition(
      pos({ entries: [{ ref: "SC-01", kind: "scene_anchor", position: "中央" }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toContain("初始位置为空");
  });
});

describe("parseAsciiLayout", () => {
  it("无标记 → markers 为空", () => {
    const l = parseAsciiLayout(["|  |"]);
    expect(l.markers.size).toBe(0);
  });

  it("同一 ref 重复出现只记一次", () => {
    const l = parseAsciiLayout(["@CH-01 xxx @CH-01"]);
    expect(l.markers.size).toBe(1);
  });
});
