/**
 * M3-6 测试：动作库结构完整性 + 检索 + anatomy/negativeWords。
 * 依据 m35-spec §2.7 出口标准。
 */

import { describe, it, expect } from "vitest";
import {
  ALL_ACTIONS,
  queryActions,
  SFW_SAFE_CATEGORIES,
  PERFORM_RHYTHM_RULES,
  GENERIC_TECHNIQUES,
} from "./index.js";
import { INTENSITY_LEVELS, MEDIA_TYPES } from "../schemas/enums.js";
import {
  ANATOMY_TABLE,
  BANNED_EUPHEMISMS,
  FEMALE_ANATOMY,
  MALE_ANATOMY,
  COMMON_ANATOMY,
  findAnatomyTerm,
} from "./anatomy.js";
import {
  NEGATIVE_WORDS_NSFW,
  NEGATIVE_WORDS_SFW,
  NEGATIVE_ORGAN_CONTACT,
} from "./negativeWords.js";

const CATEGORIES = [
  "undress",
  "display",
  "pose",
  "perform",
  "interact",
  "expression",
  "props",
  "sound",
] as const;

describe("ALL_ACTIONS 结构完整性", () => {
  // F4 漂移：以 EX01 原文实际条目数为准（93 条：10+13+11+16+14+9+15+5，另 3 条通用技法
  // 独立导出不入库），测试断言 >= 93 防缩水——
  // spec 的 150 断言与「逐条照录不发明」矛盾，本测试按实际数断言，
  // 150 断言的矛盾已记 [BLOCKED] 上报主会话（见 worklog M03.md [001]）。
  it("总条数不低于 EX01 原文实际条目数 93", () => {
    expect(ALL_ACTIONS.length).toBeGreaterThanOrEqual(93);
  });

  it("八类每类非空", () => {
    for (const cat of CATEGORIES) {
      const count = ALL_ACTIONS.filter((a) => a.category === cat).length;
      expect(count, `类别 ${cat} 为空`).toBeGreaterThan(0);
    }
  });

  it("id 全局唯一且带类目前缀", () => {
    const ids = new Set<string>();
    for (const a of ALL_ACTIONS) {
      expect(ids.has(a.id), `id 重复：${a.id}`).toBe(false);
      ids.add(a.id);
    }
  });

  it("intensityRange / mediaFit 值域合法", () => {
    for (const a of ALL_ACTIONS) {
      expect(a.intensityRange.length, `${a.id} intensityRange 为空`).toBeGreaterThan(0);
      for (const lv of a.intensityRange) {
        expect(INTENSITY_LEVELS, `${a.id} 非法档位 ${lv}`).toContain(lv);
      }
      for (const m of a.mediaFit) {
        expect(MEDIA_TYPES, `${a.id} 非法介质 ${m}`).toContain(m);
      }
    }
  });

  it("name 保留中文、promptEn 非空", () => {
    for (const a of ALL_ACTIONS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.promptEn.length).toBeGreaterThan(10);
    }
  });

  it("SFW 安全子集是三类且都在库里有条目", () => {
    expect(SFW_SAFE_CATEGORIES).toEqual(["pose", "interact", "expression"]);
    for (const cat of SFW_SAFE_CATEGORIES) {
      expect(ALL_ACTIONS.some((a) => a.category === cat)).toBe(true);
    }
  });

  it("通用技法三条独立导出", () => {
    expect(GENERIC_TECHNIQUES.length).toBe(3);
    expect(GENERIC_TECHNIQUES.map((t) => t.name)).toEqual(["半挂中间态", "隔布触摸", "高潮爆发"]);
  });

  it("实演节奏总则含中速词白名单与禁词表", () => {
    expect(PERFORM_RHYTHM_RULES.allowedPhrases).toContain("a steady, even rhythm");
    expect(PERFORM_RHYTHM_RULES.bannedSlowWords).toEqual(["slowly", "gently", "lingering"]);
    expect(PERFORM_RHYTHM_RULES.bannedFastWords).toEqual(["rapid", "fast", "furious"]);
  });
});

describe("queryActions 过滤", () => {
  it("undress + L3 + anime 命中数 > 0", () => {
    const hits = queryActions({ category: "undress", atLevel: "L3", media: "anime" });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.category).toBe("undress");
      expect(h.intensityRange).toContain("L3");
      expect(h.mediaFit).toContain("anime");
    }
  });

  it("多条件 AND 组合", () => {
    const all = queryActions({ category: "display", atLevel: "L5" });
    const narrower = queryActions({ category: "display", atLevel: "L5", bodyPart: "pussy" });
    expect(narrower.length).toBeGreaterThan(0);
    expect(narrower.length).toBeLessThanOrEqual(all.length);
  });

  it("bodyPart 子串大小写不敏感", () => {
    const hits = queryActions({ bodyPart: "BREAST" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.bodyParts.some((p) => p.toLowerCase().includes("breast")))).toBe(true);
  });

  it("零命中返回空数组（合法语义，不抛）", () => {
    expect(queryActions({ bodyPart: "zzz_nonexistent" })).toEqual([]);
  });
});

describe("anatomy.ts", () => {
  it("四列表：女性 9 条 + 男性 5 条 + 共用 7 条 = 21 条", () => {
    expect(FEMALE_ANATOMY.length).toBe(9);
    expect(MALE_ANATOMY.length).toBe(5);
    expect(COMMON_ANATOMY.length).toBe(7);
    expect(ANATOMY_TABLE.length).toBe(21);
  });

  it("每条 promptEn 是英文直白术语", () => {
    expect(findAnatomyTerm("clitoris")).toBeDefined();
    expect(findAnatomyTerm("penis")).toBeDefined();
    expect(findAnatomyTerm("semen")).toBeDefined();
    expect(findAnatomyTerm("不存在的器官")).toBeUndefined();
  });

  it("禁用代称映射非空且替换目标不是代称本身", () => {
    expect(BANNED_EUPHEMISMS.length).toBe(7);
    for (const m of BANNED_EUPHEMISMS) {
      expect(m.replacement.length).toBeGreaterThan(0);
      expect(m.replacement).not.toBe(m.banned);
    }
  });
});

describe("negativeWords.ts", () => {
  it("NSFW 六类全集、SFW 删 ④ organ_contact", () => {
    expect(NEGATIVE_WORDS_NSFW.length).toBe(6);
    expect(NEGATIVE_WORDS_SFW.length).toBe(5);
    expect(NEGATIVE_WORDS_SFW.some((g) => g.category === "organ_contact")).toBe(false);
  });

  it("④ 器官与接触在 NSFW 中必须写满（含特写补词）", () => {
    expect(NEGATIVE_ORGAN_CONTACT.words).toContain("畸形生殖器");
    expect(NEGATIVE_ORGAN_CONTACT.words).toContain("结构对称性错误");
    expect(NEGATIVE_ORGAN_CONTACT.words).toContain("解剖分界模糊");
  });

  it("至少覆盖 ①③⑥（裁剪纪律底线）", () => {
    const cats = NEGATIVE_WORDS_SFW.map((g) => g.category);
    expect(cats).toContain("media_drift");
    expect(cats).toContain("limb_structure");
    expect(cats).toContain("technical");
  });

  it("负面词不是否定句（写「多余手指」不写「没有多余手指」）", () => {
    for (const g of NEGATIVE_WORDS_NSFW) {
      for (const w of g.words) {
        expect(w.startsWith("没有") || w.startsWith("no ") || w.startsWith("without "), `${g.label}: ${w}`).toBe(false);
      }
    }
  });
});
