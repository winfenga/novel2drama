# MCP 工具 schema 定义包

> `apps/mcp/src/schemas.ts` 的完整设计。REST 与 MCP 共用 `@n2d/shared` 里的同一份 zod schema。

---

## 1. 设计约束

1. **工具名用下划线分隔**，前缀表达分组（`project_` / `episode_` / `shot_` / `prompt_`）。
2. **入参全部扁平化**，不嵌套业务 id 的层级（`sceneId` 直接给，不要求 `projectId.sceneId`）。
3. **可选参数一律有默认值**，Agent 不填也能跑。
4. **破坏性/占资源的操作必须显式确认**（`confirmRun`）。本地的“资源”是显存和队列，不是钱。
5. **每个工具都有 `requestId`**，用于幂等。
6. **返回值结构化**，不返回自由文本，Agent 才能可靠解析。

---

## 2. 工具清单与说明文案

`toolDescriptions` 会直接进 MCP 的 `description` 字段，写得好不好决定 Agent 用得对不对。

```ts
export const toolDescriptions = {
  project_create:
    "新建改编项目。text 是源文本（小说/故事/剧本/大纲/新闻都能喂）；会自动识别文本单元并提取人物。" +
    "sourceKind 不填时自动嗅探。返回 projectId。",
  project_list:
    "列出所有项目（id、标题、集数、更新时间）。仅用于挑选，不返回全文。",
  project_get:
    "读取项目结构。detail=summary 只返回集/场/镜的层级与统计；detail=full 返回含台词与提示词的全部内容。" +
    "在与项目交互前先调用，避免基于过期假设操作。",
  project_import:
    "追加或替换原文。mode=replace 整篇替换，append 追加。返回文本单元划分与重新分析建议。",
  project_export:
    "导出项目。format=md 出剧本、json 出结构化数据、srt 出字幕、zip 打包全部。",

  source_analyze:
    "分析源文本：划分文本单元、识别人物与情节转折点。可指定目标集数影响切分粒度。" +
    "不同 sourceKind 切法不同（小说按章、故事按段、剧本按场）。" +
    "会覆盖已有分析结果，已手工修改过的需要 regenAll=true 才覆盖。",
  episode_plan:
    "生成分集大纲。episodeIds 为空时全部重生成，否则只重生成指定集。",
  scene_breakdown:
    "把一集拆成场。返回场列表，每场含地点、时间、出场人物、动作。",
  shot_plan:
    "把一场拆成分镜。返回镜头列表，每镜含时长、景别、运镜、画面描述。" +
    "这是生成提示词的前置条件。",
  dialogue_polish:
    "润色指定场的台词。keepOriginalMeaning=true 时只改措辞不改情节。",

  prompt_build_image:
    "为分镜生成图像提示词。会自动注入角色一致性锁定块与风格锚。" +
    "strict=true 时缺少必要信息（如角色外貌未定）会报错而不是猜。",
  prompt_build_video:
    "为分镜生成视频提示词。在图像提示词基础上补充镜头运动与时长信息。",
  prompt_review:
    "质检提示词：检查角色一致性、可生成性、镜头描述完整性。返回 0-100 分与问题列表。" +
    "建议在任何 generate_* 之前调用。",

  generate_shot:
    "生成单个分镜的图或视频（本地 ComfyUI，不产生费用）。必须带 confirmRun=true；" +
    "否则返回预估显存占用与耗时。可能因显存不足被拒绝（vram_insufficient），此时等队列空闲再试。" +
    "视频时长用 durationSec 指定（秒，5–15 整数，超范围返回 invalid_param），回显里会给出 actualDurationSec 说明实际帧对齐后的时长。" +
    "refs 里的每项用 role 标注用途：first 首帧 / last 尾帧 / character 角色参考 / scene 场景参考。" +
    "视频模式由这些 role 自动推导，不需要指定模式名：" +
    "只有首帧→i2va；首+尾→fl2va；只有尾帧→l2va；只有角色/场景参考图→ref2va；" +
    "首帧或尾帧与参考素材同时存在→hybrid（两者都采用，不会丢弃参考图）；什么都没有→t2va。" +
    "hybrid 缺关键帧返回 hybrid_needs_keyframe，缺参考素材返回 hybrid_needs_reference。" +
    "durationSec 只收 5–15 整数秒，超范围返回 invalid_param。",
  generate_episode:
    "批量生成整集（本地 ComfyUI）。同样需要 confirmRun=true；受队列长度限制，" +
    "全部入队会返回 queue_full。durationSec 不填时各分镜用自己保存的时长。",
  generation_status:
    "查询任务状态。taskId 为空时返回项目下所有运行中/最近任务。",

  asset_list:
    "列出项目资产（生成的图/视频/音频），可按 shotId 或类型过滤。",
  asset_get:
    "取单个资产详情，返回本地路径与元数据。",

  postprocess_upscale:
    "超分视频或图片（Video2X 独立程序，不占用 ComfyUI）。processor 可选 realesrgan/realcugan/libplacebo；" +
    "scale 与 width/height 二选一。device 必须是独显索引（本机为 1，0 是 AMD 核显会慢到不可用）。" +
    "会与 ComfyUI 争抢 GPU，任务自动排队。",
  postprocess_interpolate:
    "插帧提升帧率（Video2X + RIFE）。mul 为倍率，如 2 表示帧率翻倍。",
  postprocess_devices:
    "列出可用 Vulkan GPU，用于选 device 参数。无参数。",
} as const;
```

---

## 3. 完整 schema

```ts
// apps/mcp/src/schemas.ts
import { z } from "zod";

const requestId = z.string().uuid().optional().describe("幂等键，重复提交相同 requestId 不会重复执行");

const commonList = {
  keyword: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
};

/* ---------------- 项目 ---------------- */

/** 输入源类型。不限小说。 */
export const sourceKind = z.enum(["novel", "story", "script", "outline", "news", "other"]);

export const projectCreate = z.object({
  title: z.string().min(1).max(120),
  text: z.string().min(100).describe("源文本全文，最少 100 字。小说/故事/剧本/大纲/新闻都行"),
  sourceKind: sourceKind.optional().describe("不填则自动嗅探：看有无『第X章』『角色：』『场景』等标记"),
  fileName: z.string().optional(),
  encoding: z.enum(["utf-8", "gbk", "auto"]).default("auto").describe("中文 txt 常见 gbk，auto 会自动嗅探"),
  requestId,
});

export const projectList = z.object({ ...commonList, requestId });

export const projectGet = z.object({
  projectId: z.string().min(1),
  detail: z.enum(["summary", "full"]).default("summary"),
  requestId,
});

export const projectImport = z.object({
  projectId: z.string().min(1),
  text: z.string().min(1).describe("要导入的文本。append 时可短；replace 时建议 ≥100 字"),
  mode: z.enum(["replace", "append"]).default("append")
    .describe("默认 append 追加。**replace 会整篇覆盖原文，是不可逆操作，必须带 confirmRun=true**"),
  sourceKind: sourceKind.optional(),
  fileName: z.string().optional(),
  structured: z.boolean().default(false).describe("true 时 text 是 JSON 字符串（结构见 packages/shared/drama-json）"),
  format: z.enum(["drama-json"]).optional().describe("structured=true 时必填"),
  confirmRun: z.boolean().default(false).describe("mode=replace 时必为 true，否则返回 confirm_run_required"),
  requestId,
});

export const projectExport = z.object({
  projectId: z.string().min(1),
  format: z.enum(["md", "json", "srt", "zip"]).default("md"),
  episodeIds: z.array(z.string()).optional().describe("为空导出全部"),
  requestId,
});

/* ---------------- 剧作 ---------------- */

export const sourceAnalyze = z.object({
  projectId: z.string().min(1),
  targetEpisodeCount: z.number().int().min(1).max(200).optional()
    .describe("期望集数，影响切分粒度；不填按字数自动估算"),
  splitBy: z.enum(["chapter", "unit", "char", "auto"]).default("auto")
    .describe("chapter 按章（小说）/ unit 按文本单元 / char 按字数硬切 / auto 按 sourceKind 推断"),
  regenAll: z.boolean().default(false).describe("true 覆盖已有手工修改的分析结果"),
  requestId,
});

export const episodePlan = z.object({
  projectId: z.string().min(1),
  episodeCount: z.number().int().min(1).max(200).optional(),
  episodeDurationSec: z.number().int().min(30).max(600).default(90),
  tone: z.enum(["爽感", "虐心", "轻松", "悬疑"]).optional(),
  episodeIds: z.array(z.string()).default([]).describe("为空则全部重生成"),
  requestId,
});

export const sceneBreakdown = z.object({
  episodeId: z.string().min(1),
  maxScenesPerEpisode: z.number().int().min(1).max(20).default(8),
  requestId,
});

export const shotPlan = z.object({
  sceneId: z.string().min(1),
  globalSegDurationSec: z.number().int().min(5).max(15).default(5)
    .describe("单镜目标时长 D（秒，5–15 整数）。改它会级联重算时间码/台词预算/动作槽/节拍"),
  perShotOverride: z.record(z.string(), z.number().int().min(5).max(15)).default({})
    .describe("单镜覆写，如 {\"S03\": 10}；同受 5–15 整数约束"),
  shotSizeBias: z.enum(["balanced", "closeup", "wide"]).default("balanced"),
  cameraStyle: z.enum(["cinematic", "viral", "documentary"]).default("cinematic")
    .describe("cinematic 电影感 / viral 网感快剪 / documentary 纪实"),
  requestId,
});

export const dialoguePolish = z.object({
  sceneId: z.string().min(1),
  tone: z.enum(["爽感", "虐心", "轻松", "悬疑"]).optional(),
  keepOriginalMeaning: z.boolean().default(true),
  requestId,
});

/* ---------------- 提示词 ---------------- */

export const promptBuildImage = z.object({
  shotId: z.string().min(1),
  engine: z.enum(["llm", "template"]).default("llm")
    .describe("llm=调 LLM 生成提示词 / template=本地模板拼装（旧 cloud/local/comfy 已废弃）"),
  language: z.enum(["zh", "en"]).default("zh"),
  style: z.string().optional().describe("风格锚名称，默认取项目设置"),
  strict: z.boolean().default(true),
  requestId,
});

export const promptBuildVideo = z.object({
  shotId: z.string().min(1),
  engine: z.enum(["llm", "template"]).default("llm")
    .describe("llm=调 LLM 生成提示词 / template=本地模板拼装（旧 cloud/local/comfy 已废弃）"),
  language: z.enum(["zh", "en"]).default("zh"),
  includeCameraMove: z.boolean().default(true),
  strict: z.boolean().default(true),
  requestId,
});

export const promptReview = z.object({
  shotId: z.string().min(1),
  kind: z.enum(["image", "video"]).default("image"),
  prompt: z.string().optional().describe("不传则用分镜上已存的提示词"),
  requestId,
});

/* ---------------- 生成 ---------------- */

const generationParams = z.object({
  size: z.string().optional(),
  seed: z.number().int().optional(),
  count: z.number().int().min(1).max(4).default(1),
  fps: z.number().int().optional(),
  // 注意：视频时长不在这里，走顶层的 durationSec（上限 15s，见 generateShot）
}).partial().default({});

export const generateShot = z.object({
  shotId: z.string().min(1),
  kind: z.enum(["image", "video"]).default("image"),
  provider: z.string().optional().describe("不填用项目默认（本地 ComfyUI 工作流 id）"),
  refs: z.array(z.object({
    assetId: z.string().min(1),
    kind: z.enum(["image", "video", "audio"]).default("image"),
    role: z.enum(["first", "last", "character", "scene", "auto"]).default("auto")
      .describe("first=首帧 last=尾帧 character=角色参考 scene=场景参考 auto=按上传顺序推断。" +
                "首帧/尾帧与参考素材可同时存在，此时模式为 hybrid，两类素材都会被采用"),
  })).default([]).describe("参考素材及其角色。会据此推导视频模式（t2va/i2va/l2va/fl2va/ref2va/hybrid）"),
  durationSec: z.number().int().min(5).max(15).default(5)
    .describe("视频时长（秒）。内部按 17n+5 转帧数，封顶 362 帧≈15.08 秒"),
  params: generationParams,
  confirmRun: z.boolean().default(false)
    .describe("必须为 true 才会真正占用 GPU 执行；false 时返回预估显存与耗时"),
  requestId,
});

export const generateEpisode = z.object({
  episodeId: z.string().min(1),
  kind: z.enum(["image", "video"]).default("image"),
  shotIds: z.array(z.string()).default([]).describe("为空则整集"),
  durationSec: z.number().int().min(5).max(15).optional().describe("批量时的统一时长（秒，5–15 整数）；不填用各分镜自己的"),
  confirmRun: z.boolean().default(false),
  requestId,
});

export const generationStatus = z.object({
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(["queued", "running", "done", "failed", "canceled"]).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  requestId,
});

/* ---------------- 资产 ---------------- */

export const assetList = z.object({
  projectId: z.string().min(1),
  shotId: z.string().optional(),
  type: z.enum(["image", "video", "audio"]).optional(),
  requestId,
});

export const assetGet = z.object({
  assetId: z.string().min(1),
  requestId,
});

/* ---------------- 超分 / 插帧（Video2X） ---------------- */

export const postprocessUpscale = z.object({
  assetId: z.string().min(1),
  processor: z.enum(["realesrgan", "realcugan", "libplacebo"]).default("realesrgan"),
  model: z.string().optional().describe("realesrgan-plus / realesrgan-plus-anime / realesr-animevideov3 …"),
  scale: z.number().min(1).max(4).optional().describe("与 width/height 二选一"),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  device: z.number().int().default(1).describe("Vulkan 设备索引；本机 1=RTX 5070，0=核显，别填 0"),
  codec: z.enum(["libx264", "libx265", "h264_nvenc", "hevc_nvenc"]).default("libx264"),
  extraEncoderOptions: z.record(z.union([z.string(), z.number()])).optional()
    .describe('如 {"crf": 17, "preset": "slow"}'),
  confirmRun: z.boolean().default(false),
  requestId,
});

export const postprocessInterpolate = z.object({
  assetId: z.string().min(1),
  mul: z.number().min(1).max(8).default(2).describe("帧率倍率"),
  model: z.enum(["rife-v4.6", "rife-v4.25", "rife-v4.25-lite", "rife-v4.26"]).default("rife-v4.6"),
  sceneThresh: z.number().min(0).max(100).default(100),
  device: z.number().int().default(1),
  confirmRun: z.boolean().default(false),
  requestId,
});

export const postprocessDevices = z.object({ requestId });

/* ---------------- 注册表 ---------------- */

export const toolNames = [
  "project_create", "project_list", "project_get", "project_import", "project_export",
  "source_analyze", "episode_plan", "scene_breakdown", "shot_plan", "dialogue_polish",
  "prompt_build_image", "prompt_build_video", "prompt_review",
  "generate_shot", "generate_episode", "generation_status",
  "asset_list", "asset_get",
  "postprocess_upscale", "postprocess_interpolate", "postprocess_devices",
  "voice_load", "voice_unload", "voice_synthesize", "voice_list", "voice_reference_upload",
  "config_get", "config_test",
] as const;

export type ToolName = (typeof toolNames)[number];

export const toolInputSchemas: Record<ToolName, z.ZodObject<any>> = {
  project_create: projectCreate,
  project_list: projectList,
  project_get: projectGet,
  project_import: projectImport,
  project_export: projectExport,
  source_analyze: sourceAnalyze,
  episode_plan: episodePlan,
  scene_breakdown: sceneBreakdown,
  shot_plan: shotPlan,
  dialogue_polish: dialoguePolish,
  prompt_build_image: promptBuildImage,
  prompt_build_video: promptBuildVideo,
  prompt_review: promptReview,
  generate_shot: generateShot,
  generate_episode: generateEpisode,
  generation_status: generationStatus,
  asset_list: assetList,
  asset_get: assetGet,
  postprocess_upscale: postprocessUpscale,
  postprocess_interpolate: postprocessInterpolate,
  postprocess_devices: postprocessDevices,
  voice_load: voiceLoad,
  voice_unload: voiceUnload,
  voice_synthesize: voiceSynthesize,
  voice_list: voiceList,
  voice_reference_upload: voiceReferenceUpload,
  config_get: configGet,
  config_test: configTest,
};
```

### 3.1 语音与配置工具

```ts
/* ---------------- 语音 ---------------- */

export const voiceLoad = z.object({ requestId }).describe(
  "把 IndexTTS 模型装进显存（约 14 秒，占 6.7GB）。**必须走这个工具，不要直接打 :17863/api/load**——" +
  "这里会先抢全局 GPU 锁，避免 ComfyUI 正在出图时被挤爆。已有任务占着 GPU 时返回 gpu_lock_held。" +
  "已加载时幂等返回成功，不重复加载。"
);

export const voiceUnload = z.object({ requestId }).describe(
  "把 IndexTTS 模型卸出显存（约 0.3 秒），释放后 ComfyUI 才能出图。排队中的 ComfyUI 任务会自动被唤醒。"
);

export const voiceSynthesize = z.object({
  voice: z.string().min(1).describe("音色 id，先调 voice_list 查"),
  characterId: z.string().optional()
    .describe("角色 id。给了就按角色的 VoiceProfile 自动解析音色，此时 voice 可省略——推荐用这个，避免每个角色手动背音色"),
  items: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(1),
    emotion: z.enum(["auto","happy","angry","sad","afraid","disgusted","melancholic","surprised","calm"])
      .default("auto"),
    strength: z.number().min(0).max(1).default(0.8)
      .describe("0–1，内部按 normalize_emo_vec 归一化到总和 0.8，填 1 实际生效约 0.8"),
    durationFactor: z.number().min(0.5).max(2).default(1)
      .describe("超出 0.5–2.0 会被静默截断，不报错"),
  })).min(1).max(64),
  lang: z.enum(["ZH","EN","JA","ES","AR"]).default("ZH"),
  upsample: z.boolean().default(true).describe("true 输出 48k（ComfyUI 视频轨需要），false 输出原生 22.05k"),
  requestId,
}).describe(
  "批量配音（本地 IndexTTS 2.5）。**前提是已 voice_load**，否则返回 voice_not_loaded。" +
  "返回 taskId（drama-core 的 Task，type=audio）与每条的 durationSec（实测值）、sampleRate。" +
  "**配音必须在出片之前**——音频时长是算视频帧数的输入。"
);

export const voiceList = z.object({ requestId }).describe(
  "列出可用音色（id、时长、是否会被 15s 截断）。id 即 voices/ 下的文件名（不含扩展名）。"
);

export const voiceReferenceUpload = z.object({
  characterId: z.string().min(1),
  voiceId: z.string().min(1),
  language: z.enum(["ZH","EN","JA","ES","AR"]).default("ZH"),
  defaultEmotion: z.enum(["auto","happy","angry","sad","afraid","disgusted","melancholic","surprised","calm"])
    .default("auto"),
  durationFactor: z.number().min(0.5).max(2).default(1),
  requestId,
}).describe("把音色绑定到角色（写 VoiceProfile）。绑定后 voice_synthesize 传 characterId 即可，不用每次指定音色。");

/* ---------------- 配置（只读） ---------------- */

export const configGet = z.object({ requestId }).describe(
  "读取 LLM 后端配置（Key 已脱敏为 ***，另带 hasKey 布尔）。Agent 只能读，不能写。"
);

export const configTest = z.object({
  target: z.string().default("*").describe("后端 id，或 * 全测"),
  requestId,
}).describe("测 LLM 后端连通性。打 GET {baseUrl}/models，能列出模型即视为通。");
```

---

## 4. 给外部 Agent 的 instructions

放 `apps/mcp/agent-instructions.md`，MCP Server 启动时作为 `instructions` 注入。

```markdown
# 文本转短剧工作台 · Agent 操作指南

## 你的角色
你是这个工作台的编剧与分镜助手。用户给的可能是小说、短故事、剧本、大纲甚至一条新闻——
**不限于小说**。你的任务是把任何文本拆成可拍摄的短剧分镜。

## 基本流程
1. `project_get` 先看现状。不要假设项目是空的。
2. 按 分析 → 集纲 → 分场 → 分镜 → 提示词 → 质检 → **配音** → 生成 的顺序推进。
3. 每一步做完向用户汇报关键产出，再问是否继续。

## 关于输入源
- `project_create` 的 `sourceKind` 不填会自动嗅探，乱猜不如留空。
- 剧本类（`script`）本来就有对话和场次标记，**跳过改编直接分镜**，不要重写台词。
- 大纲类（`outline`）框架不全，需要主动扩写，但要保持用户给的骨架不变。
- 新闻类（`news`）事实性强，改写成戏剧冲突时可以虚构细节，但核心事件不能改。

## 硬性规则
- **不要跳步**。没分镜就生成提示词会报错，不是你该绕的设计。
- **生成前必须 `prompt_review`**。分数低于 60 的分镜不要拿去生成。
- **generate_* 要显式确认**。用户没明确要求出片，就不要传 confirmRun=true——不是怕花钱，是会占满本地 GPU 让用户等。
- **配音在出片之前**。先 `voice_synthesize` 拿到实测时长，再据此定视频帧数；顺序反了就得返工。
- **配音和出图互斥**。IndexTTS 峰值 7043MB，ComfyUI 6349MB，卡总共 8124MB，装不下两个。
  正确的交接顺序（**不是**「出片完成再配音」）：
  ```
  voice_load → voice_synthesize（拿实测时长）→ voice_unload
    → ComfyUI 出图 → 出片（帧数由上面拿到的时长决定）
    → 若改了台词要重配：voice_load → voice_synthesize → voice_unload → 重跑受影响镜头
  ```
  **装卸一律走 `voice_load` / `voice_unload`**，不要直接打 `:17863/api/*`——
  那条路绕过了全局 GPU 锁，ComfyUI 正在出图时会把任务挤爆。
- **一次别塞满队列**。整集几十个镜头一次性入队会撞 `queue_full`，按场推进。
- **保持角色一致**。提示词里的角色锁定块不要删改，那是用户设定的外观锚点。
- **视频模式不用你选**。给 `refs` 里每张图标对 `role`（first/last/character/scene），模式自动推导：
  只有首帧→`i2va`；首+尾→`fl2va`；只有尾帧→`l2va`；
  **只有角色/场景参考图（无音视频、无关键帧）→`ref2va`**；**首帧/尾帧与参考素材同时存在→`hybrid`**；
  什么都没有→`t2va`。
- **首帧和角色参考可以一起给**。这是 `hybrid`，两张都会被采用——想要「从这张图开始动，同时锁住人物长相」就用它。
- **别给 `t2va` 塞素材**。有参考图就标首帧或角色参考，留空才是文生。
  **带参考素材时传 `t2va`/`i2va`/`l2va`/`fl2va` 会被拒（`invalid_task_type_for_media`）**，因为引擎只接受 `ref2va` 或 `hybrid`。
- **hybrid 缺一类素材会降级**。只给首帧没参考 → 实际是 `i2va`（壳变三字段）；只给参考没关键帧 → 实际是 `ref2va`。回显里的 `promptShell` 会告诉你壳变了。
- **时长注意帧对齐**。`durationSec` 只收 **5–15 整数秒**。`durationSec: 5` 实际出 124 帧 = 5.17 秒；`12` 会出 277 帧 = **11.54 秒**（`17n+5` 网格向下对齐，最多短 0.54 秒）。回显里有 `actualDurationSec`，别当成精确值。
- **超分别填错 device**。本机 Vulkan 设备 0 是 AMD 核显，超分会慢十倍；固定用 device=1。
- **超分和生成别同时跑**。Video2X 与 ComfyUI 抢显存，队列会自动串行，但要预期到等待。

## 出错时
- `llm_no_backend`：**没有任何启用的 LLM 后端**。让用户去设置页配一个，不要自己找 Key，也不要试图降级成规则解析——设计上没这条退路。
- `llm_no_role`：某个角色（text/prompt/plan）没有可用后端。指出缺哪个角色，让用户配。
- `llm_unreachable`：后端连不上。报告 baseUrl 与原始错误，本地后端常见是 Ollama 没启动。
- `llm_auth`：401/403。Key 无效或无权限，让用户去设置页换。
- `llm_model_not_found`：模型名不对。列出该后端 `/models` 返回的可用列表，让用户挑。
- `token_budget_exceeded`：报告项目累计 token 用量与预算，等用户决定是否追加。
- `comfy_offline`：提示用户本地 ComfyUI 没起来，给出重启建议，不要重试死循环。
- `vram_insufficient` / `comfy_out_of_memory`：报告剩余显存与当前队列，建议降低分辨率或等队列空闲，不要反复重试。
- `voice_offline`：IndexTTS 服务没起（`:17863`）。提示用户双击 `启动服务.cmd`。
- `voice_not_loaded`：TTS 服务在跑但模型没装进显存（409）。调 `voice_load`（约 14 秒），**不要直接打 `:17863/api/load`**——那条路绕过全局 GPU 锁。
- `hybrid_needs_keyframe`：走 `hybrid` 但一个关键帧都没给。要么补一张标 `first`/`last` 的图，要么降级走 `ref2va`，并说明壳会变。
- `hybrid_needs_reference`：走 `hybrid` 但一件参考素材都没给。补一张标 `character`/`scene` 的图，或降级走 `i2va`（壳变三字段）。
- `invalid_task_type_for_media`：显式指定的 `taskType` 与素材构成冲突（如带参考素材却传 `i2va`）。**不要自动改路**，把冲突点告诉用户，让他决定是删素材还是换模式。
- `duplicate_frame_role`：同一 `role` 标了多张图（首帧/尾帧各只能一张）。指出哪几张重复了。
- `workflow_unavailable`：说明缺哪个模型/节点，让用户去装，不要换一个"差不多"的工作流蒙混。
- `gpu_lock_held`：GPU 被另一类任务占用（超分↔生成↔配音），报告占用方，等它结束。
- `video2x_failed`：附带 stderr 尾部原文，常见原因是 device 填错或模型名不存在。
- `queue_full`：先 `generation_status` 看队列积压，分批提交。
- `task_busy`：先 `generation_status` 看有没有在跑的任务，等它结束。
```

---

## 5. 幂等实现

```ts
// apps/core/src/tools/idempotency.ts
const seen = new Map<string, { at: number; result: unknown }>();
const TTL = 10 * 60 * 1000;

export async function withIdempotency<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const hit = seen.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.result as T;
  const result = await fn();
  seen.set(key, { at: Date.now(), result });
  for (const [k, v] of seen) if (Date.now() - v.at > TTL) seen.delete(k);
  return result;
}
```

> 内存实现只够单进程。要多实例就换 SQLite 表，字段 `(requestId PK, result JSON, createdAt)`。

---

## 6. 审计日志

```jsonl
{"ts":"2026-11-10T01:12:03Z","name":"shot_plan","requestId":"...","paramsHash":"9f3a","ok":true,"code":null,"elapsedMs":8120}
```

- 参数只记 hash + 关键字段（id、数量），不记全文。
- 日志按天切分，保留 30 天。
- `GET /api/audit?from=&to=&name=` 供 GUI 排查用。
