/**
 * NSFW 策略数据结构（M1-7 · ★NSFW-P0）。
 *
 * 归属：Block B（entities-2）。依据：m1-spec §3.6 + nsfw-design §二（L87-115）/ §五（L265-284）/ §十三（L651-682）。
 *
 * ⚠️ `refineShotPolicy` 是独立导出函数，供 `shot.ts` 的 ShotSchema.superRefine 与
 *    roundtrip 测试复用 —— 这是 NSFW-P0 命门：contentPolicy:"sfw" 时
 *    intensityLevel / moduleTypes / bodyState 任一存在都必须 parse 失败。
 *
 * 两张表从 nsfw-design 原表直抄：仅去掉 Markdown 强调符（`**`，那是文档排版，
 * 同 m0 errors.ts 的先例）。
 * 例外（2026-11-10 用户裁决）：L4/L5 的 visualState 不抄原文的「以遮挡控制可见范围」
 * 措辞——遮挡不再作为档位定义强制，是否遮挡交给使用时判断。见 decision-log §15。
 */

import { z } from "zod";
import {
  contentPolicySchema,
  intensityLevelSchema,
  mediaTypeSchema,
  moduleTypeSchema,
  bodyStateDimSchema,
  bodyStateGradeSchema,
} from "./enums.js";
import type {
  BodyStateDim,
  BodyStateGrade,
  ContentPolicy,
  IntensityLevel,
  MediaType,
  ModuleType,
} from "./enums.js";

// ── L0-L5 每档可视状态（直抄 nsfw-design L93-98 表格）──

export const INTENSITY_LEVEL_TABLE: Record<
  IntensityLevel,
  { colloquial: string; visualState: string }
> = {
  L0: {
    colloquial: "「色气一点」「有氛围」",
    visualState: "服装不变，仅表情与环境：眼睑微垂、面颊泛红、唇部微启、光源转低位暖调",
  },
  L1: {
    colloquial: "「领口低一点」「露出肩膀」",
    visualState: "服装完整，仅局部位移：领口下滑露锁骨与肩线、袖口滑落至肘",
  },
  L2: {
    colloquial: "「半脱」「衣服松一点」",
    visualState: "仍挂着但结构错位：单侧肩带滑落、外层褪至腰际、解开数颗扣子，内衣仍在位",
  },
  L3: {
    colloquial: "「脱掉上衣」「只剩内衣」",
    visualState: "指定衣物已离线或置于画面内，内衣仍在位，躯干大面积暴露",
  },
  L4: {
    colloquial: "「全裸」「不要衣服」",
    visualState: "无衣物覆盖，可见范围由用户在使用时决定（是否用遮挡/角度收画面，不作为档位定义强制）",
  },
  L5: {
    colloquial: "「露出来」「细节特写」",
    visualState: "全暴露，可见范围由用户点名的部位与景别决定",
  },
};

export const intensityLevelTableSchema = z.record(
  intensityLevelSchema,
  z.object({ colloquial: z.string(), visualState: z.string() }),
);

// ── 7 维 × 5 档状态梯度（直抄 nsfw-design L269-277 表）──

export const BODY_STATE_TABLE: Record<BodyStateDim, Record<BodyStateGrade, string>> = {
  wetness: {
    0: "干爽无光泽",
    1: "微潮、无连续反光",
    2: "表面泛柔和光泽",
    3: "明显湿润、多处小高光",
    4: "液体附着成膜、细长拉丝、局部滴落",
  },
  engorgement: {
    0: "常态肤色",
    1: "轻微泛红",
    2: "明显红润",
    3: "深红",
    4: "紫红、充血肿胀",
  },
  erectness: {
    0: "柔软下垂",
    1: "半挺",
    2: "挺立",
    3: "高度挺立并上翘",
    4: "高度挺立伴明显血管凸起",
  },
  aperture: {
    0: "闭合",
    1: "微张",
    2: "张开",
    3: "明显张开并可见内部",
    4: "大幅张开、结构充分外露",
  },
  compression: {
    0: "无",
    1: "轻微凹陷",
    2: "明显凹陷、边缘微隆",
    3: "深凹陷、周围组织堆积",
    4: "深度凹陷并伴周边浅色勒痕",
  },
  breathing: {
    0: "平稳无反应",
    1: "轻微起伏",
    2: "明显起伏 + 薄汗",
    3: "大幅起伏 + 大汗 + 潮红",
    4: "剧烈起伏 + 大汗 + 局部肌肉颤抖",
  },
  muscle_tone: {
    0: "放松",
    1: "轻度收紧",
    2: "明显绷紧",
    3: "绷紧伴筋膜线条可见",
    4: "强直收缩 + 颤抖",
  },
};

export const bodyStateTableSchema = z.record(
  bodyStateDimSchema,
  z.record(bodyStateGradeSchema, z.string()),
);

// ── BodyStateGradient：7 维中每维一条、档位 0-4 ──

export const bodyStateGradientSchema = z.object({
  dim: bodyStateDimSchema,
  grade: bodyStateGradeSchema,
});
export type BodyStateGradient = z.infer<typeof bodyStateGradientSchema>;

// ── 联合约束 refine（m1-spec §3.6 五条规则，P0 验收项）──

/**
 * refineShotPolicy 的入参形状：Shot 的 policy 相关字段子集（结构化类型，避免
 * nsfw.ts ⇄ shot.ts 循环 import —— shot.ts import 本函数，本文件不回头 import Shot）。
 */
export interface ShotPolicyFields {
  contentPolicy: ContentPolicy;
  intensityLevel?: IntensityLevel | undefined;
  moduleTypes?: readonly ModuleType[] | undefined;
  bodyState?: readonly BodyStateGradient[] | undefined;
  mediaLock?: MediaType | undefined;
}

/**
 * 校验 Shot 的 NSFW 联合约束，返回违规描述列表（空数组 = 通过）。
 *
 * 规则（m1-spec §3.6）：
 * 1. contentPolicy:"sfw" ⇒ intensityLevel / moduleTypes / bodyState 必须全部 undefined
 * 2. contentPolicy:"nsfw" ⇒ intensityLevel 必填；moduleTypes ≥ 1 条；mediaLock 必填
 * 3. intensityLevel:"L5" ⇒ 允许（schema 不加额外限制；画幅/M5 四要素是 M2/M3 的提示词纪律）
 * 4. bodyState 每维至多一条、grade ∈ 0-4（grade 由 bodyStateGradientSchema 保证，
 *    此处查每维重复）
 * 5. moduleTypes 无重复
 */
export function refineShotPolicy(shot: ShotPolicyFields): string[] {
  const violations: string[] = [];

  if (shot.contentPolicy === "sfw") {
    // 规则 1：sfw 时 NSFW 三字段任一存在都违规
    if (shot.intensityLevel !== undefined) {
      violations.push(`contentPolicy:"sfw" 时 intensityLevel 必须缺省（收到 ${shot.intensityLevel}）`);
    }
    if (shot.moduleTypes !== undefined) {
      violations.push(`contentPolicy:"sfw" 时 moduleTypes 必须缺省（收到 ${shot.moduleTypes.length} 条）`);
    }
    if (shot.bodyState !== undefined) {
      violations.push(`contentPolicy:"sfw" 时 bodyState 必须缺省（收到 ${shot.bodyState.length} 条）`);
    }
    return violations;
  }

  // contentPolicy === "nsfw"（contentPolicy 由 contentPolicySchema 保证只有两值）
  // 规则 2：nsfw 三必填
  if (shot.intensityLevel === undefined) {
    violations.push('contentPolicy:"nsfw" 时 intensityLevel 必填');
  }
  if (shot.moduleTypes === undefined || shot.moduleTypes.length < 1) {
    violations.push('contentPolicy:"nsfw" 时 moduleTypes 至少 1 条');
  }
  if (shot.mediaLock === undefined) {
    violations.push('contentPolicy:"nsfw" 时 mediaLock 必填');
  }

  // 规则 4：bodyState 每维至多一条（grade ∈ 0-4 已由 bodyStateGradientSchema 拦）
  if (shot.bodyState !== undefined) {
    const seenDims = new Set<BodyStateDim>();
    for (const g of shot.bodyState) {
      if (seenDims.has(g.dim)) {
        violations.push(`bodyState 维度 ${g.dim} 重复（每维至多一条）`);
      }
      seenDims.add(g.dim);
    }
  }

  // 规则 5：moduleTypes 无重复
  if (shot.moduleTypes !== undefined) {
    const seen = new Set<ModuleType>();
    for (const m of shot.moduleTypes) {
      if (seen.has(m)) {
        violations.push(`moduleTypes 重复：${m}`);
      }
      seen.add(m);
    }
  }

  // 规则 3：L5 无额外 schema 限制（此处为显式声明占位，防止后人加码）
  return violations;
}

// contentPolicySchema 等的重导出不需要 —— shot.ts / project.ts 直接从 enums.js 拿。
// 这里只保留与 NSFW 专属数据相关的内容（nsfw-design §13.1）。
