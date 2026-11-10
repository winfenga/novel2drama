# M3+M5 并行施工契约 · 冻结版

> **本文件是 M3/M5 两个里程碑并行期间所有子代理的唯一事实来源。**
> 动手前先读完本文件，再读自己那一节的依据行号。
> **不要自行发挥命名、路径、签名。** 有疑问就在日志里记一条 `[BLOCKED]`，等主会话裁决。
>
> **并行边界（两轨文件零交集）**：
> - M3 只碰 `prompts/`（填真内容）、`packages/shared/src/promptLibrary/`（新建，动作库数据）与 `apps/core/src/promptlib/`（新建，库检索/拼装扩展）
> - M5 只碰 `apps/core/src/llm/`（新建）
> - 共享冻结区：`packages/shared` 的 **M1 既有 schema 文件只读**；M5 需要给 `config/types.ts` 的 Role 加 `"vision"`（decision-log §21 第 3 条授权，**仅许改这一处**）；其余 shared 改动一律 `[BLOCKED]`
>
> **主会话追加的总红线（execution-plan §8.2 全局底线，每条 PR 必过）**：
> **不静默降级** —— 任何 `llm_*` / `comfy_*` 错误不许 catch 后返回默认值。没有后端就抛 `llm_no_backend`，没有角色就抛 `llm_no_role`，模型挂了抛 502；**永远不用「猜一个结果」代替报错**。拼装时缺文件抛错（M2-3 已实现），缺策略段落抛错，动作库检索不命中抛错——宁可显式失败，不许编造成功。

依据：`execution-plan.md` §5 M3 段（L183-198）/ M5 段（L217-227）、`architecture.md` §5.2（L496-712）/ §5.3（L714-817）/ §5.4（L819-832）、`h3-prompt-rules.md` 全文（六段壳/三字段壳/枚举值）、`nsfw-design.md` §二/§三/§六/§七/§十、`decision-log.md` §17-§21、`conflict-register.md`。

---

## 1. M5 · LLM 后端接入（6.0 人日，5 子任务）—— 先行轨，M3 的 llmCall 替换依赖它

### 1.1 文件归属（M5 轨道独占）

```
apps/core/src/llm/            ← M5 全部新建
├─ backends.ts                ← M5-1：pickBackend（llm_no_backend / llm_no_role 两码分开）
├─ netPolicy.ts               ← M5-2：assertBaseUrl + isPrivateAddress（ipaddr.js range()）
├─ chat.ts                    ← M5-3：llmChat 调用与错分类
├─ retry.ts                   ← M5-4：temperature=1 重试 + stripReasoning
├─ connectivity.ts            ← M5-5：连通性测试
└─ *.test.ts                  ← 每文件配套（全 mock，零真实网络）
```

**M5 不碰**：`prompts/**`、`promptlib/**`、shared 的 M1 schema 文件、`apps/core` 的 compliance/shot/media/config 既有实现。
**M5 唯一授权的 shared 改动**：`packages/shared/src/` 下 config Role 类型加 `"vision"`（decision-log §21 第 3 条）。注意：config 的 Role 定义在 `apps/core/src/config/types.ts`（ROLES 常量），**改这个文件**（M0 冻结区，本条为唯一豁免）；shared 里若无 Role 定义则不动 shared。

### 1.2 核心签名（照 architecture L628-712 抄）

```ts
// backends.ts —— M5-1
import type { DramaError } from "@text2drama/shared";
export type Role = "text" | "prompt" | "plan" | "vision";
export interface Backend { id: string; baseUrl: string; apiKey: string; model: string; roles: Role[]; priority: number; enabled: boolean; local?: boolean }
/**
 * pickBackend 判定顺序（architecture L628-655，一字不改）：
 * ① 无任何 enabled 后端 → DramaError "llm_no_backend" (400)
 * ② roleRouting 显式路由命中 → 用它
 * ③ 路由没配/指向无效 → 按 priority 升序取第一个 roles 含该角色的
 * ④ 一个都没有 → DramaError "llm_no_role" (400)，message 列出各后端能干的活
 * 两码必须分开（llm_no_backend ≠ llm_no_role）——M2 的 gate.ts 已依赖此语义。
 */
export function pickBackend(cfg: { llmBackends: Backend[]; roleRouting: Partial<Record<Role, string>> }, role: Role): Backend;

// netPolicy.ts —— M5-2
/** 必须用 ipaddr.js 的 range()，不许手写正则判内网（architecture L575-618） */
export function isPrivateAddress(url: string): boolean;
/** local:true 才放行 loopback/私网；外部地址伪装内网仍拦 → llm_private_url (400) */
export function assertBaseUrl(b: Backend): void;

// chat.ts —— M5-3
export interface ChatOpts { role: Role; system: string; userText: string; temperature?: number; maxTokens?: number; signal?: AbortSignal }
/** 120s 超时；401/403→llm_auth(502)；404→llm_model_not_found(502)；其余→llm_unreachable(502)——一律对调用方 502 */
export function llmChat(cfg: unknown, opts: ChatOpts): Promise<{ content: string; usage?: { prompt: number; completion: number } }>;

// retry.ts —— M5-4
/** temperature=1 按报错文案重试一次（不维护模型白名单）；stripReasoning 照 architecture L819-832 正则照抄 */
export async function chatWithRetry(cfg: unknown, opts: ChatOpts): Promise<string>;
export function stripReasoning(text: string): string;

// connectivity.ts —— M5-5
/** GET {baseUrl}/models，能列模型即通；target="*" 全测 */
export function testBackends(cfg: unknown, target: string): Promise<{ id: string; ok: boolean; detail?: string }[]>;
```

### 1.3 M5 与既有代码的接线（本轮只留缝，不接线）

- `compliance/gate.ts` 的临时 llmCall **本轮不动**——M5 完成后由主会话派一次性接线任务替换
- M6 风险分 LLM 依赖项（riskScore 的 score:1 占位）同理，接口已留
- shared 的 config 类型若缺 `vision` role：只改 `apps/core/src/config/types.ts` 的 ROLES 常量（授权豁免），并跑通 config 既有测试

### 1.4 M5 出口标准

1. `pnpm -C apps/core exec tsc --noEmit` 0 error
2. vitest 全绿，重点用例：
   - pickBackend：无后端→llm_no_backend；路由指向无权后端→按 priority 兜底；无角色→llm_no_role（message 含候选列表）
   - isPrivateAddress：loopback/私网/link-local 各一条 + 公网一条；local:true 放行；local:false 拦 → llm_private_url
   - llmChat：401→llm_auth；404→llm_model_not_found；500→llm_unreachable；超时 abort → llm_unreachable（全 mock fetch）
   - stripReasoning：`<think>` 块/`<|…|>`/markdown fence/「思考过程：」元行各一条
   - temperature 重试：第一次报错文案含 temperature → 重试一次成功；两次都失败 → 原错上抛（**不许吞**）

---

## 2. M3 · 提示词资产（24.5 人日，8 子任务）

### 2.1 文件归属（M3 轨道独占）

```
prompts/                       ← 填真内容（占位已建）
├─ base.md                     ← M3-1
├─ shells/six-section.md       ← M3-2
├─ shells/three-field.md       ← M3-3
├─ policy-sfw.md               ← M3-4
├─ policy-nsfw.md              ← M3-5
├─ shells/six-section-hybrid.md← M3-2 附加（Hybrid 骨架单列）
└─ themes/tk.md                ← TK 题材包（S3/S4 段，decision-log §十九）

packages/shared/src/promptLibrary/   ← M3-6 新建（纯数据目录）
├─ actions/                           ← 8 类动作库，每类一个 ts
│  ├─ undress.ts    # ① 脱衣类
│  ├─ display.ts    # ② 展示类
│  ├─ pose.ts       # ③ 姿态类
│  ├─ perform.ts    # ④ 实演类
│  ├─ interact.ts   # ⑤ 互动类
│  ├─ expression.ts # ⑥ 神情类
│  ├─ props.ts      # ⑦ 道具类
│  └─ sound.ts      # ⑧ 声音类
├─ anatomy.ts                         # 解剖术语四列表 + 禁用代称映射（EX02 §9）
├─ negativeWords.ts                   # 负面词六类骨架（h3 §7.8，SFW 删④差异）
└─ index.ts                           # 统一导出 + 检索函数

apps/core/src/promptlib/             ← M3-7/M3-8 新建
├─ retrieval.ts                       # 动作库检索（按类目/强度/介质过滤）
└─ overrides.ts                       # 用户覆盖三层查找（复用 assembleSkill 的 roots 机制）
```

**M3 不碰**：`apps/core/src/llm/**`（M5 的）、compliance/shot/media 既有文件、`apps/core/src/compliance/assembleSkill.ts`（只调用不修改）。

### 2.2 M3-1 base.md 内容规格

照 architecture L726-734 八个板块，规则来源：
- 角色设定与身份 ← EX11（character-scene-sheet）+ h3 §5 全局生成规格
- 输入处理三情况 ← EX01 L156-191
- 全局生成规格（剧本一致性、Facing）← h3 L440-450（朝向三要素句式）
- 分镜与镜头体系 ← storyboard-rules §六
- 运镜六条 + 摄像机归因纪律 ← h3 §5.1/§5.2（逐条收录，Arc Shot 用途裁决表一并写入）
- 台词规则（配额/口型/音色）← h3 §5.6-§5.9
- 声音设计 ← h3 §5.8（soundscape/music 纪律）
- 自检清单骨架 ← h3 §六合并版（结构层+编号契约层+连贯层+内容层+声音层+语言层六节）

**语言**：提示词正文英文（官方语法），说明性文字中文。文件头加一行「本文件由 M3-1 生成，依据：{行号清单}」。

### 2.3 M3-2/M3-3 壳文件

- `six-section.md`：六段骨架（h3 §2.1 纯 Ref2VA 版）+ `six-section-hybrid.md`（§2.1.1 有首帧版，`first_frame` 反引号字段名不占号）
- `three-field.md`：§2.2 三字段（指令行 i2va 有 t2va 无）
- 枚举值全集（§2.3）：视觉保留 4 值、音频保留 4 值、summary 任务类型 6 值——**audio reuse 与 audio reference 两个都保留**（h3 §2.3.1 裁决），`<Audio N>` 默认 `reference` 起步

### 2.4 M3-4/M3-5 策略文件

- `policy-sfw.md`：表演描述规范 / 神情渐变通用版 / 分介质措辞（nsfw §七四行表）/ 负面词 ①②③⑤⑥
- `policy-nsfw.md`：L0-L5 档位表（**用裁决后口径**：L4「可见范围由用户在使用时决定」/ L5「全暴露」，见 nsfw-design §二 2026-11-10 修订版）/ M1-M5 五模块细则 / 7×5 状态梯度（BODY_STATE_TABLE 同源）/ 解剖术语四列表 + 禁用代称（**从 promptLibrary/anatomy.ts 引用数据生成，不手抄**）/ 分介质措辞 R18 版 / 遮挡**降级为可选构图手段参考**（decision-log §15，标题写「构图手段参考（可选，使用时判断）」）/ 负面词含 ④
- **介质锁定条款必须写在改动条款之前**（nsfw §七硬约束）

### 2.5 M3-6 动作库结构化（D2=全结构化，8 类 150+ 条）

```ts
// packages/shared/src/promptLibrary/actions/undress.ts —— 每类同构
import type { ActionEntry } from "../index.js";
export const UNDRESS_ACTIONS: ActionEntry[] = [
  {
    id: "undress-001",
    category: "undress",            // 八类之一
    name: "半挂中间态",              // 中文短名（EX01 原条目名）
    promptEn: "...",                // 英文 prompt 素材（EX01 原文英译，逐条照录不缩写）
    intensityRange: ["L2", "L5"],   // 适用强度档（按内容判断标注）
    mediaFit: ["anime", "2.5D", "realistic", "illustration"],  // 适用介质
    bodyParts: ["arms", "waist"],   // 涉及部位（检索用）
    notes: "...",                   // 原条目的技法备注（如「半裸比全裸更勾人」）
  },
  // …
];
```

```ts
// index.ts —— 统一导出与检索
export interface ActionEntry {
  id: string; category: ActionCategory; name: string; promptEn: string;
  intensityRange: readonly IntensityLevel[]; mediaFit: readonly MediaType[];
  bodyParts: readonly string[]; notes?: string;
}
export type ActionCategory = "undress" | "display" | "pose" | "perform" | "interact" | "expression" | "props" | "sound";
export const ALL_ACTIONS: readonly ActionEntry[];   // 八类聚合
/** 检索：按类目/强度/介质/部位过滤；零命中返回空数组（调用方决定报错策略，库本身不抛） */
export function queryActions(filter: { category?: ActionCategory; atLevel?: IntensityLevel; media?: MediaType; bodyPart?: string }): ActionEntry[];
```

**录入纪律**：
1. **内容逐条来自 EX01 L336-507**（8 类动作库原文），不缩写、不改写 promptEn；条目名与技法备注保留中文
2. 声音类（⑧）按 EX01 的 5 子类组织（环境/动作/身体/台词/音乐），每条标注归属落点（integrated/soundscape/music）
3. **实演类节奏总则**作为类级常量导出（`PERFORM_RHYTHM_RULES`：中速稳定 / 禁 slowly·gently / 禁由慢到快渐变 / 禁 rapid·fast·furious）
4. 通用技法三条（半挂中间态/隔布触摸/高潮爆发）作为可与任意条目组合的独立导出
5. 每类文件头部标注来源行号区间；`ALL_ACTIONS.length ≥ 150` 写进测试断言
6. SFW 可用子集：`SFW_SAFE_CATEGORIES = ["pose", "interact", "expression"]`（R1 风险对策——链路先通的最小集）

### 2.6 M3-7 拼装实现 + M3-8 用户覆盖

- 拼装**直接复用** M2-3 的 `assembleSkill`（apps/core/src/compliance/assembleSkill.ts），M3-7 的交付是**验证 prompts/ 真内容能被它正确拼出**（集成测试：拼 base+shell+policy 断言分隔符与顺序），外加 TK 分段注入扩展：

```ts
// apps/core/src/promptlib/retrieval.ts —— TK 分段注入（decision-log §十九）
export type TkSegment = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";   // S7 使用例不入注入池
/** 按阶段取 TK 段：阶段三四 → S1-S4；阶段五 → S2/S5；软上限单次 ≤2 段由调用方保证 */
export function tkSegmentsFor(stage: "draft" | "fill" | "polish", sceneTypes?: ("A" | "B" | "C1" | "C2")[]): TkSegment[];
```

- M3-8 覆盖三层：复用 assembleSkill roots（项目级→全局→内置），M3-8 的交付是**三 root 覆盖优先级集成测试**（M2-3 已测机制，M3-8 测真文件场景）
- **禁止**在 M3-7 重写拼装逻辑——assembleSkill 是冻结签名，发现问题记 [BLOCKED]

### 2.7 M3 出口标准

1. `pnpm -r exec tsc --noEmit` 三包 0 error（含 M5 代码）
2. vitest 全绿，重点用例：
   - `ALL_ACTIONS.length >= 150` 且八类每类非空、id 唯一、intensityRange/mediaFit 值域合法
   - queryActions 过滤组合（undress + L3 + anime）命中数 > 0；零命中返空数组
   - assembleSkill 用真 prompts/ 内容拼装：六段壳+policy-nsfw 输出含「介质锁定条款」且顺序正确
   - tkSegmentsFor：draft 阶段返回含 S1；fill+场景 C 类不含振动器档位相关段（按 §十九裁剪）；单次 ≤2 段
   - 覆盖三层：项目级覆盖全局覆盖内置的优先级断言（真临时目录）
3. **提示词内容抽查**（主会话人工验收）：base.md 含运镜六条全文与摄像机归因六条纪律；policy-nsfw.md 的 L4 文案是裁决后口径；six-section-hybrid.md 的 first_frame 带反引号

---

## 3. 共同纪律（两轨）

1. **日志**：M3 → `docs/worklog/M03.md`，M5 → `M05.md`。追加不覆盖，先读全文，一次写完整条，七字段全填。
2. **不静默降级（总红线）**：llm/comfy/拼装/检索错误一律显式抛 DramaError；catch 只允许在「重试一次」和「审计写入」两处，且必须注释说明为什么能吞。测试里禁止 `expect(...).toBeTruthy()` 掩盖失败细节。
3. shared M1 schema 文件只读；M5 唯一豁免见 §1.1。
4. 测试全 mock 零真实网络；禁 `any` / `@ts-ignore` / 吞异常。
5. 交活自查：`pnpm -r exec tsc --noEmit` 0 error + 自己轨的 vitest 全绿。

## 4. 已知漂移（照本文件做，别回去改文档）

| # | 漂移 | 裁决 |
|---|---|---|
| F1 | mcp-tools.md 的 `engine: z.enum(["llm","template"])` | D3 已裁 template 不保留；本轮不改 mcp-tools.md，M11 收口时统一收敛 |
| F2 | architecture L1521 / api-contract L963 的 secondsToFrames floor 笔误 | 已裁 ceil（decision-log §20），M7 已按 ceil 实现；文档修订另批处理，本轮不碰 |
| F3 | policy-nsfw.md 的 L4/L5 文案在 nsfw-design 与 EX02 两处口径不同 | 以 nsfw-design §二 2026-11-10 修订版为准（遮挡降级后口径）；EX02 是摘录不动 |
| F4 | M3-6 的「150+ 条」无精确总数 | 以 EX01 原文实际条目数为准，测试断言 `>= 150` 防缩水，上限不封 |
| F5 | config 的 Role 只有三值 vs gate 需要 vision | M5 授权改 `apps/core/src/config/types.ts` ROLES 加 "vision"（decision-log §21 第 3 条），这是 M0 冻结区的唯一豁免 |
