# 接口契约 · text-to-drama

> 输入源不限小说：小说 / 短故事 / 剧本 / 大纲 / 新闻都能喂进来。
> 见 §5.0。

> 配套 `技术实现.md`。所有接口默认绑 `127.0.0.1:8400`。

---

## 0. 通用约定

### 0.1 认证

| 场景 | 头 |
|---|---|
| GUI | `Authorization: Bearer <sessionToken>`（启动时注入页面） |
| MCP 转发 | `x-drama-token: <token>`（来自 `~/.novel2drama/config.json`） |

### 0.2 响应包络

成功：
```json
{ "ok": true, "data": { ... }, "meta": { "requestId": "...", "elapsedMs": 12 } }
```

失败：
```json
{
  "ok": false,
  "error": {
    "code": "shot_not_found",
    "message": "分镜不存在",
    "hint": "先调用 shot_plan 生成分镜",
    "details": {}
  }
}
```

HTTP 状态码按语义：400 参数 / 401 未认证 / 403 跨站 / 404 不存在 / 409 状态冲突 / 429 限流 / 500 内部 / 502 上游失败 / 504 超时。

### 0.3 错误码表（唯一权威）

**全小写下划线。** 所有服务、MCP、GUI 共用这一张表，别处只引用不重复定义。

| code | HTTP | 含义 |
|---|---|---|
| `project_not_found` | 404 | 项目不存在 |
| `shot_not_found` | 404 | 分镜不存在 |
| `scene_not_found` | 404 | 场景不存在 |
| `asset_not_found` | 404 | 资产不存在 |
| `asset_in_use` | 409 | 资产被 `Shot.outputs` 引用，拒绝删除 |
| `llm_no_backend` | 400 | 没有任何启用的 LLM 后端（**不降级**） |
| `llm_no_role` | 400 | 该角色（text/prompt/plan）没有可用后端 |
| `llm_private_url` | 400 | 指向内网/loopback 但未标 `local: true` |
| `llm_unreachable` | 502 | 后端连不上（本地 Ollama 没起也归这里） |
| `llm_auth` | 502 | 上游 401/403，Key 无效或无权限 |
| `llm_model_not_found` | 502 | 模型名不对 |
| `llm_bad_json` | 502 | 模型返回的不是合法 JSON（已重试仍失败） |
| `token_budget_exceeded` | 429 | 项目 LLM token 预算用尽（批量重生成类操作被拒） |
| `task_busy` | 409 | 同类任务在跑，拒绝并发 |
| `task_not_found` | 404 | 任务不存在 |
| `confirm_run_required` | 400 | 需显式确认执行（未带 `confirmRun`） |
| `vram_insufficient` | 503 | 剩余显存低于守门阈值，队列挂起 |
| `queue_full` | 503 | 队列已满，拒绝入队 |
| `comfy_offline` | 503 | 本地 ComfyUI 不可达 |
| `comfy_out_of_memory` | 500 | ComfyUI 显存不足（已尝试 /free 仍失败） |
| `workflow_unavailable` | 500 | 工作流所需模型/节点缺失 |
| `gpu_lock_held` | 409 | GPU 被另一类任务占用（生成↔超分↔配音三方互斥） |
| `video2x_failed` | 500 | Video2X 子进程失败（含 stderr 尾部） |
| `voice_offline` | 503 | IndexTTS 服务不可达（`:17863`） |
| `voice_not_loaded` | 409 | TTS 服务在跑但模型未装进显存 |
| `voice_no_reference` | 400 | 角色没有绑定 VoiceProfile，且未显式给 `voice` |
| `source_video_truncated` | 200 | ⚠️ 非错误：参考视频超过 15s 被截断，结果里带标记 |
| `unsupported_video_media` | 400 | 参考媒体格式不支持 |
| `missing_reference_image` | 400 | 模式要求首帧/尾帧但没有对应 `role` 的图 |
| `missing_reference_media` | 400 | 模式要求参考媒体但没有 |
| `duplicate_frame_role` | 400 | 同一 `role` 标了多张图（first/last 只能各一张） |
| `hybrid_needs_keyframe` | 400 | 走 hybrid 但一个关键帧都没给 |
| `hybrid_needs_reference` | 400 | 走 hybrid 但一件参考素材都没给 |
| `invalid_task_type_for_media` | 400 | 显式 `taskType` 与素材构成冲突（如带参考素材却传 `i2va`） |
| `invalid_param` | 400 | 参数非法 |
| `token_invalid` | 401 | token 不对 |

> `cloud_*` 系列已废弃，统一改为 `llm_*`。旧码在响应里仍可能出现，
> 客户端按前缀兼容即可。

---

## 1. 项目

### `POST /api/projects`
```json
// req
{ "title": "示例", "text": "...", "fileName": "a.txt", "encoding": "utf-8",
  "sourceKind": "novel|story|script|outline|news|other" }
// res.data
{ "id": "prj_xxx", "title": "示例", "sourceKind": "novel",
  "charCount": 120000, "detectedUnits": 24, "createdAt": "2026-11-10T01:00:00Z" }
```

`sourceKind` 省略时由服务端嗅探（看有没有 `第X章`、`角色：`、`场景` 等标记），嗅探结果放 `detectedKind`。

### `GET /api/projects`
`GET /api/projects?keyword=&page=1&pageSize=20`

### `GET /api/projects/:id`
`?detail=full|summary`

### `PATCH /api/projects/:id`
局部更新 settings，走深合并。

### `POST /api/projects/:id/import`
**追加或替换原文。** 取代原 `import-novel`。

```json
{ "text": "...", "mode": "replace|append", "fileName": "b.md", "sourceKind": "story" }
```

三种喂法都走这一个接口：

| 方式 | 怎么传 |
|---|---|
| 直接粘贴 | `text` |
| 上传 `.txt` / `.md` | 服务端读 `text` 字段（前端先读成字符串） |
| 带结构 | `text` 传 JSON 字符串 + `structured: true, format: "drama-json"` |

返回重新分析建议：

```json
{
  "ok": true, "charCount": 3200,
  "units": [{ "index": 1, "title": "第一章", "range": [0, 3200] }],
  "analysisSuggested": true,
  "reasons": ["章节结构变化", "新增角色 3 个"]
}
```

> 旧的 `POST /api/projects/:id/import-novel` 保留为别名，内部转发到本接口，`sourceKind` 默认 `novel`。不推荐新代码使用。

### `GET /api/projects/:id/export`
`?format=md|json|srt|zip`

---

## 2. 剧本链路

### 2.0 术语：文本单元（sourceUnit）

统一用 `sourceUnit`，不用「章节」。

| `sourceKind` | `sourceUnit` 是什么 |
|---|---|
| `novel` | 章 / 卷 |
| `story` | 自然段 |
| `script` | 场次 |
| `outline` | 条目 |
| `news` | 事件块 |

`char` 切分（按字数硬切）是兜底策略，`sourceUnit` 里标 `synthetic: true`。

### `POST /api/projects/:id/analyze`

取代原 `novel/analyze`。

```json
// req
{ "options": { "splitBy": "unit|chapter|char", "targetEpisodeCount": 12, "genre": "都市", "tone": "爽感" } }
// res.data
{
  "sourceUnits": [{ "index": 1, "title": "...", "range": [0, 3200], "synthetic": false }],
  "characters": [{ "id": "chr_1", "name": "林晚", "role": "protagonist", "confidence": 0.92 }],
  "plotBeats": [{ "type": "turning", "summary": "...", "range": [1000, 1200] }]
}
```

> 长任务：返回 `{ "taskId": "..." }` 也可，前端轮询 `GET /api/tasks/:id`。
> 旧路径 `POST /api/projects/:id/novel/analyze` 保留为别名。

### `POST /api/projects/:id/episodes/plan`
```json
{ "episodeCount": 12, "episodeDurationSec": 90, "regenAll": false, "episodeIds": [] }
```

### `POST /api/episodes/:id/scenes/breakdown`
```json
{ "maxScenesPerEpisode": 8 }
```

> 旧字段 `avgShotCountPerScene` 已删除。镜头数由**时长级联**反推（`D` 定后，镜头数由内容与 `ceil(N/3)` 台词条数决定），不再作为前向输入。

### `POST /api/scenes/:id/shots/plan`
```json
{ "globalSegDurationSec": 5, "perShotOverride": {}, "shotSizeBias": "balanced", "cameraStyle": "cinematic" }
```

> 旧字段 `shotDurationRange: [2,5]` 已删除 —— 下限 2 秒违反 H3 的 5 秒硬约束。
> 新字段 `globalSegDurationSec` 是**单镜目标时长 D**，合法区间 **5–15 整数秒**；单镜覆盖用 `perShotOverride`，同受该约束。

### `POST /api/scenes/:id/dialogue/polish`
```json
{ "tone": "爽感", "keepOriginalMeaning": true }
```

---

## 2.5 语音合成（IndexTTS 2.5 独立服务）

**位置：** `D:\AI\IndexTTS2_5`，端口 `17863`，独立进程，不是 ComfyUI 的一部分。

**为什么独立：** IndexTTS 稳态峰值 7043 MB，ComfyUI 出图 6349 MB，卡总共 **8124 MB** —— **无法共存**。所以 TTS 做成独立服务，用**手动加载/卸载**控制显存交接，而不是由我们的主程序自动启停。

**管线顺序（硬约束）：** 剧本 → 分镜 → 台词拆分 → **TTS** → 按实测时长定帧数 → i2v → 拼接。TTS 必须先于视频，因为出片帧数由音频时长决定。

### 2.5.1 生命周期契约

| 端点 | 作用 | 是否占显存 |
|---|---|---|
| `GET /v1/capabilities` | 能力声明 | 否 |
| `POST /api/load` | 装模型进显存 | 装后占 6.7 GB |
| `POST /api/unload` | 卸模型，服务不退出 | 否 |

> ⚠️ **主程序不要直接调这两个端点。** 走 `drama-core` 的 `/api/voice/load` 与 `/api/voice/unload`
> （即 MCP 的 `voice_load` / `voice_unload`），它们会先抢全局 GPU 锁。
> 直连 `:17863` 会绕过锁，ComfyUI 正在出图时会把任务挤爆。

**交接顺序（配音在前，出片在后）：**

```
① load    (14s) → 批量 TTS → 拿到实测时长
② unload  (0.3s) → 释放 6.7GB
③ ComfyUI 出图 → 出片（帧数由第①步时长决定）
④ 台词改动要重配 → 回到 ①
```

实测：加载 **14.0s**，卸载 **0.3s**，卸载后显存从 705 MB 回到 6937 MB。

未加载时调合成接口返回 **409**（`voice_not_loaded`），不会偷偷加载模型。

### 2.5.2 `GET /v1/capabilities`

外部程序启动时先问一次，据此决定调什么。

```json
{
  "engine": "indextts2.5",
  "protocol": "novel2drama-tts/1",
  "sampleRate": 22050,
  "channels": 1,
  "languages": ["ZH","EN","JA","ES","AR"],
  "durationFactor": { "min": 0.5, "max": 2.0, "default": 1.0 },
  "emotions": { "values": ["happy","angry","sad","afraid","disgusted","melancholic","surprised","calm"],
                "default": "auto", "strengthRange": [0,1] },
  "batch": { "supported": true, "maxItems": 64 },
  "model": { "loaded": false, "peakVRAMMB": 7100, "loadSecondsTypical": 14.0 },
  "vram": { "freeMB": 7013, "totalMB": 8124 }
}
```

### 2.5.3 `POST /v1/tts/batch`

短剧一集几百句台词，必须能一次提交。`defaults` 提供整批默认值，单条可覆盖。

```json
{
  "voice": "流萤.wav",
  "lang": "ZH",
  "defaults": { "emotion": "auto", "durationFactor": 1.0 },
  "items": [
    { "id": "s001", "text": "夜色渐深，我的光芒为迷途者指引方向。" },
    { "id": "s002", "text": "你终于来了。", "emotion": "angry", "strength": 0.9 },
    { "id": "s003", "text": "我等了你很久很久。", "emotion": "sad", "durationFactor": 1.2 }
  ],
  "wait": true
}
```

响应：

```json
{
  "ok": true, "jobId": "8acd2d498da8", "status": "done", "elapsedSec": 20.1,
  "results": [
    { "id": "s001", "ok": true, "audioPath": "...", "url": "/files/...",
      "durationSec": 4.63, "genSeconds": 13.29, "rtf": 2.87 },
    { "id": "s002", "ok": true, "durationSec": 2.11, "rtf": 1.72 }
  ]
}
```

- `wait: false` 时立即返回 `jobId`，用 `GET /v1/tts/batch/:jobId` 轮询进度。
- 单条失败不影响整批，失败项带 `ok:false` + `error`。
- **`durationSec` 是实测值，主程序据此算帧数**，不要用估算。

### 2.5.4 `POST /api/tts`（单句）

给页面和调试用，字段同上但单条。返回多一个 `filename`。

### 2.5.5 时长控制（实测精度）

`durationFactor` 是短剧对时长的唯一硬手段：

| 设定 | 实测比例 |
|---|---|
| 0.8 | 0.786 |
| 1.0 | 1.000 |
| 1.5 | 1.516 |

误差 <3%。**范围 0.5–2.0，超出自动截断。**

### 2.5.5b 采样率与重采样（重要）

| 字段 | 值 | 说明 |
|---|---|---|
| `nativeSampleRate` | 22050 | 模型原生，**由声码器权重写死，改不了** |
| `sampleRate` | 48000 | 默认交付采样率 |

**所有合成接口默认输出 48000 Hz**，要原始 22050 传 `"upsample": false`。

返回体同时给两套字段，方便核对：

```json
{
  "filename": "tts_xxx_48000.wav",
  "sampleRate": 48000, "upsampled": true, "durationSec": 4.19,
  "rawPath": "...\\tts_xxx.wav", "rawSampleRate": 22050, "rawDurationSec": 4.191
}
```

**实测（6.82s 源文件转 48k）：**

- 帧数 150330 → 327249，理论值 327249.0，**零误差**
- 时长漂移 **0 ms**
- 11kHz 以上能量 0.01 / 0.00，**无镜像**

批量接口支持整批 `upsample` 开关，单条也可覆盖。

**已有文件补转：** `POST /v1/resample`

```json
{ "path": "xxx.wav", "targetSr": 48000 }
```

支持 16000 / 22050 / 24000 / 32000 / 44100 / 48000，返回带 `driftMs` 便于校验。

**依赖**：`D:\AI\IndexTTS2_5\bin\ffmpeg.exe`（内置，147 MB 完整版含 libsoxr）。`/v1/capabilities` 的 `ffmpeg` 字段可查是否就绪。

**为什么不能直接把 config 的 22050 改成 24000**：BigVGAN 权重里 `sampling_rate: 22050` 且 `upsample_rates=[4,4,2,2,2,2]`（乘积 256）× `hop_size=256`。改配置只骗过文件头，声码器照旧按 22.05k 合成，出来音调变低、节奏变慢。`config.yaml` 里 `dataset.sample_rate: 24000` 是训练残留，推理不读。

### 2.5.6 显存告警

服务启动和每次 `/api/load` 时检查显存余量。低于 **7000 MB** 返回 `warning` 字段，但**不拒绝请求**（用户明确要求只警告不拦截）。

### 2.5.7 OpenAI 兼容出口

`POST /v1/audio/speech`，字段 `{model, input, voice, speed}`。注意 `speed` 与 `durationFactor` **互为倒数**（speed 2.0 = durationFactor 0.5）。

### 2.5.8 音色库

参考音频放 `D:\AI\IndexTTS2_5\voices\`，`GET /v1/voices` 列出。上传接口 `POST /api/voices/upload` 自动转 22050 单声道。

**15s 硬截断：** 参考音频超过 15s 会被 `_load_and_cut_audio` 截断，前端标 `truncated: true`。

### 2.5.9 性能实测（RTX 5070 Laptop, 8 GB）

| 场景 | RTF |
|---|---|
| 首次调用（冷，含内核编译） | 5.13 |
| 预热后稳定 | **0.88** |
| 批量（首条含预热） | 2.87 |
| 批量后续 | 0.92–1.72 |

**冷启动约 22s，预热后生成 4.3s 音频只要 3.8s。** 主程序批量调用时应先跑一条预热。

---

## 3. 提示词

### `POST /api/prompts/build`
```json
{
  "kind": "image",
  "shotId": "sht_xxx",
  "mode": "cloud",
  "options": {
    "style": "cinematic-vertical",
    "language": "zh",
    "strict": true,
    "includeNegative": true
  }
}
```
```json
{
  "prompt": "【角色锁定】林晚：黑色长发，右眼下泪痣，米白针织衫…【场景】深夜便利店…【镜头】中景，轻微手持…",
  "negative": "多手指, 变形, 文字, 水印",
  "meta": { "mode": "cloud", "model": "gpt-4o-mini", "elapsedMs": 1820, "promptVersion": 3 }
}
```

### `POST /api/prompts/review`
```json
{ "shotId": "sht_xxx", "prompt": "...", "kind": "image" }
```
```json
{
  "score": 78,
  "issues": [
    { "level": "warn", "code": "char_drift", "message": "角色发色与定妆照不一致（黑 → 棕色）" },
    { "level": "info", "code": "no_camera", "message": "未指定镜头运动，将使用默认固定机位" }
  ]
}
```

### `GET /api/prompts/skills`
列出可用 skill 及其覆盖来源（builtin / project）。

### `POST /api/prompts/skills/:name/override`
写入项目级覆盖。

---

## 4. 生成（本地 ComfyUI）

> 出图/出片走本地 ComfyUI，0 边际成本。闸门不是钱，是显存与队列。

### `POST /api/shots/:id/generate`
```json
{
  "kind": "image",
  "provider": "comfyui",
  "params": { "size": "1080x1920", "seed": 12345, "count": 1 },
  "confirmRun": true
}
```
未带 `confirmRun` 时先返回资源预估：
```json
{
  "ok": false,
  "error": {
    "code": "confirm_run_required",
    "message": "本次预计占用 6.2 GB 显存，耗时约 32 秒",
    "details": {
      "estimate": { "vramMB": 6349, "durationMs": 32000, "queueAhead": 0 }
    }
  }
}
```

显存不足时：
```json
{ "ok": false, "error": { "code": "vram_insufficient", "message": "剩余显存 780 MB，低于守门阈值 1024 MB，队列已挂起", "details": { "vramFreeMB": 780, "vramGuardMB": 1024 } } }
```

### `POST /api/episodes/:id/generate`
整集批量，必须带 `confirmRun`；受 `maxQueueLength` 限制，超了返回 `queue_full`。

### `GET /api/tasks/:id`

`type` 枚举：`image` | `video` | `audio` | `llm`。`progress` 是 0–100 整数。

```json
{
  "id": "tsk_xxx",
  "type": "image",
  "refId": "sht_xxx",
  "status": "running",
  "progress": 45,
  "attempts": 0,
  "gpuLock": null,
  "resourceEstimate": { "vramMB": 6349, "durationMs": 32000 },
  "resourceActual": { "vramPeakMB": 6102, "durationMs": 29840 },
  "sourceVideoTruncated": false,
  "error": null
}
```

`gpuLock` 在有任务持有 GPU 时非空，用于 `gpu_lock_held` 时报出占用方：
```json
{ "holder": "tts" | "comfyui" | "video2x", "holderTaskId": "tsk_yyy" }
```

`type: "llm"` 的任务改记 token：
```json
{ "id": "tsk_yyy", "type": "llm", "status": "done",
  "tokenEstimate": 1800, "tokenActual": { "prompt": 1520, "completion": 640 } }
```

### `POST /api/tasks/:id/cancel`
幂等。

### `GET /api/tasks?status=running&projectId=`
```json
{ "ok": true, "data": { "items": [ /* Task[] */ ], "total": 3 } }
```

### `GET /api/events`
SSE 流，事件：`task.progress`、`task.done`、`task.failed`、`project.updated`、`gpu.changed`。

> `models.changed` 已移除——模型是否可用由 `/api/models` 现查，不做推送。

### `GET /api/models`
列出各 provider 与工作流的可用状态，供 GUI 灰显不可用项。
```json
{
  "ok": true,
  "data": {
    "providers": [
      { "id": "comfyui", "kind": "image", "online": true, "hidden": false, "reason": null },
      { "id": "tts", "kind": "audio", "online": true, "modelLoaded": false, "hidden": false, "reason": null },
      { "id": "video2x", "kind": "upscale", "online": true, "hidden": false, "reason": null }
    ],
    "workflows": [
      { "id": "image-qwen21-t2i", "kind": "image", "available": true, "reason": null },
      { "id": "h3-ref2va-drama-vdn", "kind": "video", "available": true, "reason": null }
    ]
  }
}
```

---

## 4.5 资产

### `GET /api/assets`
`?projectId=&kind=image|video|audio|portrait&shotId=&page=1&pageSize=50`

### `GET /api/assets/:id`
返回单个 `Asset`（结构见 `技术实现.md` §3.1）。

### `DELETE /api/assets/:id`
删文件 + 从索引移除。被 `Shot.outputs` 引用的资产拒绝删除（409 `asset_in_use`）。

### `GET /api/files/:assetId`
实际文件流。支持 `?download=1` 触发浏览器下载。鉴权同 `/api/*`。

> MCP 的 `asset_list` / `asset_get` 映射到前两个端点，
> 保证「agent 能做的 API 也能做」。

---

## 4.6 音色与角色绑定

### `POST /api/voice/load` / `POST /api/voice/unload`
**装卸 IndexTTS 模型的唯一官方入口。** 内部转发到 `:17863/api/load|unload`，
但**先抢全局 GPU 锁**：

- 有 ComfyUI/Video2X 任务在跑 → 返回 409 `gpu_lock_held`，附 `gpuLock.holder`
- 已加载时 `load` 幂等返回成功，不重复加载
- 卸载成功后唤醒排队中的 ComfyUI 任务

> 为什么要包一层：直接打 `:17863/api/load` 会绕过锁，
> ComfyUI 正在出图时把它的显存挤爆，任务直接 OOM 崩掉。

### `POST /api/characters/:id/voice`
写角色的 `VoiceProfile`：
```json
{ "voiceId": "流萤", "language": "ZH", "defaultEmotion": "calm", "durationFactor": 1.0 }
```
绑定后 `POST /api/voice/synthesize` 只需传 `characterId`。
未绑定时合成返回 400 `voice_no_reference`。

### `GET /api/voices`
转发到 `:17863/v1/voices`，返回音色列表。

### `POST /api/voices/upload`
转发到 `:17863/api/voices/upload`，自动转 22050 单声道。
> 输入参考音频固定 22.05k（模型需要）；**输出交付另按 §2.5.5b 转 48k**，两者不矛盾。

### `POST /api/voice/synthesize`
转发到 `:17863/v1/tts/batch`，把返回的 `jobId` **包装成 drama-core 的 Task**（`type: "audio"`），
对外返回 `taskId`。这样 `generation_status` 能统一查，不用维护两套异步模型。

---

## 5. 配置与 Key

### 5.0 定位：文本 → 短剧，不是只吃小说

输入源不限于小说。任何文本都能进来：

| 输入 | 处理差异 |
|---|---|
| 长篇网文 | 拆章 → 分集 → 分场 |
| 短故事 | 一段就是一集，跳过拆章 |
| 剧本 | 有对话标记，跳过改编，直接分镜 |
| 大纲 | 框架不全，需要扩写补全 |
| 新闻 / 热点 | 事实性强，需要改写成戏剧冲突 |

**术语约定**：文档里用「**文本单元**」（`sourceUnit`）而不是「章节」。小说才有「章」，
短故事可能只有一段。`sourceUnit` 是统一抽象。

### 5.1 三层入口，同一套能力

```
         ┌──────────────────────────────────────────┐
         │            drama-core（业务逻辑唯一一份）    │
         └──────────────────────────────────────────┘
              ▲              ▲                ▲
      ┌───────┴──────┐ ┌─────┴──────┐ ┌───────┴────────┐
      │  Agent (MCP) │ │ API 直调    │ │  GUI 手动点     │
      │  对话式推进    │ │ 机械活用   │ │ 任意步骤可插手   │
      └──────────────┘ └────────────┘ └────────────────┘
```

**不是三条独立流水线，是同一套 REST 的三个入口。**

| 场景 | 走哪层 | 理由 |
|---|---|---|
| 规划整条链路、需要解释和调整 | Agent（MCP） | 要理解意图、能反问 |
| 提示词转换、格式化、批量改写 | **API 直调** | 机械活，省 agent 轮次和 token |
| 人工审查、微调、手动触发 | GUI | 需要眼见为实 |

**规则：agent 能做的，API 也能做；API 能做的，GUI 也能点。** 不存在「只有 agent 能做」的隐藏能力。

### 5.2 LLM 后端：多配置，OpenAI 兼容即可

**不区分云端还是本地。** 只要说的是 OpenAI 协议，就能接：

| 后端举例 | baseUrl |
|---|---|
| OpenAI / DeepSeek / 通义 | `https://api.xxx.com/v1` |
| Ollama | `http://127.0.0.1:11434/v1` |
| LM Studio | `http://127.0.0.1:1234/v1` |
| vLLM / llama.cpp server | `http://127.0.0.1:8080/v1` |

配置是**表**，不是单对象：

```json
{
  "llmBackends": [
    {
      "id": "deepseek",
      "label": "DeepSeek",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "***",
      "model": "deepseek-chat",
      "roles": ["text", "prompt"],
      "priority": 1,
      "enabled": true
    },
    {
      "id": "local-qwen",
      "label": "本地 Qwen",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5:14b",
      "roles": ["prompt"],
      "priority": 2,
      "enabled": true
    }
  ],
  "roleRouting": {
    "text": "deepseek",
    "prompt": "local-qwen"
  },
  "generation": { "resolution": "1080x1920", "fps": 24 }
}
```

**字段说明：**

| 字段 | 含义 |
|---|---|
| `roles` | 这个后端能干哪些活：`text`（文本理解/改写）、`prompt`（提示词）、`plan`（分镜规划） |
| `roleRouting` | 每个角色默认用哪个后端，没配就按 `priority` 选第一个可用的 |
| `priority` | 数字小优先 |
| `enabled` | 关掉但不删 |

**本地后端的 `apiKey` 随便填**（Ollama 用 `"ollama"`），协议要求有这个字段而已。

**不做本地兜底**：一个能用的后端都没有时，直接报错，不降级成规则解析。
错误码见 §5.6。

### 5.3 `GET /api/config`

返回脱敏配置，所有 Key 一律 `"***"`：

```json
{
  "llmBackends": [
    { "id": "deepseek", "label": "DeepSeek", "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "***", "model": "deepseek-chat", "roles": ["text","prompt"],
      "priority": 1, "enabled": true, "hasKey": true }
  ],
  "roleRouting": { "text": "deepseek", "prompt": "deepseek" },
  "generation": { "resolution": "1080x1920", "fps": 24 }
}
```

多一个 `hasKey` 布尔值，前端不用看到 key 也能显示「已配置 / 未配置」。

### 5.4 `PUT /api/config`

写盘走「临时文件 + rename + 0600」，和参考实现一致：

```js
const temp = `${file}.${process.pid}.tmp`;
fs.writeFileSync(temp, JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });
fs.renameSync(temp, file);
```

- Key 只在用户显式提交时覆盖；传 `"***"` 视为「不修改」
- 新增后端时 `id` 必填且唯一
- `roleRouting` 引用了不存在的 `id` 返回 400
- 删除后端时，若被 `roleRouting` 引用，返回 409 并指出哪些角色依赖它

### 5.5 `POST /api/config/test`

测单个后端，或全测：

```json
{ "target": "deepseek" }
→ { "ok": true, "latencyMs": 420, "modelReachable": true, "models": ["deepseek-chat"] }
```

```json
{ "target": "*" }
→ { "results": [ { "id": "deepseek", "ok": true, "latencyMs": 420 },
                 { "id": "local-qwen", "ok": false, "error": "ECONNREFUSED" } ] }
```

测法是打 `GET {baseUrl}/models`，能列出模型就认为连通。

### 5.6 错误码（LLM 相关）

> **唯一权威的错误码表在 §0.3**，这里只列 LLM 相关的几条及其 HTTP 状态，避免两处漂移。

| 码 | 含义 | HTTP | 处理 |
|---|---|---|---|
| `llm_no_backend` | 没有任何启用的后端 | 400 | 提示去配置，**不降级** |
| `llm_no_role` | 该角色没有可用后端 | 400 | 提示给这个角色配一个 |
| `llm_private_url` | 指向内网/loopback 但没标 `local: true` | 400 | 提示标记为本地后端 |
| `llm_unreachable` | 后端连不上 | **502** | 报出 baseUrl 和原始错误 |
| `llm_auth` | 上游 401/403 | **502** | 提示 key 无效（对调用方是上游失败，不是自己未认证） |
| `llm_model_not_found` | 模型名不对 | **502** | 列出该后端可用的模型 |

**状态码约定**：上游 LLM 的错误一律对调用方返回 **502**，不用 401。
401/403 只表示「调用本服务的人没通过鉴权」，不表示「我们配的 key 无效」。
否则客户端会把上游配置问题误判成自己没登录。

### 5.7 `POST /api/config/clear-key`

清空指定后端的 Key，不动其他配置：

```json
{ "id": "deepseek" }
```

不带 `id` 则清空全部。

---

## 6. MCP 入口

### 6.1 内置，不是外挂

MCP 服务**随主程序一起装、一起起**。用户不需要单独配一个 npm 包。

```
apps/mcp/   ← 同一套代码里的模块，stdio 方式给 agent 连
```

对外暴露的传输方式：

| 传输 | 用途 |
|---|---|
| **stdio** | agent 直接拉起子进程，最常用 |
| **HTTP (SSE)** | 已跑着的主程序被外部 agent 连 |

启动参数 `--mcp-stdio` 时只跑 MCP 不启 GUI；GUI 跑着时走 HTTP。

### 6.2 `POST /api/tools`

```json
{ "name": "shot_plan", "input": { "sceneId": "scn_1", "params": {} }, "requestId": "uuid" }
```
```json
{ "ok": true, "result": { ... } }
```

- `requestId` 用于幂等去重（TTL 10 分钟）
- 只接受 `x-drama-token`，不接受 GUI session token
- 每次调用写审计：`{ts, name, requestId, source, inputHash, ok, code, elapsedMs}`

`source` 记录调用来源：`mcp` / `api` / `gui`。**同一个工具三个入口都能进，审计能分清谁干的。**

### 6.3 三个入口的能力边界

| 能力 | Agent (MCP) | API 直调 | GUI |
|---|---|---|---|
| 项目管理 | ✅ | ✅ | ✅ |
| 文本分析/分集 | ✅ | ✅ | ✅ |
| 提示词生成 | ✅ | ✅ **推荐** | ✅ |
| 出图/出片/配音 | ✅ | ✅ | ✅ |
| 配置 Key | ⚠️ 只读 + 测试 | ❌ | ✅ **推荐** |
| 删除项目 | ⚠️ 需 `confirm: true` | ❌ | ✅ |

**Key 管理故意不给 agent 写权限。** agent 能读配置状态、能测连通性，但不能改或删 key —— 防止 agent 被诱导泄露或覆盖凭证。GUI 是唯一写入入口。

**删除类操作给 agent 加 `confirm` 门禁**，避免 agent 误删。

### 6.4 工具与 REST 的映射

| MCP 工具 | 底层 |
|---|---|
| `project_create` | `POST /api/projects` |
| `project_get` | `GET /api/projects/:id` |
| `project_import` | `POST /api/projects/:id/import` |
| `source_analyze` | `POST /api/projects/:id/analyze` |
| `episode_plan` | `POST /api/projects/:id/episodes/plan` |
| `scene_breakdown` | `POST /api/episodes/:id/scenes/breakdown` |
| `shot_plan` | `POST /api/scenes/:id/shots/plan` |
| `prompt_build_image` | `POST /api/prompts/build`（kind=image） |
| `prompt_build_video` | `POST /api/prompts/build`（kind=video） |
| `prompt_review` | `POST /api/prompts/review` |
| `generate_shot` | `POST /api/shots/:id/generate` |
| `generate_episode` | `POST /api/episodes/:id/generate` |
| `generation_status` | `GET /api/tasks/:id` 或 `GET /api/tasks` |
| `postprocess_upscale` | `POST /api/processors/upscale` |
| `postprocess_interpolate` | `POST /api/processors/interpolate` |
| `postprocess_devices` | `GET /api/processors/devices` |
| `voice_synthesize` | `POST /v1/tts/batch`（IndexTTS `:17863`） |
| `voice_list` | `GET /v1/voices` |
| `config_get` | `GET /api/config`（只读） |
| `config_test` | `POST /api/config/test` |

> `novel_analyze` 更名为 `source_analyze`，旧名保留别名。

**一张表两套皮**：REST 是 GUI 的皮，MCP 是 Agent 的皮，业务实现只有一份。

---

## 7. OpenAI 兼容出口（必做）

本地 ComfyUI 工作流经这一层标准化后对外提供。它在 v1 范围内，不是可选。

> ⚠️ **`/v1/*` 不使用 §0.2 的 `{ok, data}` 包络。**
> 这一层是给现成 OpenAI SDK / 客户端直连的，必须符合 OpenAI 的原生形状：
> - 成功：直接按各接口定义的 JSON 返回，**没有 `ok` / `data` 包裹**
> - 失败：`{ "error": { "message": "...", "type": "invalid_request_error", "code": "llm_no_role" } }`
>
> 包了 `ok/data` 的响应会让 `openai` SDK 直接抛解析错误。

### `GET /v1/models`
```json
{ "object": "list", "data": [
  { "id": "qwen21:t2i", "object": "model", "owned_by": "local" },
  { "id": "qwen21:edit", "object": "model", "owned_by": "local" },
  { "id": "qwen21:inpaint", "object": "model", "owned_by": "local" },
  { "id": "qwen21:outpaint", "object": "model", "owned_by": "local" },
  { "id": "qwen21:remove", "object": "model", "owned_by": "local" },
  { "id": "moss-sft-8step", "object": "model", "owned_by": "local" },
  { "id": "moss-sft-50step", "object": "model", "owned_by": "local" },
  { "id": "moss-sft-int8-8step", "object": "model", "owned_by": "local" },
  { "id": "moss-sft-int8-50step", "object": "model", "owned_by": "local" },
  { "id": "krea2-turbo", "object": "model", "owned_by": "local" },
  { "id": "z-image-turbo", "object": "model", "owned_by": "local" },
  { "id": "h3-2pass", "object": "model", "owned_by": "local" },
  { "id": "h3-2pass-novdn", "object": "model", "owned_by": "local" },
  { "id": "h3-character-swap", "object": "model", "owned_by": "local" }
] }
```
只列出**依赖齐全、当前可用**的工作流。`hidden` 的默认不出现，`?all=1` 才展开。VDN 缺 Stage-B adapter 的 `h3-2pass` 会被剔除，只剩 `h3-2pass-novdn`。

**视频模型只有三档**，不再是 t2v / frames / ref2va 分列——模式在请求里推导。

### `POST /v1/images/generations`
标准 OpenAI 形状：`{ model, prompt, size, n, response_format }`。

### `POST /v1/videos` / `GET /v1/videos/:id`
任务制形状（异步 + 轮询）。
- 任务 id 与 `drama-core` 的 `Task` 同一套，不另建。
- 视频端点要带分档时长限制，超出直接 400。

**视频模式由参考素材的「角色标签」推导**，不是用户直接选模式名：

| `role` | 含义 | 落到节点 |
|---|---|---|
| `first` | 首帧 | `first_frame` 输入口 |
| `last` | 尾帧 | `last_frame` 输入口 |
| `character` | 角色外观参考 | `ref_images.ref_image_N` |
| `scene` | 场景/构图参考 | `ref_images.ref_image_N` |
| `auto` | 按上传顺序推断 | 第 1 张首帧、第 2 张尾帧、其余参考 |

```json
{
  "model": "h3-2pass",
  "prompt": "...",
  "durationSec": 5.0,
  "size": "768x1344",
  "refs": [
    { "assetId": "ast_a", "kind": "image", "role": "first" },
    { "assetId": "ast_b", "kind": "image", "role": "last" },
    { "assetId": "ast_c", "kind": "image", "role": "character" }
  ]
}
```

服务端推导出 `task_type`（**与引擎 `conditioning.py` `resolve_task_type` 对齐**）：

```ts
type TaskType = "t2va" | "i2va" | "l2va" | "fl2va" | "ref2va" | "hybrid";

function deriveTaskType(refs): TaskType {
  const hasFirst = refs.some(r => r.kind === "image" && r.role === "first");
  const hasLast  = refs.some(r => r.kind === "image" && r.role === "last");
  const hasRefs  = refs.some(r => r.role === "character" || r.role === "scene"
                              || r.kind === "video" || r.kind === "audio");

  // ① 关键帧 + 参考素材同时存在 → hybrid（最高优先级，不是降级）
  if (hasRefs && (hasFirst || hasLast)) return "hybrid";

  // ② 纯关键帧路径
  if (hasFirst && hasLast) return "fl2va";
  if (hasFirst) return "i2va";
  if (hasLast)  return "l2va";

  // ③ 只有参考素材
  if (hasRefs) return "ref2va";

  // ④ 什么都没有
  return "t2va";
}
```

**硬约束**：带参考素材时，`t2va` / `i2va` / `l2va` / `fl2va` 均非法（引擎抛 ValueError）。客户端显式传 `taskType` 且与素材冲突时，返回 400 `invalid_task_type_for_media`，**不静默改路**；不传时按上式自动推导。

响应里回显推导结果（放在 OpenAI 风格对象的 `metadata` 里，**不套 `ok/data`**）：

```json
{
  "id": "vid_xxx",
  "object": "video",
  "status": "queued",
  "created_at": 1762745000,
  "model": "h3-2pass",
  "metadata": {
    "taskId": "tsk_xxx",
    "derivedTaskType": "hybrid",
    "promptShell": "six-section",
    "frames": 124,
    "actualDurationSec": 5.17,
    "truncatedReferenceSec": null
  }
}
```

> `promptShell` 随 `taskType` 决定：`ref2va` / `hybrid` → `six-section`；其余 → `three-field`。

`GET /v1/videos/:id` 返回同一个对象，`status` 变为 `completed` 时附
`"url": "/v1/videos/vid_xxx/content"` 供下载。失败时：
```json
{ "id": "vid_xxx", "object": "video", "status": "failed",
  "error": { "code": "comfy_out_of_memory", "message": "..." } }
```

### 时长字段

`durationSec` 是**秒**，服务端转成节点上的 `length`（帧）：

```ts
const FPS = 24;
function secondsToFrames(seconds: number): number {
  const raw = Math.round(seconds * FPS);
  const n = Math.max(0, Math.floor((raw - 5) / 17));
  return Math.min(17 * n + 5, 362);          // 362 帧 = 15.08 秒，硬上限
}
```

| 请求 | 实际帧 | 实际时长 | 误差 |
|---|---|---|---|
| 5.0 | 124 | 5.17s | **+0.17s** |
| 6.0 | 141 | 5.88s | **−0.13s** |
| 10.0 | 243 | 10.13s | +0.13s |
| 12.0 | 277 | 11.54s | **−0.46s** |
| 15.0 | 362 | 15.08s | +0.08s |

**`durationSec` 合法区间是 5–15 整数秒**，超出直接 400 `invalid_param`，不做封顶截断。

> `secondsToFrames` 按 `17n+5` 网格**向下对齐**，因此任意秒数会有最多约 **0.54 秒**的负偏差（如 12 秒 → 11.54 秒）。
> 这是 H3 帧数约束的固有结果，不是 bug。**必须回显 `actualDurationSec`**，并在 UI 上说明「±0.6 秒内属正常」。

参考视频另有 `reference_video_policy: official_2_to_15s`：超过 15 秒的部分不参与生成，
任务里记 `sourceVideoTruncated: true`（注意字段名是驼峰的 `sourceVideoTruncated`，
错误码表里的 `source_video_truncated` 仅作为「非致命提示」的 code 出现，两者指同一件事）。

校验一律在**提交前**完成，返回 400 而不是跑到一半失败。

> **校验规则以 `技术实现.md` §7.4「素材校验（渲染前）」的唯一那张表为准**，本节只列与 HTTP 层有关的差异：

| 推导模式 | 校验 | 错误码 |
|---|---|---|
| `t2va` | 媒体数 = 0 | `invalid_task_type_for_media` |
| `i2va` / `l2va` | 恰好 1 个首/尾帧，**且无参考素材** | `missing_reference_image` |
| `fl2va` | 恰好 1 首 + 1 尾，**且无参考素材** | `missing_reference_image` |
| `ref2va` | 媒体 ≥1，图 ≤6，音频 ≤2，视频 ≤1，**且无关键帧** | `missing_reference_media` |
| **`hybrid`** | **关键帧 ≥1 且 参考素材 ≥1**（两类缺一不可） | `hybrid_needs_keyframe` / `hybrid_needs_reference` |
| 任意 | 同一角色标两次（两张首帧） | `duplicate_frame_role` |
| 任意 | 显式 `taskType` 与素材构成冲突 | `invalid_task_type_for_media` |

> **`hybrid` 只给一类素材**：只给关键帧 → 实际等于 `i2va`（壳变三字段）；只给参考 → 实际等于 `ref2va`。**响应里回显 `promptShell` 让客户端知道壳变了**，不静默降级。

> `GATEWAY_TOKEN` 可选：仅绑回环时可不设；一旦允许局域网访问（`ALLOW_REMOTE=1`）则强制要求。

---

## 8. 超分 / 插帧（Video2X 独立程序）

不走 ComfyUI，直接调 `D:\AI\Video2X Qt6\video2x.exe` 子进程。

### `POST /api/processors/upscale`
```json
{
  "assetId": "ast_xxx",
  "processor": "realesrgan",
  "model": "realesrgan-plus",
  "scale": 2,
  "device": 1,
  "codec": "libx264",
  "confirmRun": true
}
```
```json
// res.data
{
  "taskId": "tsk_ups_xxx",
  "input": "assets/sht_xxx.mp4",
  "output": "assets/sht_xxx_2x.mp4",
  "estimate": { "durationMs": 180000, "gpuBusy": false }
}
```

参数对照 CLI：

| API 字段 | CLI 参数 | 说明 |
|---|---|---|
| `processor` | `-p` | `realesrgan` / `realcugan` / `libplacebo` / `rife` |
| `model` | `--realesrgan-model` 等 | 按 processor 联动 |
| `scale` | `-s` | 与 `width`/`height` 二选一 |
| `width` / `height` | `-w` / `-h` | 显式输出尺寸 |
| `device` | `-d` | **本机必须 1**（0 是 AMD 核显） |
| `codec` | `-c` | 默认 `libx264`，可换 `h264_nvenc` |
| `extraEncoderOptions` | `-e key=value` | 如 `{"crf":17,"preset":"slow"}` |

### `POST /api/processors/interpolate`
```json
{ "assetId": "ast_xxx", "mul": 2, "model": "rife-v4.6", "device": 1, "sceneThresh": 100 }
```
对应 `-p rife -m <mul> --rife-model <model> -t <sceneThresh>`。

### `GET /api/processors/devices`
用 `video2x -l` 解析出可用 GPU：
```json
{ "devices": [
  { "index": 0, "name": "AMD Radeon(TM) 610M", "type": "integrated" },
  { "index": 1, "name": "NVIDIA GeForce RTX 5070 Laptop GPU", "type": "discrete", "recommended": true }
] }
```

### GPU 互斥

Video2X 与 ComfyUI 都吃满显存，两者**不能并发**。调度器维护一把全局 GPU 锁：
- ComfyUI 任务和 Video2X 任务进同一个队列。
- 任一在跑时，另一侧任务等待。
- 锁信息暴露在 `GET /api/system/stats` 的 `gpuLock` 字段，GUI 显示「GPU 被超分任务占用」。

### 进度

`--no-progress` 关掉进度条后，stdout 仍打印帧号。按行正则解析：
```ts
const FRAME_RE = /frame\s+(\d+)\s*\/\s*(\d+)/i;
```

---

## 8.5 交付格式（2026-11-10 定案）

> 之前一直悬着的那一项，现在定了：**三件一起给，不是一个**。

### 8.5.1 为什么是三个都出

三种格式解决三个不同问题，**不重叠，不互相替代**：

| 格式 | 解决什么 | 给谁 |
|---|---|---|
| **FCPXML** | 带音轨、带位置、带转场，**直接导入就能剪** | 剪辑软件（FCP / DaVinci / 剪映专业版） |
| **SRT** | 字幕文本 + 时间戳 | 播放器、平台上传、人工校对 |
| **CSV** | 纯数据，一行一镜 | 脚本、Excel、排查问题 |

只给 FCPXML 的话，想核时间轴得开剪辑软件；只给 CSV 的话，导入素材全靠手摆。**三个都出，各取所需。**

### 8.5.2 时间轴基准：全集时间轴（唯一）

**铁律：所有时间戳都是全集绝对时间，不是单镜相对时间。**

```
第 1 镜 0.000 → 5.120
第 2 镜 5.120 → 10.240     ← 接着上一镜的结束，不是从 0 开始
第 3 镜 10.240 → 15.360
```

理由：改某个镜头的长度时，**后面的音频位置自动跟着走，不会错位**。如果用相对时间，改一镜就得重算全表。

对应字段：`DialogueLine.globalStartSec` / `globalEndSec`。

### 8.5.3 三件套的产物

```
output/{projectId}/ep{NN}/
├── ep01.fcpxml          ← 主交付
├── ep01.srt             ← 字幕
├── ep01.csv             ← 数据表
├── ep01.mp4             ← 拼好的成片
├── video/               ← 分镜视频（已超分）
└── audio/               ← 配音（全集连续，非逐镜）
```

**注意 `audio/`只有一条全集音轨**，不是每镜一个文件。后面 §8.5.5 解释。

### 8.5.4 FCPXML 结构（主交付）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080x1920p24" frameDuration="100/2400s" width="1080" height="1920"/>
    <asset id="a1" name="SC-01" src="file:///.../video/SC-01.mp4"
           start="0s" duration="123/24s" format="r1" hasVideo="1"/>
    <asset id="a2" name="SC-02" src="file:///.../video/SC-02.mp4"
           start="0s" duration="144/24s" format="r1" hasVideo="1"/>
    <asset id="a9" name="ep01_voice" src="file:///.../audio/ep01_voice.wav"
           start="0s" duration="368/24s" hasAudio="1"/>
  </resources>
  <library>
    <event name="ep01">
      <project name="ep01">
        <sequence format="r1" duration="368/24s" tcStart="0s">
          <spine>
            <asset-clip ref="a1" offset="0s" duration="123/24s" start="0s"/>
            <asset-clip ref="a2" offset="123/24s" duration="144/24s" start="0s"/>
            <!-- 音频轨单独一条，整条铺到底 -->
            <asset-clip ref="a9" lane="-1" offset="0s" duration="368/24s" start="0s"/>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
```

**要点**：

1. **`frameDuration` 固定 `100/2400s`（= 1/24）**，与 H3 的 24 fps 一致。
2. **时长用分数表示**，`123/24s` 不是 `5.125s`。浮点会累积误差，24 镜后可能偏一帧。
3. **`offset` 是累加的**，第 N 镜的 offset = 前面所有镜的 duration 之和。
4. **音频单独一条 lane**，不切碎。理由见下。

### 8.5.5 音频为什么不切碎

**这是本项目最容易做错的地方之一。**

配音是**整句 TTS 后按 ASR 时间戳切**（见 §2.5 与决策记录 §6.2）。如果按镜头把音频切成 N 段文件：

- 切点处的气口、混响、呼吸会被切断，**每段接缝都能听出来**
- 换个镜头顺序，切点全废，得重切
- 一句台词跨两个镜头时，前半句尾音和后半句头音对不上

**正确做法**：**音频始终是全集连续的一条**，FCPXML 里作为独立 lane 铺满整个序列，镜头的视频轨盖在上面。

剪辑软件里显示为「一条长音轨 + 若干视频片段」，**片段怎么调，声音都不动**。这正是用户要的「改镜头长度时音频位置不跑偏」。

### 8.5.6 SRT 的规则

SRT 只负责**字幕**，不负责音频位置。

```
1
00:00:01,200 --> 00:00:04,350
你终于来了。

2
00:00:04,800 --> 00:00:08,100
我等了很久。
```

**三条约定**：

1. **时间戳是全集绝对时间**，与 FCPXML 完全一致。
2. **一条字幕 = 一句台词**，不按镜头切。跨镜头的台词合并成一条，字幕本来就该跟句子走。
3. **超过 20 字自动折行**，用 `\N`（SRT 的软换行），不硬切空格。

**不做的**：不做逐字动画（那是 `.ass` 的事），做 karaoke 得另说。

### 8.5.7 CSV 的列定义

```csv
shotId,shotCode,sceneCode,startSec,endSec,durationSec,videoFile,dialogue,dialogueStartSec,dialogueEndSec,voicedBy,taskType,chainSegment
1,SC-01,SN-01,0.000,5.125,5.125,SC-01.mp4,你终于来了。,1.200,4.350,CH-01,ref2va,1
2,SC-02,SN-01,5.125,11.125,6.000,SC-02.mp4,我等了很久。,5.600,10.100,CH-02,hybrid,2
```

| 列 | 含义 | 备注 |
|---|---|---|
| `shotId` | 内部 id | 不对外 |
| `shotCode` | `SC-01` 全局编号 | 与素材编号体系一致（`技术实现.md` §3.1.1） |
| `startSec` / `endSec` | 全集时间轴 | 三位小数，够 24 fps 精度 |
| `durationSec` | `endSec - startSec` | 冗余但方便读表 |
| `dialogue` | 该镜承担的台词子串 | 表示法 B：存文本，不存字符区间 |
| `dialogueStartSec` / `dialogueEndSec` | 台词在全集上的位置 | 由 ASR 逐字时间戳算出 |
| `voicedBy` | 角色编号 `CH-01` | 对应音色绑定 |
| `taskType` | H3 的 `task_type` | 六个值之一，小写 |
| `chainSegment` | 第几段接续 | 连链时用，单段填 1 |

**CSV 必须是 UTF-8 with BOM**，否则 Excel 打开中文乱码。

### 8.5.8 缺口必须报错，不许留空

**任何一行时间戳算不出来 → 整个导出失败，返回 500 `delivery_incomplete`**，并列出是哪一镜、缺什么。

不做的：
- ❌ 用 `0.000` 占位
- ❌ 跳过这一镜接着导
- ❌ 导出了再在 GUI 里标黄

理由（对应底线④「不完整不出片」）：半套时间轴导进剪辑软件，剪辑师会以为全对，剪到一半才发现某镜没有音频。**宁可导不出来。**

### 8.5.9 接口

```
GET /api/episodes/:id/delivery?formats=fcpxml,srt,csv
```

```json
{
  "ok": true,
  "data": {
    "episodeId": "ep_01",
    "timeline": {
      "totalDurationSec": 368.0,
      "shotCount": 62,
      "fps": 24,
      "basedOn": "global"          // 明确标注：全集时间轴
    },
    "files": [
      { "format": "fcpxml", "path": "output/p1/ep01/ep01.fcpxml", "bytes": 18234 },
      { "format": "srt",    "path": "output/p1/ep01/ep01.srt",    "bytes": 4210 },
      { "format": "csv",    "path": "output/p1/ep01/ep01.csv",    "bytes": 9877 }
    ]
  }
}
```

`formats` 省略时默认全给三个。指定单个也允许，比如只要 SRT 给平台上传。

**错误码**：新增 `delivery_incomplete`（500），含义是「时间轴有缺口，拒绝导出」。

### 8.5.10 校验清单（导出前必过）

- [ ] 每一镜都有视频文件，且能读出真实帧数
- [ ] 每一句台词都有 `globalStartSec` / `globalEndSec`
- [ ] 音频总时长 ≥ 最后一镜的 `endSec`（差一帧以上就报错）
- [ ] 镜头时长都 ≥ 台词时长（底线，见决策记录 §6.1）
- [ ] `offset` 累加等于上一镜 `offset + duration`，无空隙无重叠
- [ ] FCPXML 的 `duration` 分母统一为 24
- [ ] SRT 无重叠时间戳、无空文本块
- [ ] CSV 带 BOM

---

## 9. 参数校验

所有入参用 zod 校验，schema 放 `packages/shared/schemas/`，**REST 和 MCP 共用同一份 schema**。

```ts
// packages/shared/schemas/shot.ts
export const shotPlanInput = z.object({
  sceneId: z.string().min(1),
  params: z.object({
    globalSegDurationSec: z.number().int().min(5).max(15).default(5),
    perShotOverride: z.record(z.string(), z.number().int().min(5).max(15)).default({}),
    shotSizeBias: z.enum(["balanced", "closeup", "wide"]).default("balanced"),
    cameraStyle: z.enum(["cinematic", "viral", "documentary"]).default("cinematic"),
  }).partial().default({}),
});
export type ShotPlanInput = z.infer<typeof shotPlanInput>;
```

这样避免「MCP 层和 HTTP 层校验规则不一致」这个经典坑。
