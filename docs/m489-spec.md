# M4+M8+M9 并行施工契约 · 冻结版

> **本文件是 M4/M8/M9 三个里程碑并行期间所有子代理的唯一事实来源。**
> 动手前先读完本文件，再读自己那一节的依据行号。
> **不要自行发挥命名、路径、签名。** 有疑问就在日志里记一条 `[BLOCKED]`，等主会话裁决。
>
> **并行边界（三轨文件零交集）**：
> - M4 只碰 `apps/core/src/validate/`（新建）——20 项自检的机械实现
> - M8 只碰 `apps/core/src/comfy/`（新建）——ComfyUI 客户端与任务调度
> - M9 只碰 `apps/core/src/media/` 的**新增文件**（tts/ / align/ / split/ / resample/ / video2x/ 子目录）与 `apps/core/src/gpu/`（GPU 全局锁，M9 独占）
> - 共享冻结区：`packages/shared`（只读——缺类型记 `[BLOCKED]`）、`apps/core` 既有文件（config/auth/tools/routes/server/index/paths/compliance/shot/media 既有文件/llm/promptlib 一律不改）
>
> **总红线（主人原话，execution-plan §8.2）**：**不静默降级**——任何 llm_*/comfy_*/voice_* 错误不许 catch 后返回默认值；队列满返 `queue_full`、显存不足返 `vram_insufficient`、定位失败报错不猜。
>
> **⚠️ R18 内容纪律（坑 12）**：本批无 R18 长文本写入任务；若施工中需要引用动作库词条，**import 代码引用，不许把词条文本整段复制进新文件**。

依据：`execution-plan.md` §5 M4 段（L201-213）/ M8 段（L262-274）/ M9 段（L277-289）、`architecture.md` §7.1-§7.7（L1131-1185 / L1680-1844）/ §8（任务与资源保护 L1846-1884）、`api-contract.md` §4.4-§4.6（L493-573）/ §2.5（L206-347）/ §7（L1007-1073）、`mcp-tools.md` §3.1、`decision-log.md` §6B（ASR 切分实测）、坑表 12。

---

## 1. M4 · 提示词校验器（9.5 人日，7 子任务）

### 1.1 文件归属

```
apps/core/src/validate/
├─ structure.ts        ← M4-1：结构层（段数/字段名顺序/枚举白名单/排除行位置/孤立 CR 扫描）
├─ numbering.ts        ← M4-2：编号契约层（Hybrid 专项）
├─ coherence.ts        ← M4-3：连贯层（first_frame 启动/0.5s/禁写清单）
├─ content.ts          ← M4-4：内容层（台词逐字/朝向三要素/无动机转向）
├─ sound.ts            ← M4-5：声音层（(Sx)/<Audio N>/soundscape/music）
├─ language.ts         ← M4-6：语言层（官方语法英文/台词 <d>）
├─ index.ts            ← validatePrompt(promptText, opts) 总入口 + RiskItem 输出
└─ *.test.ts
```

### 1.2 核心签名

```ts
// index.ts
import type { TaskType } from "@text2drama/shared";

export interface ValidateIssue {
  /** 对应 M6 风险分 20 项里的编号（⑭⑰ 等）或 M4 自有编号（V1-Vn） */
  code: string;
  severity: 0 | 1 | 2;
  message: string;
  /** 定位到哪一段/哪一行 */
  where?: string;
}
export interface ValidateOptions {
  taskType: TaskType;                 // 段数与字段集合按壳判
  scriptLines?: string[];             // 内容层逐字校验的基准（剧本台词表）
  expectedPictures?: number;          // 编号总数 = 用户给图张数
}
/** 总入口：六层全跑，返回全部 issue；**2 分不许出片**的判定由调用方（M8 提交前）做 */
export function validatePrompt(promptText: string, opts: ValidateOptions): ValidateIssue[];
```

**六层校验规则**（依据 h3-prompt-rules §六合并版 L497-555，逐条机械化为正则/结构断言）：

- **M4-1 结构层**（h3 §6.1）：taskType∈{t2va,i2va,l2va,fl2va} → 三字段（t2va 无指令行）；{ref2va,hybrid} → 六段。字段名与顺序按壳模板白名单；技术排除行 `No subtitles, no watermarks` 必须是最后一行；**孤立 CR 扫描**（/\r(?!\n)/）与纯空白/纯 `>` 伪行 → severity 2
- **M4-2 编号契约层**（h3 §6.2，Hybrid 专项）：关键帧用反引号 `first_frame`/`last_frame`（空格版 `first frame` → 2 分）；正文不得把关键帧写成 `<Picture N>`；`<Picture 1>` 恒为第一张参考图（首个 `<Picture` 引用必须是 1）；编号总数 = expectedPictures；`<Audio N>`/`<Video N>` 从 1 起；关键帧不得写成 `<Subject N>`
- **M4-3 连贯层**（h3 §6.3）：`opens exactly on the first_frame image` 必须出现（有首帧的分支）；禁写清单正则（`holds still on the image`/`the frame holds`/`remains motionless`/`freezes for a moment`/`stays still before`/`a brief pause before`/`the shot lingers`/`slowly comes to life`）任一命中 → 2 分；「承接/下接」两行存在于链上条目（有 `previous` 标记时）
- **M4-4 内容层**（h3 §6.4）：剧本每句台词在提示词 `<d>[Chinese]...</d>` 内逐字出现（scriptLines 逐条 includes；缺句 → 2 分「台词未覆盖」）；Facing 句存在（`Facing:` 前缀）；`she looks at him` 类无朝向写法告警（severity 1）
- **M4-5 声音层**（h3 §6.5）：`(Sx)` 分配连续性（首次出现即定义）；`retention_analysis` 段内不得出现 `(S`；`overall_soundscape` 不得含 `<d>` 内容片段；`non_diegetic_music` 禁抽象情绪词（梦幻/情欲/ethereal/sensual → 1 分）
- **M4-6 语言层**（h3 §6.6）：官方语法英文（字段名/标签/枚举/时间戳）；台词必须在 `<d>[Chinese]` 内；画面可见文字加英文双引号

### 1.3 M4 出口标准（execution-plan L213 原文）

1. **零告警测试**：把 EX05 L33-52（Ref2VA 六段成品）与 EX06 L68-76（I2VA 三字段成品）两段真实骨架喂进 validatePrompt，六层 **0 个 severity≥1 的 issue**
2. **三错注入测试**：人工构造三个坏样本——① 把关键帧写成 `<Picture 1>`（编号契约报 2 分）② 删掉开场动作句（连贯层报 2 分）③ soundscape 抄台词（声音层报 1 分）——**三处必须全报**
3. tsc 0 error + vitest 全绿

### 1.4 M4 必读

- `docs/h3-prompt-rules.md` §六（L497-555）——六层清单的唯一规则来源
- `docs/excerpts/05_ref2va-rules_全文.md` L33-52 与 `docs/excerpts/06_i2va-rules_全文.md` L68-76 —— 零告警测试的基准样本
- `prompts/shells/*.md` —— 字段白名单的结构模板

---

## 2. M8 · ComfyUI 生成后端（12.5 人日，6 子任务）

### 2.1 文件归属

```
apps/core/src/comfy/
├─ registry.ts         ← M8-1：工作流注册表（id/标签/类型/hidden/可用性）
├─ client.ts           ← M8-2：提交与心跳（/prompt → WebSocket /ws）
├─ queue.ts            ← M8-3：队列与显存守门
├─ cancel.ts           ← M8-4：取消
├─ upscale.ts          ← M8-5：图片超分绑定（SeedVR2）
├─ openai.ts           ← M8-6：OpenAI 兼容出口（/v1/*）
└─ *.test.ts
```

**M8 不碰**：`apps/core/src/server.ts`（/v1 路由挂载是 M8-6 交付的 router 工厂，挂载动作留给主会话接线任务——本轮只交付 `createOpenAiRouter()` 返回 express.Router）。

### 2.2 核心签名

```ts
// registry.ts —— M8-1（architecture L1188-1208）
export interface WorkflowEntry {
  id: string; label: string; kind: "image" | "video";
  hidden: boolean;
  available: boolean; reason: string | null;   // 缺模型/缺 adapter 时的原因
  nodes: unknown[];                            // 工作流节点数组；入库前必须 nodes.length > 0
}
export function createRegistry(dir: string): { list(): WorkflowEntry[]; get(id: string): WorkflowEntry | undefined };

// client.ts —— M8-2（architecture L1881-1884 ★心跳坑）
export interface ComfyClientOpts { baseUrl: string; wsUrl: string }
/**
 * 提交：POST {baseUrl}/prompt → { promptId }
 * 心跳：只认 WebSocket /ws 的 progress/executing 事件判活——
 *      ★不许用 GET /history/{id} 判活（终态查询，跑的时候不返数据，120s 必误杀）
 *      ★写死一条测试：/history 空但 ws 有 progress 事件时，任务不许判死
 */
export function createComfyClient(opts: ComfyClientOpts): {
  submit(workflow: unknown): Promise<{ promptId: string }>;
  watch(promptId: string, onEvent: (e: { type: "progress" | "executing" | "done" | "error"; data: unknown }) => void): () => void;
};

// queue.ts —— M8-3（architecture L1872-1879）
export interface QueueOptions { concurrencyCap: number; vramGuardMB: number; maxQueueLength: number }
/** 串行优先（cap 默认 1）；出队前查显存 < guardMB → 挂起（vram_insufficient 503）；超长 → queue_full 503；OOM → /free → 降档重试一次 */
export function createQueue(opts: QueueOptions): {
  enqueue(task: { id: string; run: () => Promise<void>; estimateVramMB: number }): Promise<"queued" | "rejected">;
  /** GPU 锁共用接口：M9 的 gpu/ 模块也用它（同进程单例） */
  status(): { queued: number; running: string | null; suspended: boolean };
};

// cancel.ts —— M8-4（api L488-489）
/** POST /api/tasks/:id/cancel → ComfyUI queue delete + interrupt + abort 轮询；幂等（重复取消返成功） */
export function createCancelCapability(client: ReturnType<typeof createComfyClient>, queue: ReturnType<typeof createQueue>): { cancel(taskId: string): Promise<void> };

// upscale.ts —— M8-5（architecture L1314-1337）
/** SeedVR2 三件套绑定；提交前 assertReallyUpscaling(resolution > 原短边)，否则 llm 风格显式报错（不静默缩图） */
export function assertReallyUpscaling(srcShortEdge: number, resolution: number): void;
export function createUpscaleFlow(client: ReturnType<typeof createComfyClient>): { submitImageUpscale(opts: { assetPath: string; resolution: number }): Promise<{ promptId: string }> };

// openai.ts —— M8-6（api L833-1003 ★包络坑）
/**
 * /v1/models（只列 available）、/v1/images/generations、/v1/videos + /v1/videos/:id
 * ★★响应不套 {ok,data} 包络——openai SDK 会直接抛解析错误；验收必须用官方 openai SDK 直连测一次（mock HTTP 层）
 */
export function createOpenAiRouter(deps: { registry: ReturnType<typeof createRegistry>; queue: ReturnType<typeof createQueue> }): import("express").Router;
```

### 2.3 M8 出口标准

1. tsc 0 error + vitest 全绿（ComfyUI 的 HTTP/WS 全 mock——用本地 http server 或注入 fetch mock）
2. 重点用例：
   - registry：nodes.length === 0 的工作流拒绝入库；缺 adapter → available:false + reason
   - **心跳坑**：模拟 ws progress 事件持续到达而 /history 返回空 → 任务保持 running 不误杀（★写死）
   - queue：cap=1 串行；显存不足挂起 → vram_insufficient；队列超长 → queue_full；OOM → /free 调用 + 降档重试一次
   - cancel 幂等：重复取消不抛
   - assertReallyUpscaling：resolution ≤ 原短边 → 抛错（消息含两个数值）
   - **openai 包络坑**：/v1/images/generations 响应体**不含** "ok"/"data" 顶层键，字段形状符合 openai SDK 期望（用官方 SDK 类型断言或手写形状断言）

### 2.4 M8 必读

- `docs/architecture.md` §7.1-§7.3.1（抽象接口/工作流清单/SeedVR2）、§8（任务模型/队列策略）
- `docs/api-contract.md` §4（L400-540）/§7（L833-1003 /v1 全节）
- `docs/worklog/M07.md` [001]（pickWorkflowFile 已在 media/ 落地，M8 registry 引用同一套工作流 id）

---

## 3. M9 · 媒体链路（12.5 人日，6 子任务）

### 3.1 文件归属

```
apps/core/src/gpu/
└─ lock.ts             ← 全局 GPU 锁（ComfyUI/Video2X/TTS 三方互斥；M8 queue 与本轨共用一把——M9 建锁，M8 的 queue.ts 预留的 holder 接口对接）
apps/core/src/media/   ← 新增子目录（media/ 既有五文件不动）
├─ tts/
│  ├─ client.ts        ← M9-1：IndexTTS 客户端（GPU 锁包装）
│  └─ batch.ts         ← M9-2：批量合成（Task.type="audio" 包装）
├─ align/
│  ├─ normalize.ts     ← M9-3a：繁简归一化 + 字均分
│  └─ align.ts         ← M9-3b：faster-whisper 逐字对齐（容错匹配）
├─ split/
│  └─ split.ts         ← M9-4：按文本片段切音频
├─ resample/
│  └─ resample.ts      ← M9-5：ffmpeg soxr 重采样
├─ video2x/
│  └─ video2x.ts       ← M9-6：Video2X 子进程封装
└─ （各子目录 *.test.ts）
```

**M9 不碰**：`apps/core/src/comfy/**`（M8 的）、`apps/core/src/media/{deriveTaskType,materialCheck,frames,refVideo,workflow}.ts`（既有文件）、validate/**、llm/**。

**GPU 锁的轨道间协议**：M9 建锁（`apps/core/src/gpu/lock.ts`），导出 `acquire(holder: "comfyui" | "tts" | "video2x"): Promise<void>` / `release()` / `status()`。M8 的 queue 本轮**不 import 它**（文件零交集纪律），在 queue.ts 留的 holder 接口注释里标注「M9 gpu/lock 就绪后对接」——真正接线是主会话的收尾任务。

### 3.2 核心签名

```ts
// gpu/lock.ts
export function createGpuLock(): {
  acquire(holder: "comfyui" | "tts" | "video2x"): Promise<void>;  // 被占 → 抛 DramaError "gpu_lock_held" (409) 带 holder
  release(holder: string): void;                                   // 非 holder 调 release → 忽略（幂等）
  status(): { holder: string | null };
};

// tts/client.ts —— M9-1（api §4.6 + mcp §3.1）
/** load/unload 唯一官方入口：先 acquire("tts")，再转发 :17863/api/load|unload；已加载幂等；卸载后 release */
export function createTtsClient(opts: { baseUrl: string; lock: ReturnType<typeof createGpuLock> }): {
  load(): Promise<{ warnings: string[] }>;
  unload(): Promise<void>;
};

// tts/batch.ts —— M9-2（api L569-571）
/** POST :17863/v1/tts/batch → jobId 包装成 Task.type="audio"；durationSec 用实测值；emotion/strength/durationFactor 透传（mcp voiceSynthesize schema） */
export function synthesizeBatch(client: ReturnType<typeof createTtsClient>, items: { id?: string; text: string; emotion?: string; strength?: number; durationFactor?: number }[], voice: string): Promise<{ taskId: string; items: { id?: string; durationSec: number; sampleRate: number }[] }>;

// align/normalize.ts —— M9-3a（decision-log §6B 坑一/坑二）
/** 繁简归一化：NFKC 不管繁简（漸→渐、為→为必须显式映射表）；标点归一 */
export function normalizeCjk(text: string): string;
/** 「我的」类多字 token 按字数均分回单字时间戳 */
export function spreadTokenTiming(token: string, startSec: number, endSec: number): { char: string; startSec: number; endSec: number }[];

// align/align.ts —— M9-3b（★三个坑全处理）
export interface AsrWord { word: string; startSec: number; endSec: number }
/**
 * 文本片段定位（M9-4 的底座）：
 * ① 归一化：normalizeCjk(heard) 与 normalizeCjk(expected) 再比对
 * ② token 拆字流（spreadTokenTiming）后滑窗匹配
 * ③ 容错：莱文斯坦距离 ≤ max(1, len×15%)（decision-log §13.3 裁决——不用上游 exact 严格相等）
 * ④ **找不到/多处命中 → 必须报错不猜**（target_not_found / ambiguous_multiple_exact_targets 语义，抛 DramaError invalid_param 带 details）
 */
export function locateSpan(heard: AsrWord[], expectedText: string): { startSec: number; endSec: number } | never;

// split/split.ts —— M9-4（decision-log §6.2/§6B）
/** 按分镜锁定的文本片段（子串，表示法 B：存文本不存区间）切音频；返回每镜 startSec/endSec；切不出 → 报错不猜 */
export function splitDialogueAudio(fullAudioSec: number, spans: { shotId: string; text: string; startSec: number; endSec: number }[]): { shotId: string; startSec: number; endSec: number }[];

// resample/resample.ts —— M9-5（architecture L1795-1844）
/** ffmpeg soxr：`-y -i in.wav -ar 48000 -ac 1 -c:a pcm_s16le out.wav`；ffmpeg 路径可注入（默认 IndexTTS2_5\bin\ffmpeg.exe）；返回 driftMs（实测零漂移） */
export function resample48k(inputPath: string, outputPath: string, opts?: { ffmpegPath?: string }): Promise<{ driftMs: number }>;

// video2x/video2x.ts —— M9-6（api §7 L1007-1073）
/** 子进程封装：-d 1 写死（0 是 AMD 核显）+ --no-progress + 帧号正则解析进度；运行前 acquire("video2x") */
export function runVideo2x(opts: { inputPath: string; outputPath: string; processor: string; model?: string; scale?: number; lock: ReturnType<typeof createGpuLock> }): Promise<{ assetPath: string; logs: string[] }>;
```

### 3.3 M9 出口标准

1. tsc 0 error + vitest 全绿（whisper/ffmpeg/video2x 子进程全 mock；**decision-log §6B 的真实数据做基准**）
2. 重点用例（★都是实测踩过的坑）：
   - normalizeCjk：`漸`→`渐`、`為`→`为`（NFKC 不转繁简，必须映射表）
   - spreadTokenTiming：`我的` 一个 token 0.1s → 两字各 0.05s
   - locateSpan：正常命中 / 繁体 heard 简体 expected 命中 / 重复台词（「我不知道」×2）→ ambiguous 报错 / 完全缺失 → target_not_found 报错 / ASR 尾部截断导致缺失 → 报错（**三个方向全测，不猜**）
   - 容错匹配：heard 与 expected 差 1 字（≤15%）命中；差 30% 不命中
   - splitDialogueAudio：4 段台词切 4 镜、时刻精确（用 DEC L294-304 的实测逐字数据做样例）
   - resample：mock ffmpeg 进程成功 → driftMs=0；进程失败 → 原错上抛
   - video2x：`-d 1` 参数存在断言（★写死，防退化到 0）；进度正则解析
   - GPU 锁：acquire 冲突 → gpu_lock_held；release 幂等；status 正确

### 3.4 M9 必读

- `docs/decision-log.md` §6B（L264-350 切分实测：三坑数据）/ §13（speech_verification 评价：容错匹配改进方案 L671-707）
- `docs/api-contract.md` §2.5（L206-347）/ §4.6（L541-573）/ §7（L1007-1073）
- `docs/architecture.md` L1795-1844（重采样实测数据）/ §7.7（IndexTTS 生命周期）

---

## 4. 共同纪律（三轨）

1. **日志**：M4 → `docs/worklog/M04.md`，M8 → `M08.md`，M9 → `M09.md`。追加不覆盖，先读全文再追加，一次写完整条，七字段全填。
2. **每完成一个子任务立刻写日志**。
3. **shared 与 apps/core 既有文件冻结**（本批唯一例外：无——M5 的 vision 豁免已用掉）。
4. **测试全 mock 零真实网络/零真实子进程**（whisper/ffmpeg/video2x/ComfyUI 全部注入 mock）；禁 `any`/`@ts-ignore`/吞异常/**静默降级**。
5. **R18 纪律（坑 12）**：本批不读 EX01/EX15 全文；引用动作库词条用 import。
6. **交活自查**：`pnpm -r exec tsc --noEmit` 0 error + 本轨 vitest 全绿（全包有其他轨失败时注明归属）。
7. **真实联调不在本轮**：ComfyUI/IndexTTS/Video2X 的真实调用是 M8/M9 与主会话的后续接线任务，本轮全部 mock 验证。

## 5. 已知漂移（照本文件做）

| # | 漂移 | 裁决 |
|---|---|---|
| G1 | mcp-tools.md 的 `postprocess_*` 工具签名与本契约的 video2x.ts 细节有出入（processor 枚举等） | 本轮以契约签名为准；MCP schema 收敛是 M11 收口任务 |
| G2 | M8-3 说「GPU 锁共用一把」但 M8/M9 文件零交集 | M9 建 gpu/lock.ts，M8 queue 留 holder 接口注释对接；真实接线归主会话收尾 |
| G3 | M4 内容层「台词逐字」需要剧本台词表 | scriptLines 由调用方传入（M3 的分镜流程产出）；本轮测试自备样本 |
| G4 | DEC §13.4 的「is_not_a_speech_classifier」等字段 | 语义吸收进 locateSpan 的报错 details，字段名不照抄 |
| G5 | FCPXML/SRT/CSV 是 M10 的活 | 本批不含 M10；M4/M8/M9 完成后再批 |
