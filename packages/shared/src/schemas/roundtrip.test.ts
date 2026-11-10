/**
 * M1-8 收口验收矩阵（m1-spec §4，14 条）。
 *
 * 归属：Block C。判据以 m1-spec §4 表格为准；L4/L5 visualState 断言以
 * nsfw.ts 的 INTENSITY_LEVEL_TABLE 文字为准（遮挡降级裁决，2026-11-10）。
 *
 * 用例 1 的样例是「形状权威 × 校验权威一一对应」的证明：一份完整 Project
 * （SFW + NSFW 双 Shot）走 JSON.stringify → JSON.parse → safeParse 全程通过。
 */

import { describe, expect, it } from "vitest";

import {
  // 项目层
  projectSchema,
  sceneSchema,
  sniffSourceKind,
  // 角色
  voiceProfileSchema,
  // 提示词
  videoPromptSchema,
  imagePromptSetSchema,
  suggestShell,
  // 分镜
  shotSchema,
  // NSFW
  INTENSITY_LEVEL_TABLE,
  refineShotPolicy,
  // 资产
  assetSchema,
  ASSET_CODE_RE,
} from "../index.js";
import type { Project, Scene, Shot } from "../index.js";

// ─────────────────────────────────────────────────────────────
// 样例构造：完整 Project（1 Episode → 1 Scene → 2 Shot，SFW + NSFW）
// ─────────────────────────────────────────────────────────────

/** SFW 六段壳（ref2va）视频提示词 */
const sixSectionPrompt = {
  shell: "six-section" as const,
  subjectDefinitions: "林晚：黑发少女，主角。陈默：灰衣青年，配角。",
  summary: "林晚在雨夜的巷口遇见陈默。",
  retentionAnalysis: "fully_preserved",
  detailedDescription: "雨滴沿檐角坠落，林晚收伞回眸，路灯在她发梢描出暖边。",
  overallSoundscape: "细雨声、远处车流、伞布收拢的闷响。",
  nonDiegeticMusic: "低弦乐渐入，C 小调。",
  exclusionLine: "不出现文字、水印、字幕。",
};

/** NSFW 三字段壳（l2va）视频提示词 */
const threeFieldPrompt = {
  shell: "three-field" as const,
  instructionLine: "首帧为锚点，仅缓慢推进。",
  integratedMultimodalDescription: "室内暖灯，少女侧卧，呼吸起伏渐急。",
  overallSoundscape: "布料摩擦、浅促呼吸。",
  nonDiegeticMusic: "环境垫乐，极低音量。",
  exclusionLine: "不出现文字、水印。",
};

const sfwShot: Shot = {
  id: "SH-0001",
  index: 1,
  durationSec: 8,
  shotSize: "medium",
  cameraMove: "push_in",
  facing: { toCamera: "three_quarter" },
  initialPosition: "巷口，距镜头三步，正面偏左站定",
  description: "林晚收伞回眸。",
  taskType: "ref2va",
  promptVideo: sixSectionPrompt,
  promptImage: {
    positive: "雨夜巷口，黑发少女收伞回眸，电影感",
    negative: "低质量, 模糊, 文字",
  },
  negativePrompt: "低质量, 模糊",
  contentPolicy: "sfw",
  mediaLock: "anime",
  refCharacters: ["CH-0001"],
  refAssets: [],
  pictureIndex: { "<Picture 1>": "CH-01" },
  params: { seed: 42, consistencyStrength: 0.6 },
  status: "pending",
  candidates: [],
  outputs: [],
  riskScore: 0,
};

const nsfwShot: Shot = {
  id: "SH-0002",
  index: 2,
  durationSec: 10,
  shotSize: "closeup",
  cameraMove: "static",
  facing: { toCamera: "side", frameDirection: "left" },
  initialPosition: "床沿侧卧，头部朝画面左",
  description: "暖灯下侧卧，呼吸渐急。",
  taskType: "l2va",
  promptVideo: threeFieldPrompt,
  negativePrompt: "低质量",
  contentPolicy: "nsfw",
  intensityLevel: "L2",
  moduleTypes: ["M1", "M3"],
  bodyState: [
    { dim: "breathing", grade: 2 },
    { dim: "wetness", grade: 1 },
  ],
  mediaLock: "anime",
  refCharacters: ["CH-0001"],
  refAssets: ["SC-01"],
  pictureIndex: { "<Picture 1>": "CH-01" },
  params: { durationSec: 10, seed: 7 },
  status: "pending",
  candidates: [],
  outputs: [],
  riskScore: 2,
};

function buildProject(): Project {
  return {
    id: "PRJ-0001",
    title: "雨夜巷",
    source: {
      fileName: "ch1.txt",
      text: "第一章 入巷\n\n雨下了整夜。",
      encoding: "utf-8",
      charCount: 12,
      sourceKind: "novel",
      detectedKind: "novel",
      units: [{ index: 1, title: "第一章 入巷", range: [0, 12], synthetic: false }],
    },
    settings: {
      episodeDurationSec: 90,
      dialogueRatio: 0.4,
      language: "zh",
      globalSegDurationSec: 8,
      perShotOverride: { "SH-0002": 10 },
      shotSizeBias: "balanced",
      cameraStyle: "cinematic",
      allowSlowMotion: false,
      resolution: "1080x1920",
      fps: 24,
      aspect: "9:16",
      useVDN: true,
      imageWorkflow: "qwen21:t2i",
      llmTokenBudget: 0,
    },
    episodes: [
      {
        id: "EP-01",
        index: 1,
        title: "入巷",
        summary: "林晚雨夜入巷，遇见陈默。",
        sourceRange: [0, 12],
        scenes: [
          {
            id: "SC-0001",
            index: 1,
            location: "巷口",
            timeOfDay: "night",
            characters: ["CH-0001"],
            action: "林晚收伞，发现有人跟着。",
            dialogue: [
              {
                id: "DL-0001",
                index: 1,
                speakerId: "CH-0001",
                text: "……谁在那儿？",
                emotion: "afraid",
                strength: 0.7,
                durationFactor: 1.0,
                shotId: "SH-0001",
              },
            ],
            shots: [sfwShot, nsfwShot],
          },
        ],
        status: "draft",
      },
    ],
    characters: [
      {
        id: "CH-0001",
        name: "林晚",
        aliases: ["小晚"],
        gender: "female",
        age: "20",
        appearance: "黑长发，眼尾微垂",
        outfit: "米白风衣",
        personality: "警觉而好奇",
        portraitAssetId: "AS-0001",
        voiceProfile: {
          voiceId: "wanqing",
          refAudioPath: "D:/voices/wanqing.wav",
          language: "ZH",
          defaultEmotion: "calm",
          durationFactor: 1.0,
          createdAt: 1762000000000,
        },
        consistencySeed: 12345,
        nsfwProfile: { appearanceConstraints: ["未成年特征一票否决"] },
      },
    ],
    assets: [
      {
        id: "AS-0001",
        kind: "portrait",
        assetCode: "CH-01",
        role: "identity",
        path: "D:/assets/AS-0001.png",
        url: "file:///D:/assets/AS-0001.png",
        mimeType: "image/png",
        size: 102400,
        sha256: "a".repeat(64),
        width: 1024,
        height: 1024,
        mediaType: "anime",
        source: "generated",
        workflowId: "qwen21:t2i",
        seed: 42,
        createdAt: 1762000000000,
      },
    ],
    llmUsage: { tokensIn: 1200, tokensOut: 800, budget: 100000 },
    createdAt: 1762000000000,
    updatedAt: 1762000001000,
  };
}

/** 改写一个 Shot 的浅拷贝 */
function withShot(base: Shot, patch: Partial<Shot> & Record<string, unknown>): Shot {
  return { ...base, ...patch } as Shot;
}

// ─────────────────────────────────────────────────────────────
// 14 条验收矩阵
// ─────────────────────────────────────────────────────────────

describe("m1-spec §4 验收矩阵", () => {
  // #1
  it("用例 1：完整 Project 往返（stringify → parse → safeParse），SFW+NSFW 双 Shot 全程通过", () => {
    const project = buildProject();
    const restored = JSON.parse(JSON.stringify(project)) as Project;
    const result = projectSchema.safeParse(restored);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
    // 关键字段无丢失
    const scene0 = result.data.episodes[0]?.scenes[0] as Scene | undefined;
    expect(scene0?.shots).toHaveLength(2);
    expect(scene0?.dialogue[0]?.text).toBe("……谁在那儿？");
    expect(result.data.characters[0]?.voiceProfile?.defaultEmotion).toBe("calm");
    expect(result.data.assets[0]?.assetCode).toBe("CH-01");
    // NSFW Shot 的策略字段原样保留
    const nsfw = scene0?.shots[1];
    expect(nsfw?.contentPolicy).toBe("nsfw");
    expect(nsfw?.intensityLevel).toBe("L2");
    expect(nsfw?.moduleTypes).toEqual(["M1", "M3"]);
  });

  // #2
  it("用例 2：sfw + intensityLevel → safeParse 失败", () => {
    const bad = withShot(sfwShot, { intensityLevel: "L1" });
    const r = shotSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(refineShotPolicy(bad)).toHaveLength(1);
  });

  // #3
  it("用例 3：sfw + moduleTypes → safeParse 失败", () => {
    const bad = withShot(sfwShot, { moduleTypes: ["M1"] });
    expect(shotSchema.safeParse(bad).success).toBe(false);
  });

  // #4
  it("用例 4：sfw + bodyState → safeParse 失败", () => {
    const bad = withShot(sfwShot, { bodyState: [{ dim: "breathing", grade: 1 }] });
    expect(shotSchema.safeParse(bad).success).toBe(false);
  });

  // #5
  it("用例 5：nsfw 无 intensityLevel → safeParse 失败", () => {
    const { intensityLevel: _omit, ...rest } = nsfwShot;
    const bad = rest as Shot;
    expect(shotSchema.safeParse(bad).success).toBe(false);
    expect(refineShotPolicy(bad).some((v) => v.includes("intensityLevel"))).toBe(true);
  });

  // #6
  it("用例 6：nsfw 无 moduleTypes → safeParse 失败", () => {
    const { moduleTypes: _omit, ...rest } = nsfwShot;
    const bad = rest as Shot;
    expect(shotSchema.safeParse(bad).success).toBe(false);
  });

  // #7
  it("用例 7：durationSec 4 / 16 / 7.5 → 三个都失败", () => {
    for (const d of [4, 16, 7.5]) {
      const bad = withShot(sfwShot, { durationSec: d });
      const r = shotSchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("durationSec"))).toBe(true);
      }
    }
  });

  // #8
  it("用例 8：VideoPrompt 两壳合法样例通过；three-field 塞 six-section 字段失败", () => {
    expect(videoPromptSchema.safeParse(sixSectionPrompt).success).toBe(true);
    expect(videoPromptSchema.safeParse(threeFieldPrompt).success).toBe(true);
    // 交叉赋值：三字段壳带上六段壳专属字段
    const crossed = {
      ...threeFieldPrompt,
      subjectDefinitions: "乱入的六段壳字段",
      retentionAnalysis: "fully_preserved",
    };
    expect(videoPromptSchema.safeParse(crossed).success).toBe(false);
  });

  // #9
  it("用例 9：facing.toCamera side 无 frameDirection → 失败", () => {
    const bad = withShot(sfwShot, { facing: { toCamera: "side" } });
    expect(shotSchema.safeParse(bad).success).toBe(false);
    // 正例：补上 frameDirection 通过
    expect(
      shotSchema.safeParse(withShot(sfwShot, { facing: { toCamera: "side", frameDirection: "right" } }))
        .success,
    ).toBe(true);
  });

  // #10
  it("用例 10：assetCode 'SC-1' / 'XX-01' / keyframe 带 assetCode → 都失败", () => {
    const base = {
      id: "AS-9001",
      kind: "image" as const,
      path: "p.png",
      url: "file:///p.png",
      mimeType: "image/png",
      size: 1,
      sha256: "b".repeat(64),
      source: "uploaded" as const,
      createdAt: 0,
    };
    expect(assetSchema.safeParse({ ...base, assetCode: "SC-1" }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, assetCode: "XX-01" }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, role: "keyframe", assetCode: "SC-01" }).success).toBe(false);
    expect(ASSET_CODE_RE.test("SC-1")).toBe(false);
    expect(ASSET_CODE_RE.test("XX-01")).toBe(false);
    expect(ASSET_CODE_RE.test("SC-01-A")).toBe(true);
  });

  // #11
  it("用例 11：VoiceProfile.defaultEmotion 'auto' → 失败", () => {
    const bad = {
      voiceId: "x",
      refAudioPath: "D:/x.wav",
      language: "ZH" as const,
      defaultEmotion: "auto" as const,
      durationFactor: 1.0,
      createdAt: 0,
    };
    expect(voiceProfileSchema.safeParse(bad).success).toBe(false);
    expect(voiceProfileSchema.safeParse({ ...bad, defaultEmotion: "calm" }).success).toBe(true);
  });

  // #12
  it("用例 12：whRatio 与 ratioFollow 同时有值 → 失败", () => {
    const bad = { positive: "p", negative: "n", whRatio: "9:16", ratioFollow: "true" };
    expect(imagePromptSetSchema.safeParse(bad).success).toBe(false);
  });

  // #13
  it("用例 13：sniffSourceKind 四分支 + 短文本，各归各类", () => {
    expect(sniffSourceKind("第三章 入巷\n\n他推门而入。")).toBe("novel");
    expect(sniffSourceKind("场景 1：巷口 雨夜\n林晚收伞。")).toBe("script");
    expect(sniffSourceKind("第一条：事件起因。\n第二条：事件经过。")).toBe("outline");
    // 长段落（平均段长 ≥ 200）→ other
    const longParagraph = "雨".repeat(250);
    expect(sniffSourceKind(longParagraph)).toBe("other");
    // 短文本（平均段长 < 200）→ story
    expect(sniffSourceKind("雨下了整夜。")).toBe("story");
  });

  // #14
  it("用例 14：suggestShell 六种 taskType —— ref2va/hybrid → six-section，其余 → three-field", () => {
    const cases: Array<[Parameters<typeof suggestShell>[0], "six-section" | "three-field"]> = [
      ["t2va", "three-field"],
      ["i2va", "three-field"],
      ["l2va", "three-field"],
      ["fl2va", "three-field"],
      ["ref2va", "six-section"],
      ["hybrid", "six-section"],
    ];
    for (const [tt, want] of cases) {
      expect(suggestShell(tt)).toBe(want);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 附加自查：asset refine 正反例 + L4/L5 档位文字（遮挡降级裁决）
// ─────────────────────────────────────────────────────────────

describe("asset.ts 补充自查（m1-spec §3.8）", () => {
  const base = {
    id: "AS-9002",
    kind: "image" as const,
    assetCode: "SC-01",
    role: "scene",
    path: "p.png",
    url: "file:///p.png",
    mimeType: "image/png",
    size: 1,
    sha256: "c".repeat(64),
    source: "generated" as const,
    createdAt: 0,
  };

  it("portrait kind 必须 role=identity（反例 + 正例）", () => {
    expect(assetSchema.safeParse({ ...base, kind: "portrait", role: "scene" }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, kind: "portrait", role: "identity" }).success).toBe(true);
  });

  it("sha256 必须 64 位 hex（反例 + 正例）", () => {
    expect(assetSchema.safeParse({ ...base, sha256: "abc" }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, sha256: "d".repeat(63) }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, sha256: "e".repeat(64) }).success).toBe(true);
  });

  it("moduleTypes 查重 / bodyState 每维至多一条（refineShotPolicy 直接复用）", () => {
    const dupModules = refineShotPolicy({ ...nsfwShot, moduleTypes: ["M1", "M1"] });
    expect(dupModules.some((v) => v.includes("moduleTypes 重复"))).toBe(true);

    const dupDim = refineShotPolicy({
      ...nsfwShot,
      bodyState: [
        { dim: "wetness", grade: 1 },
        { dim: "wetness", grade: 3 },
      ],
    });
    expect(dupDim.some((v) => v.includes("重复"))).toBe(true);
  });

  it("L4/L5 visualState 按遮挡降级裁决改写（不强制遮挡措辞）", () => {
    // 断言以 nsfw.ts 表格文字为准
    expect(INTENSITY_LEVEL_TABLE.L4.visualState).toBe(
      "无衣物覆盖，可见范围由用户在使用时决定（是否用遮挡/角度收画面，不作为档位定义强制）",
    );
    expect(INTENSITY_LEVEL_TABLE.L5.visualState).toBe(
      "全暴露，可见范围由用户点名的部位与景别决定",
    );
  });

  it("scene schema 元素精确校验（M1-8 收口后的真实 schema 引用）", () => {
    const scene = buildProject().episodes[0]?.scenes[0] as Scene | undefined;
    if (!scene) throw new Error("样例构造失败：scene 缺失");
    const r = sceneSchema.safeParse(scene);
    expect(r.success).toBe(true);
    // 破坏 Shot 内部约束后 scene 应整体失败（不再是 z.unknown() 黑洞）
    const broken = {
      ...scene,
      shots: [withShot(sfwShot, { intensityLevel: "L3" })],
    };
    expect(sceneSchema.safeParse(broken).success).toBe(false);
  });
});
