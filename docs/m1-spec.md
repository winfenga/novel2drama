# M1 施工契约 · 冻结版

> **本文件是 M1 期间所有子代理的唯一事实来源。**
> 动手前先读完本文件，再读自己那一节的依据行号。
> **不要自行发挥命名、路径、签名。** 有疑问就在日志里记一条 `[BLOCKED]`，等主会话裁决。

依据：`execution-plan.md` §5 M1 段（L152-165）、`architecture.md` §3（L112-370）§6.2（L999-1109）§7.4（L1390-1531）、`api-contract.md` §9（L1271-1289）、`nsfw-design.md` §二/§三/§五/§十三（L87-167 / L265-284 / L651-682）。

---

## 1. 上一座山的遗产（M0 定死的东西，不许动）

| 项 | 值 |
|---|---|
| 工具链 | Node 24 / pnpm 12.4.1 / TS 5.9.3 / zod 4.6.7 / vitest 3.2.7 |
| tsconfig | `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `NodeNext` |
| 相对导入 | 必须带 `.js`；类型导入必须 `import type` |
| shared 包结构 | `packages/shared/src/{index,errors,envelope,source}.ts`，源码直出模式 |
| shared 冻结范围 | **M0 的四个既有文件一个字不改**；M1 在 `src/schemas/` 下**新增**文件 + 在 `index.ts` **末尾追加** re-export（这是 M1-8 的正当扩容，不违反冻结——冻结的是 M0 契约，不是仓库） |
| 错误码 | `ERROR_CODES` 37 条已就位，M1 校验失败一律抛 `invalid_param`（400），不够用再记 `[BLOCKED]` |
| 禁止 | `any`（除 m0-spec §5.6 那一处）、`@ts-ignore`、吞异常 |

**M1 不装 `better-sqlite3`**——M1 只做类型与 schema，不做持久化。存储是后续里程碑的事。

---

## 2. 目录与文件归属（谁写哪个，不许越界）

```
packages/shared/src/
├─ index.ts                  ← 末尾追加 re-export（C 收尾时一次做完）
└─ schemas/                  ← M1 全部新增，目录新建
   ├─ enums.ts               ← A：全项目共用枚举（SourceKind / Emotion / ShotSize / CameraMove / MediaType / TaskType / IntensityLevel / ModuleType / BodyStateDim / AssetKind / AssetRole / MediaSource / Policy …）
   ├─ project.ts             ← A：Project / SourceUnit / Episode / Scene / ProjectSettings + sniffSourceKind()
   ├─ dialogue.ts            ← A：DialogueLine / CharTiming
   ├─ character.ts           ← A：Character / VoiceProfile
   ├─ prompt.ts              ← B：VideoPrompt 判别联合（SixSectionShell / ThreeFieldShell）/ ImagePromptSet
   ├─ shot.ts                ← B：Shot / FacingConstraint / GenerationParams + shot refine
   ├─ nsfw.ts                ← B：IntensityLevel 档位表 / ModuleType 细则 / BodyStateGradient 7×5 / NSFW refine 函数
   ├─ asset.ts               ← C：Asset / AssetManifest / assetCode 正则与分配校验
   └─ roundtrip.test.ts      ← C：全套往返 + refine 拦截测试
```

> 归属代号：**A** = entities-1（M1-1/2/5）· **B** = entities-2（M1-3/4/7）· **C** = assets-integrator（M1-6/8）
>
> **A 与 B 并行，互不 import 对方的文件**——交接面只有 `enums.ts`，由 A 先建、B 只读。
> C 等 A、B 都完成后启动，负责收口。
>
> `enums.ts` 归 A 所有：A 建好全部枚举（含 B 需要的 ShotSize/CameraMove/TaskType/MediaType/IntensityLevel/ModuleType 等），B **只 import 不修改**。B 缺枚举 → 记 `[BLOCKED]` 等主会话裁决，不许自己另开文件。

**apps/core、apps/mcp 在 M1 一律不碰。**

---

## 3. 实体签名（照 `architecture.md` §3 抄，裁决处标 ⚖️）

### 3.1 `schemas/enums.ts` —— 全部枚举一次建完

```ts
export const SOURCE_KINDS = ["novel", "story", "script", "outline", "news", "other"] as const;
export const EMOTIONS = ["auto", "happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"] as const;
export const SHOT_SIZES = ["extreme_long", "long", "full", "medium", "closeup", "extreme_closeup"] as const;
export const CAMERA_MOVES = ["static", "push_in", "pull_out", "pan", "truck", "tilt", "pedestal", "tracking", "arc", "pov", "shake", "roll", "focus_shift", "handheld"] as const;
export const TASK_TYPES = ["t2va", "i2va", "l2va", "fl2va", "ref2va", "hybrid"] as const;
export const MEDIA_TYPES = ["anime", "2.5D", "realistic", "illustration"] as const;
export const CONTENT_POLICIES = ["sfw", "nsfw"] as const;
export const INTENSITY_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export const MODULE_TYPES = ["M1", "M2", "M3", "M4", "M5"] as const;
export const BODY_STATE_DIMS = ["wetness", "engorgement", "erectness", "aperture", "compression", "breathing", "muscle_tone"] as const;
export const BODY_STATE_GRADES = [0, 1, 2, 3, 4] as const;
export const ASSET_KINDS = ["image", "video", "audio", "portrait"] as const;
export const ASSET_ROLES = ["identity", "wardrobe", "scene", "pose", "keyframe", "interactive"] as const;
export const MEDIA_SOURCES = ["generated", "uploaded", "derived"] as const;
export const EPISODE_STATUSES = ["draft", "reviewed", "locked"] as const;
export const SHOT_STATUSES = ["pending", "generating", "done", "failed"] as const;
export const FRAME_ROLES = ["first", "last", "character", "scene", "auto"] as const;
// 每个 enum 导出配套 z.enum + type，如：
// export const sourceKindSchema = z.enum(SOURCE_KINDS); export type SourceKind = z.infer<typeof sourceKindSchema>;
```

⚖️ **裁决（原文没有枚举值，只有中文注释，主会话按以下依据定）**：
- `SHOT_SIZES`：storyboard-rules L368 五景别 + 特写两级拆开（远景/全景/中景/近景/特写在 ep01 实产里出现过两级细分），英文小写下划线；**人物不入 extreme_long/long 是 M6 校验的事，schema 层不拦**。
- `CAMERA_MOVES`：h3-prompt-rules §5.1 官方词表 14 种，`arc`/`pov` 保留但 M6 按「用途裁决表」拦截，schema 层不拦。
- `BODY_STATE_DIMS`：nsfw-design §五 湿度/充血/挺立/开合/受压/呼吸/肌肉 七维英文化。
- `FRAME_ROLES`：architecture L1460 的 MediaRole，M7 推导用，先放这里因为 Asset/Shot 都引用。

### 3.2 `schemas/project.ts` —— 项目层（M1-1）

照 `architecture.md` L116-169 抄。字段清单（zod object，字段名与注释一致）：

- `Project`：`id` / `title` / `source{fileName?, text, encoding("utf-8"|"gbk"), charCount, sourceKind, detectedKind?, units[]}` / `settings` / `episodes[]` / `characters[]` / `assets[]` / `llmUsage{tokensIn, tokensOut, budget}` / `createdAt` / `updatedAt`
- `SourceUnit`：`index` / `title` / `range: [number, number]` / `synthetic: boolean`
- `Episode`：`id` / `index` / `title` / `summary` / `sourceRange: [number, number]` / `scenes[]` / `status`
- `Scene`：`id` / `index` / `location` / `timeOfDay` / `characters: string[]`（characterId）/ `action` / `dialogue: DialogueLine[]` / `shots: Shot[]`
- `ProjectSettings`（⚖️ 架构文档只写「见 §6.2」没有定义，主会话按 §6.2.2 A/B/D 三组裁成只含程序要读的字段，纯 UI 层参数不进数据模型）：

```ts
ProjectSettings {
  // A 剧本（architecture L1001-1009）
  episodeCount?: number
  episodeDurationSec: number          // 默认 90
  genre?: string                      // enum 值文档没定全，先放宽 string，M3 再收紧
  tone?: string
  dialogueRatio: number               // 0-1，默认 0.4
  language: string                    // 默认 "zh"
  // B 分镜（L1011-1018）
  globalSegDurationSec: number        // D，5-15 整数
  perShotOverride: Record<string, number>
  shotSizeBias: "balanced" | "closeup" | "wide"
  cameraStyle: "cinematic" | "viral" | "documentary"
  allowSlowMotion: boolean
  // C 生成（L1059-1081，项目级默认值；镜头级覆盖在 GenerationParams）
  resolution: string                  // 默认 "1080x1920"
  fps: number                         // 24 | 30
  aspect: string                      // 默认 "9:16"
  useVDN: boolean
  imageWorkflow: string               // 默认 "qwen21:t2i"
  llmTokenBudget: number              // 0 = 不限
}
```

**`sniffSourceKind(text: string): SourceKind`**（纯函数，连同正则一起导出）：
- `/(第[一二三四五六七八九十百千0-9]+[章卷回])/` → `novel`
- `/^(场景|场次|INT\.|EXT\.|内景|外景)/m` → `script`
- `/^(第[一二三四五六七八九十百千0-9]+条|[0-9]+[\.、]\s)/m` 且无章节标记 → `outline`
- 以上都不中、平均段长 < 200 字 → `story`；否则 → `other`
- `news` 不自动嗅探（只在用户显式指定时出现）——⚖️ 文档只说「看有没有第X章、角色：、场景等标记」，本裁决按可执行的最小规则定，M1-1 测试覆盖每条分支。

### 3.3 `schemas/dialogue.ts` —— 台词（M1-2）

照 `architecture.md` L172-184 + `decision-log.md` §6.2/§6B：

```ts
DialogueLine {
  id: string; index: number
  speakerId: string
  text: string
  emotion: Emotion; strength: number   // 0-1；emotion="auto" 时 strength 可省
  durationFactor: number               // 0.5-2.0
  shotId?: string; audioAssetId?: string
  actualSec?: number                   // TTS 实测
  audioStale?: boolean
  // ⚖️ 全集绝对时间轴（execution-plan M10-1 前置，ARCH L1104 提到）：
  globalStartSec?: number; globalEndSec?: number
  charTimings?: CharTiming[]           // ASR 逐字时间戳（decision-log §6B）
}
CharTiming { char: string; startSec: number; endSec: number }
```

refine：`strength` ∈ [0,1]、`durationFactor` ∈ [0.5, 2.0]、`actualSec` > 0、`globalEndSec >= globalStartSec`、`charTimings` 内 `endSec >= startSec` 且按 `startSec` 升序。

### 3.4 `schemas/character.ts` —— 角色与音色（M1-5）

照 `architecture.md` L270-288 + nsfw-design §13.3：

```ts
Character {
  id; name; aliases: string[]
  gender?: string; age?: string; appearance?: string; outfit?: string; personality?: string
  portraitAssetId?: string
  voiceProfile?: VoiceProfile
  consistencySeed?: number
  // ⚖️ NSFW 属性（nsfw-design §13.3 定的扩展；M2 合规闸门要用，结构先占位）
  nsfwProfile?: {
    appearanceConstraints: string[]    // 外形负面约束（writing-conventions §5）
    voiceStyle?: string
  }
}
VoiceProfile {
  voiceId: string; refAudioPath: string
  language: "ZH" | "EN" | "JA" | "ES" | "AR"
  defaultEmotion: Emotion              // "auto" 不许做默认值 —— refine 拦
  durationFactor: number; createdAt: number
}
```

### 3.5 `schemas/prompt.ts` —— 提示词判别联合（M1-4）

照 `architecture.md` L237-266 + h3-prompt-rules §2（**判据是「有无参考归因段」，不是 task_type 的简单函数**）：

```ts
VideoPrompt =
  | { shell: "six-section"; ...SixSectionShell }    // ref2va / hybrid
  | { shell: "three-field"; ...ThreeFieldShell }    // t2va / i2va / l2va / fl2va

SixSectionShell {
  subjectDefinitions: string; summary: string; retentionAnalysis: string
  detailedDescription: string; overallSoundscape: string; nonDiegeticMusic: string
  exclusionLine: string               // 附加行，不属于六段
}
ThreeFieldShell {
  instructionLine?: string            // i2va 及变体有；t2va 无
  integratedMultimodalDescription: string
  overallSoundscape: string; nonDiegeticMusic: string
  exclusionLine: string
}
ImagePromptSet {                      // ⚖️ 架构文档只留了名字；按 h3 §7.1 两段式裁
  positive: string                    // 单段连续文本
  negative: string                    // 逗号短语列表
  whRatio?: string                    // 有值则 ratioFollow 必为 ""
  ratioFollow?: string
}
```

refine：`whRatio` 与 `ratioFollow` 互斥（h3 §7.2 互斥规则）；两壳的 `exclusionLine` 必填；`retentionAnalysis` 允许的枚举值（`fully_preserved` 等）是**字符串内容校验**，M4 校验器做，schema 层只校验非空——记入「不在 M1 做」防止越界。

**`suggestShell(taskType: TaskType): "six-section" | "three-field"`**：`ref2va`/`hybrid` → six-section，其余 → three-field。导出但注明：这是提示词组装时的**建议**，不是校验判据（fl2va 挂锚点仍走三字段，见 ARCH L264）。

### 3.6 `schemas/nsfw.ts` —— NSFW 策略数据结构（M1-7，★NSFW-P0）

照 `nsfw-design.md` §二/§三/§五 + CP L178-184：

```ts
// L0-L5 每档可视状态（直抄 nsfw-design L93-98 表格，做两份导出）
export const INTENSITY_LEVEL_TABLE: Record<IntensityLevel, { colloquial: string; visualState: string }>
export const intensityLevelTableSchema = z.record(...)

// 7 维 × 5 档状态梯度（直抄 nsfw-design L269-277 表）
export const BODY_STATE_TABLE: Record<BodyStateDim, Record<0|1|2|3|4, string>>
BodyStateGradient { dim: BodyStateDim; grade: 0|1|2|3|4 }   // schema：每维只能出现一次（refine 查重）

// MediaType 四值已在 enums.ts；档位选择与模块勾选的「组合合法性」在 Shot refine（3.7）
```

**联合约束 refine（本次里程碑的 P0 验收项）**——写成独立导出函数 `refineShotPolicy(shot)` 供 `shot.ts` 与测试复用：

1. `contentPolicy: "sfw"` ⇒ `intensityLevel` / `moduleTypes` / `bodyState` **必须全部 undefined**（execution-plan L165 原文：sfw 时 intensityLevel 必须被 zod 拒）
2. `contentPolicy: "nsfw"` ⇒ `intensityLevel` **必填**；`moduleTypes` ≥ 1 条；`mediaLock` 必填
3. `intensityLevel: "L5"` ⇒ 允许（schema 不加额外限制；画幅/M5 四要素是 M2/M3 的提示词纪律，不进数据模型）
4. `bodyState` 每维至多一条、grade ∈ 0-4
5. `moduleTypes` 无重复

### 3.7 `schemas/shot.ts` —— 分镜实体（M1-3）

照 `architecture.md` L187-225 逐字段抄，装配 NSFW 字段：

```ts
Shot {
  id: string; index: number
  durationSec: number                 // 5-15 整数（H3 约束，refine 拦）
  actualDurationSec?: number
  shotSize: ShotSize; cameraMove: CameraMove
  facing: FacingConstraint
  initialPosition: string             // 第 0 秒初始空间位置
  description: string
  taskType: TaskType
  promptVideo: VideoPrompt            // 判别联合
  promptImage?: ImagePromptSet
  negativePrompt: string
  contentPolicy: "sfw" | "nsfw"
  intensityLevel?: IntensityLevel
  moduleTypes?: ModuleType[]
  bodyState?: BodyStateGradient[]
  mediaLock: MediaType
  refCharacters: string[]; refAssets: string[]
  pictureIndex: Record<string, string>  // { "<Picture 1>": "CH-01", ... }
  params: GenerationParams
  status: ShotStatus
  candidates: string[]; selectedAssetId?: string; outputs: string[]
  riskScore?: number                  // 0|1|2
}
FacingConstraint {                    // ⚖️ 按 h3 §5.5 三要素裁
  toCamera: "front" | "three_quarter" | "side" | "back"
  frameDirection?: "left" | "right"   // 侧向时必填（refine）
  pairRelation?: "face_to_face" | "same_direction" | "back_to_back" | "behind"
}
GenerationParams {                    // ⚖️ 见 §3.2 同名裁决，镜头级可覆盖项
  durationSec?: number                // 5-15
  resolution?: string; fps?: number; aspect?: string
  seed?: number; consistencyStrength?: number   // 0-1
  steps?: number; transitionStep?: number; lowresScale?: number  // C-2 2采参数
  useVDN?: boolean
}
```

shot 级 refine：`durationSec` 整数 5-15；`riskScore` ∈ {0,1,2}；`facing.toCamera` 为 `side` 时 `frameDirection` 必填；`params.consistencyStrength` ∈ [0,1]；**policy refine 从 nsfw.ts 导入复用**。

### 3.8 `schemas/asset.ts` —— 资产（M1-6）

照 `architecture.md` L291-345 + §3.1.1 编号规则：

```ts
Asset {
  id: string; kind: AssetKind
  assetCode?: string                  // "SC-01"|"CH-01"|"PR-01"
  variant?: "A"|"B"|"C"
  role?: AssetRole
  path: string; url: string; mimeType: string; size: number; sha256: string
  width?: number; height?: number; durationSec?: number
  sampleRate?: number; channels?: number; frameCount?: number; fps?: number
  mediaType?: MediaType
  source: MediaSource
  parentAssetId?: string; workflowId?: string; seed?: number
  params?: Record<string, unknown>
  shotId?: string; dialogueLineId?: string
  createdAt: number
}
AssetManifest { items: { pictureAlias: string; assetCode: string; variant?: string; usedInShots: string[] }[] }
```

- `ASSET_CODE_RE = /^(SC|CH|PR)-\d{2}(-[ABC])?$/` 导出，schema refine 用它校验 `assetCode`
- **`keyframe` role 与 `assetCode` 互斥**（关键帧不占号，h3 §2.5）——refine 拦
- `sha256` 必须 64 位 hex（refine）
- `Asset.kind === "portrait"` 时 `role` 必须是 `identity`（定妆照即身份源）——⚖️ 主会话裁

---

## 4. M1-8 收口（C 的活）

1. `packages/shared/src/index.ts` **末尾追加** `export * from "./schemas/…"`（逐文件），不动既有任何行
2. zod 全套用 **zod 4 API**（`z.enum` / `z.treeifyError` / `.safeParse`），与 m0-spec §5.7 dispatcher 用法一致
3. 每个 schema 导出两样：`xxxSchema`（zod object）+ `type Xxx = z.infer<typeof xxxSchema>`
4. **架构文档里的 TS interface 是形状权威，zod schema 是校验权威，两者字段必须一一对应**——测试里用 zod parse 一份完整样例来证明

### `roundtrip.test.ts` 验收矩阵（C 写，全绿才算完）

| # | 用例 | 判据 |
|---|---|---|
| 1 | 完整 `Project` 样例（含 1 Episode→1 Scene→2 Shot→DialogueLine，覆盖 SFW+NSFW 两 Shot）`JSON.stringify → JSON.parse → schema.safeParse` | 全程通过，字段无丢失 |
| 2 | `contentPolicy:"sfw"` + `intensityLevel:"L1"` | **safeParse 失败**（policy refine 拦截）|
| 3 | `contentPolicy:"sfw"` + `moduleTypes:["M1"]` | safeParse 失败 |
| 4 | `contentPolicy:"sfw"` + `bodyState:[...]` | safeParse 失败 |
| 5 | `contentPolicy:"nsfw"` 无 `intensityLevel` | safeParse 失败 |
| 6 | `contentPolicy:"nsfw"` 无 `moduleTypes` | safeParse 失败 |
| 7 | `durationSec: 4` / `durationSec: 16` / `durationSec: 7.5` | 三个都失败 |
| 8 | `VideoPrompt` 两壳各一个合法样例 + 交叉赋值（three-field 塞 six-section 字段）| 合法通过 / 交叉失败 |
| 9 | `facing.toCamera:"side"` 无 `frameDirection` | 失败 |
| 10 | `assetCode: "SC-1"` / `"XX-01"` / keyframe role 带 assetCode | 都失败 |
| 11 | `VoiceProfile.defaultEmotion: "auto"` | 失败 |
| 12 | `whRatio` 与 `ratioFollow` 同时有值 | 失败 |
| 13 | `sniffSourceKind` 四分支（章节体/剧本体/条目体/长段落）+ 短文本 | 各归各类 |
| 14 | `suggestShell` 六种 taskType | ref2va/hybrid → six-section，其余 → three-field |

**M1 出口标准**（execution-plan L165 + 487）：
1. `pnpm -r exec tsc --noEmit` 三包 0 error
2. `pnpm -C packages/shared test`（vitest）全绿——测试就放 shared 包内跑（package.json 需要加 vitest devDep，这是 C 的正当改动）
3. 上表 14 条用例全绿，其中 2-6 是 NSFW-P0 的命门

---

## 5. 已知文档漂移（照本文件做，别回去改文档）

| # | 漂移 | 本文件裁决 |
|---|---|---|
| D12 | `ProjectSettings` / `GenerationParams` 在 architecture.md 只写「见 §6.2」无独立定义 | 按 §3.2 / §3.7 的裁决结构落地，字段出处标了行号 |
| D13 | `ShotSize` / `CameraMove` / `FacingConstraint` 只有中文注释无枚举值 | 按 §3.1 / §3.7 裁决的英文枚举落地 |
| D14 | `ImagePromptSet` 只有名字无结构 | 按 h3 §7.1 两段式（positive/negative/whRatio/ratioFollow）落地 |
| D15 | architecture.md L130 `settings: ProjectSettings 见 §6`，但 §6 是 GUI 参数体系含大量 UI-only 参数 | 数据模型只收程序要读的字段；`genre`/`tone` 先放宽为 string，M3 定枚举 |
| D16 | nsfw-design §13.3 说 Character + nsfwProfile，但属性清单（敏感点/性癖等）属 M13 写作侧 | M1 只占位 `appearanceConstraints` + `voiceStyle`，写作侧属性 M13 再扩 |
| D17 | shared 包 M0 冻结 vs M1-8 要在 shared 建 schemas/ | 冻结指 M0 四文件不可改；schemas/ 是新增目录，index.ts 只允许末尾追加 |

---

## 6. 日志（硬要求，漏了就白干）

每人只写 `docs/worklog/M01.md`（追加，不覆盖；先读全文再追加到末尾，一次写完一整条）。模板照 `docs/worklog/_模板.md`，七个字段一个不能空。

```
你要写日志：docs/worklog/M01.md
- 每完成一个子任务立刻追加一条 [00N]，格式照该文件内的模板
- 七个字段都要填，「踩到的坑」和「关键决定」最重要
- 只能追加，不能修改或删除已有条目
- 发现前面写错了，追加 [CORRECTION #N]，不要改原条目
```

---

## 7. 质量标准（交活前自查）

| 项 | 要求 |
|---|---|
| `pnpm -C packages/shared exec tsc --noEmit` | 0 error |
| schema 与文档字段对应 | architecture §3 逐字段核对，不许私加私删（裁决处除外） |
| 每个 refine | 至少一条正例一条反例进测试 |
| 禁止 | `any` / `@ts-ignore` / 吞异常 / 改 M0 四文件 / 碰 apps/* |
