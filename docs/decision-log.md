# 对话决策记录 · 尚未落进方案文档的内容

> 本文件记录 2026-11-10 对话中**已经确定、但还没写进 README / 接口契约 / 技术实现 / MCP工具schema** 的决策。
> 目的是防止上下文压缩后丢失。落进正式文档后，对应条目可以划掉。
>
> 记录时间：2026-11-10

---

## 一、产品定位修正

### 1.1 输入源不限小说

- **不是「小说转短剧」，是「文本转短剧」**
- 支持：小说 / 短故事 / 剧本 / 大纲 / 新闻 / 其他
- 统一抽象是「文本单元」`sourceUnit`，不是「章节」
- `sourceKind` 字段：`novel | story | script | outline | news | other`，不填自动嗅探

> 状态：**已部分落入** README、接口契约 §5.0、技术实现 §0。需检查是否全部一致。

### 1.2 三层入口是同一套能力

```
Agent (MCP) / API 直调 / GUI 手动点  →  同一套 REST 的三个入口
```

- 不是三条独立流水线
- 提示词转换这类机械活走 API 直调，不绕 agent
- **MCP 内置**，随主程序一起装一起起

> 状态：**已落入** 接口契约 §5.1、§6。

---

## 二、LLM 后端（已落入，备查）

- 多后端配置表 `llmBackends`，不区分云端/本地
- OpenAI 兼容协议，Ollama / LM Studio / vLLM 都能接
- 按角色路由 `text` / `prompt` / `plan`
- 显式 `local: true` 才允许内网地址
- **不做本地兜底**，没后端就报 `llm_no_backend`
- Key 只有 GUI 能写，agent 只读

> 状态：**已落入** 接口契约 §5.2-5.7、技术实现 §5.2。

---

## 三、H3 视频模型能力（**重大修正，尚未落入**）

### 3.1 task_type 有 6 种，不是 5 种

从 `minimax-h3-audio-t8/conditioning.py` 第 299 行 `resolve_task_type()` 实读：

```python
if has_refs and (first or last):
    return "hybrid"      # ← 关键帧 + 参考素材
if has_refs:
    return "ref2va"
if first and last:
    return "fl2va"
if first:
    return "i2va"
if last:
    return "l2va"
return "t2va"
```

| task_type | 首帧 | 尾帧 | 参考媒体 | 说明 |
|---|---|---|---|---|
| `t2va` | ❌ | ❌ | ❌ | 纯文生 |
| `i2va` | ✅ | ❌ | ❌ | 首帧图生 |
| `l2va` | ❌ | ✅ | ❌ | 尾帧图生 |
| `fl2va` | ✅ | ✅ | ❌ | 首尾帧 |
| `ref2va` | ❌ | ❌ | ✅ | 全能参考 |
| **`hybrid`** | 可选 | 可选 | **必需** | **关键帧 + 参考混合** |

**硬约束**（第 335 行）：
```python
if requested not in {"ref2va", "hybrid"} and has_refs:
    raise ValueError("cannot include reference media; use Auto or Hybrid")
```

→ **手动指定 `fl2va` 时同时放参考图会直接报错。**

### 3.2 现有方案文档的错误

技术实现 §7.4 和接口契约 §7 里的 `deriveTaskType` **漏了 `hybrid`**，
且推导逻辑写反了——原写成「有参考图就不能有首尾帧」，实际是「两者都有才走 hybrid」。

**必须修正。**

### 3.3 `hybrid` 的编号契约（来自实战 skill）

**关键帧不占 `<Picture N>` 编号：**

| 素材 | 写法 | 占号 |
|---|---|---|
| 首帧 | **`first_frame`**（反引号字段名，独立成行） | **不占** |
| 尾帧 | **`last_frame`**（同上） | **不占** |
| 参考图 | `<Picture 1>`、`<Picture 2>`… | 占，**恒从 1 起** |

- 关键帧无论几个，参考图编号**不因它移位**
- `<Audio N>` / `<Video N>` 各自独立编号，从 1 起
- **旧写法「关键帧占最前号」已被明确否定**

### 3.4 `hybrid` 的三条提示词硬规（尚未落入）

1. **`[Shot 1]` 必须从 `first_frame` 内部启动**
   写法必须是 `opens exactly on the first_frame image`，
   **第 0 帧不得换姿势 / 构图 / 视线 / 道具持握**

2. **★ 首帧到剧情不得超过 0.5 秒**
   从 `first_frame` 的 0.00 秒起，到第一个剧情节拍启动，**≤ 0.5 秒**。
   **理由不是节奏审美，是连贯性**：上一条末帧通常正在运动中，
   本条若先静止再动，等于在运动中插入静止，接缝处会顿一下，成片显「两段」。
   0.5 秒是**上限不是目标**，越短越好。

3. **挂了尾帧就必须收在尾帧上**
   最后一个 `[Shot N]` 的末帧要精确落成 `last_frame` 的位置/姿势/视线/接触关系，
   中间不得跳到尾帧，也不得让尾帧凭空出现。

### 3.5 素材来源纪律（实战踩坑固化）

> 翻车记录：某条把 `ref-02-tail.jpg`（**自己上一轮的历史尾帧**）当成"本次末帧素材"，
> 整条写成"首尾帧双锚点"。而用户本次**只上传了首帧**。
> 被当场指出：「我是上传了首帧，没有尾帧」

**纪律：**
- 关键帧只能来自**用户本次实际给的图**
- 历史产出图 ≠ 本次素材
- **交叉检查：`<Picture N>` 总数应等于用户本次上传张数**

### 3.6 逐条串行的原因

接帧依赖的尾帧**在出词时并不存在**，要等上一条跑完抽出尾帧才能给。

```
出 01 → 用户生成 01 → 抽尾帧 → 出 02 → …
```

→ **整集批量生成在接帧场景下不成立**，必须分段串行。

---

## 四、首帧复用 / 接帧（**已定方案，尚未落入**）

### 4.1 做成按钮，不是自动

**用户原话：「是可选项」**

触发条件：**素材给没给**，不是软件自动接。

GUI 里一个勾选框：

```
☐ 接上一镜尾帧
```

- **勾上** → 自动从上一条实产尾帧抽一帧 → 塞 `first_frame` → 走 `hybrid`
- **不勾** → 独立生成
- **默认不勾**

### 4.2 勾上时自动做三件事

| 动作 | 依据 |
|---|---|
| 从上一镜抽尾帧 → `first_frame` | hybrid §1 |
| `task_type` 设 `hybrid` | hybrid §1 |
| 提示词加「0.5 秒内必须动」 | hybrid §3.5 |

**用户只需勾一个框，背后三件事全自动。**

### 4.3 扣首帧的技术细节（已确认）

**问题**：镜头 B 用镜头 A 最后一帧当首帧，该帧在 A 里已出现，直接拼会**顿帧**（同一帧停两次）。

**方案（用户选 B）**：
```
A: 帧 1..124  |  B: 帧 125..247   ← B 扣掉首帧
```
- 生成 124 帧，扣掉首帧剩 123
- **接受 0.04 秒时长变化**（5.17s → 5.125s）
- 不破坏 `17n+5` 对齐

**抽帧来源**：**从原片抽**（超分前的片子），不是从超分后的片子抽。

**时间轴**：首尾相接，无重叠。B 从 A 结束那一刻开始。

### 4.4 不冲突

用户原话：「不冲突。你镜头不可能一镜到底啊，但是会有需要跟随上一视频的情况」

- 短剧本来就是多镜头剪在一起
- 每个镜头独立生成、独立抽帧
- 拼接是剪接，镜头之间可以跳、可以切
- **接帧只是"需要跟随"时的特殊情况**

---

## 五、拼接与交付（**用户改口，尚未落入**）

### 5.1 拼接由本软件做

- 原先一度说「不管拼接」，**后面改口：「还是你自己拼接出来吧」**
- **按后者记录**

### 5.2 交付物

标定：**以「全集时间轴」为准**

- 每句配音在全集时间轴上的起止秒数
- 不绑定单个镜头
- 改镜头长度时音频位置不跑偏

> ⚠️ 具体交付格式（FCPXML / SRT / CSV）**当时没定完**，
> 用户说「等等，我想想」之后话题就转走了。**这一项待定。**

---

## 六、台词与镜头的时长关系（**重大修正，尚未落入**）

### 6.1 镜头时长 ≠ 台词时长

用户原话：「台词冗余很长的，不可能说我视频5.12s,台词就用5.12，这明显不对」

| 错的理解 | 正确的理解 |
|---|---|
| 台词 4.34s → 镜头 4.34s | 台词 4.34s + 留白 → 镜头 5.17s |
| 镜头时长 = 台词时长 | **镜头时长 = 台词时长 + 前后留白** |

**硬约束：镜头不能比台词短。** 台词长镜头短的唯一后果是说话中途被切断。

### 6.2 长台词的处理（用户选「后者」）

**先整句配音，再切音频**，不是切台词再分别配。

```
台词 20 秒
   ↓
① 整句配音一次生成（语气连贯）
   ↓
② 按分镜切开音频
   ↓
③ 分给几个镜头
```

**理由**：整句一次生成，音色/语气/情绪连续；切开只是切文件，不影响已生成的声音。

### 6.3 切分依据：按**分镜锁定的文本片段**切，不靠停顿、不靠标点

**用户确认：分镜阶段就已经定好每镜覆盖台词里的哪几个字。**

**表达方式选 B —— 存文本片段**（用户指定）：

```
镜头 B1 覆盖："夜色渐深，我的光芒为迷途者指引方向。"
镜头 B2 覆盖："你听好了，这件事没那么简单。"
```

不是字符区间、不是句子序号。**存原文片段。**

---

## 六-B、切分方案（已实测验证）

### 6B.1 链路

```
分镜阶段：每镜标好自己负责的文本片段（子串，必须出现在整句里）
        ↓
TTS：整句一次生成（不改字，保语气连贯）
        ↓
ASR：faster-whisper 逐字时间戳
        ↓
切分：在逐字时间戳里定位每镜片段的起止，按时刻切
        ↓
产出：每镜一段音频 + 精确起止
```

**核心：不需要找停顿，不需要判标点，直接查每个字的时刻。**

### 6B.2 实测数据（2026-11-10 本机验证）

| 项 | 结果 |
|---|---|
| ASR 模型 | `faster-whisper-medium`（本机已有，**1457 MB**） |
| 路径 | `D:\AI\_runtime\huggingface\hub\models--Systran--faster-whisper-medium\snapshots\08e178d48790749d25932bbc082711ddcfdfbc4f` |
| 环境 | `D:\AI\dsh-home\bili-duty\.venv-asr\Scripts\python.exe`（faster_whisper 1.2.1 + ctranslate2 4.8.4） |
| 模型加载 | 2.9 – 4.0 秒 |
| 对齐耗时 | **2.1 秒**（6.8s 音频）/ **6.4 秒**（11.3s）/ **8.2 秒**（20.2s） |
| 精度 | **逐字对齐，中英文都准** |
| 语言识别 | 中文 0.99 / 英文 0.97 |

实测输出示例（中文 15 字全对齐）：

```
0.000 - 0.600  夜
0.600 - 0.780  色
0.780 - 1.060  漸
1.060 - 1.500  深,
1.840 - 1.940  我的
...
3.880 - 4.060  向     ← 台词结束（音频总长 4.34s，尾部静默 0.28s）
```

### 6B.3 三个必须处理的坑（实测发现）

**坑一：ASR 输出繁体**

```
转写: 夜色漸深,我的光芒為迷途者指引方向
期望: 夜色渐深，我的光芒为迷途者指引方向
```

`漸`→`渐`、`為`→`为`。**匹配前必须繁简归一化**，否则文本片段定位会失败。

**坑二：中文分词不均匀**

`我的` 被识别成一个 token（0.1 秒），不是「我」+「的」。
→ 需要把 token 按字数均分回单个字的时间戳。

**坑三：ASR 可能截断尾部**

20.16 秒的音频，ASR 只转出到 19.96 秒，最后几个字没转。
→ **片段定位失败时必须报错，不能猜**。

### 6B.4 为什么不用「找停顿 / 找标点」

实测否定了这条路：

| 想法 | 实测结果 |
|---|---|
| 按句号切 | **ASR 把 3 个句号全转成逗号**，中文标点判断不可靠 |
| 按长停顿切 | 短句（11 秒）**只找到 1 个 >0.30s 的停顿**，几乎切不开 |
| 按逗号切 | 标点位置不准，会切错 |

**结论：IndexTTS 的句间停顿不够长，区分不了「句间」和「词间」。**
但**逐字时间戳非常准**，所以按文本片段查时刻是唯一可靠的路。

### 6B.5 附带收益

切完可以**反向校验**：某镜实际只覆盖 1.2 秒音频但分镜写 3.0 秒
→ **说明台词太短、画面会大量留白**，剪之前就能预警。

### 6B.6 依赖关系（重要）

**切点由分镜的文本片段决定。分镜改了台词字数 → 切点失效 → 必须重跑 ASR 对齐。**

这条依赖要在实现里显式处理（`audioStale` 标记）。

---

## 六-C、关于 `MiniMaxH3DialogueBoundaryAnalyzerT8` 节点

本机有这样一个节点，思路相同（ASR 定位），但**不建议直接用**：

它的 match 逻辑是「**恰好精确匹配一次**」：

```python
spans = exact_target_word_spans(words, expected_text)
unique_target_found = len(spans) == 1   # 必须唯一
```

碰上繁简差异、中文分词差异会误判成 `ambiguous_multiple_exact_targets`。

**建议学思路，自己实现宽松匹配**（繁简归一化 → 去标点 → 最长公共子串定位）。

该节点的其他设计值得借鉴：

- **找不到就报错，不猜**（`target_not_found` / `ambiguous_multiple_exact_targets`）
- 结果里明确标注 `"is_not_a_speech_classifier": True`，防止把能量高低误当「有没有语音」

> 该节点要求 `asr_model_directory` 指向 CTranslate2 目录，**不自动下载模型**。
> 本机 `ComfyUI/models/TTS` 下**没有**，需手动配置指向上面那个 hub 路径。

---

## 七、尚未处理的已知缺口

| 项 | 说明 |
|---|---|
| 拼接实现 | 要做什么定了，怎么做没定（ffmpeg concat？转场？字幕烧录？BGM 轨？） |
| 交付格式 | FCPXML / SRT / CSV 没定 |
| ~~切点时间轴对齐~~ | ✅ **已解决**，见第六章 B/C：按分镜文本片段 + ASR 逐字时间戳定位 |
| `schema/live-action.json` | ep01 分镜表引用了此文件，本机没有 |
| `资产清单_第01集.md` | 同上，引用了但本机没有 |
| 加速 LoRA | 用户提到「v 开头的 LoRA」，本机 42 个模型文件里**没有**，用户说「不见了就算了」 |
| 多候选挑选 | `count: 1-4` 出多张后怎么选、选中怎么写回 shot，没定义 |
| `maxQueueLength=20` | 而「一集几十个镜头」，默认参数下整集批量必然 `queue_full` |

---

## 八、已收到但未读完的资料

位于 `D:\AI\dshw\qqbot\novel2drama\_已收到资料\`：

| 文件 | 状态 |
|---|---|
| `H3_L4_full.md` | ✅ 已读（13 模块全量模板） |
| `ep01_storyboard.md` | ✅ 已读（39 镜 / 90 秒 / 每镜 118 字段，真实产物样本） |
| `r18-novel-h3.rar` → `_解压\r18-novel-h3\` | ⚠️ **部分读过** |
| —— `references\hybrid-rules.md`（31.5KB） | ✅ **已读完**，是本轮最重要的输入 |
| —— `SKILL.md`（84.4KB） | ❌ 未读 |
| —— `references\ref2va-rules.md`（17.5KB） | ❌ 未读（六段壳基础，**建议优先**） |
| —— 其余 references/*.md | ❌ 未读 |
| `ai分镜实战.7z` | ❌ 未解压（含「分镜总控_v9.0」docx/md） |
| `ComfyUI 终端插件源码.zip` | ❌ 未看（含 infinite-canvas 插件源码，与本项目架构相关） |

---

## 九、来自 ep01_storyboard.md 的可用事实

**这份是本机最好的真实产物样本，39 镜 / 90 秒 / 每镜 118 字段。**

### 9.1 分镜字段分组（可作为 Shot 结构的参考）

| 组 | 内容 |
|---|---|
| 叙事 | 意图 `press/推进/建立/释放`、钩子、hook 类型 |
| 镜头 | 景别 / 机位 / 运动 + **运动来源** / 轴线 / 景深 |
| 人物 | 主 / 陪 / 人物状态 |
| 形体 | 肢体 / 手指 / 头部 / 姿态 / 相位 |
| 情绪 | 主情绪 + 副情绪 + **表情节拍（带时间戳）** + 眼神 + 氛围 |
| 环境 | 地点 / 光线 / 光源 / 气氛 |
| 声音 | BGM / 环境 / 特殊 / 混音比例 / **响度 -16 LUFS / -1 dBTP** |
| 连续性 | 快照 / 人物位 / 道具位 / 场景位 / 光位 / 防漂移 |
| **首尾帧** | 前镜尾帧 / **关系 `same_setup`** / 运动矢量 / **切点 `after_action`** / 补救 |
| 转场 | 类型 + 时长 + 匹配轴 + 生成端守卫 |
| 制作 | 片种 / 焦段 / 场景类型 / 收音 / VFX |
| 表演 | 意图 / 走位 |
| 挂资产 | 角色卡 + 服装卡 + 背景卡 + 道具卡 |
| 参考图 | 垫图顺序 + 首帧 + 状态 |

### 9.2 三条被本方案漏掉的字段族

1. **`same_setup`（首尾帧关系）** —— 本方案的 Shot 里没有这个概念
2. **表情节拍带时间戳**（`00:00.2 fear_mid ｜ 00:01.1 surprise_low`）—— 镜头内情绪会变
3. **响度标准 -16 LUFS / -1 dBTP** —— 本方案完全没有音频响度规范

### 9.3 时长网格不是 17n+5

ep01 里全是 1.5 / 2.0 / 2.5 / 3.0 s 这种半秒倍数，**不是** `17n+5` 帧对齐的结果。

**用户明确说：**「应该是巧合，具体时间还是按我们的来，**不用管**」

→ 分镜表时长是「剪辑时长」，生成的视频是 `17n+5` 帧，多出来部分在剪辑时裁掉。
**但按用户指示，此事不需要处理。**

---

## 十、本机 H3 节点能力（**未落入方案文档**）

`D:\AI\ComfyUI-aki-v1.7\ComfyUI\custom_nodes\minimax-h3-audio-t8\`

**注册了 210 个节点**，近 3MB 源码。

| 组 | 数量 | 代表节点 |
|---|---|---|
| Speech / 对话 | 21 | `DialogueScript`、`DialogueBoundaryAnalyzer`、`DialogueSafeMaster`、`JointDialogueConditioning`、`SpeakerRoutingAudit` |
| Skin / 皮肤 | 19 | `SkinFinish` 全系列、多人语义遮罩、频率分离 |
| Prompt / 提示词 | 18 | `PromptCompiler`、`PromptRelay`、`PromptRewriter8B`、`SemanticContractAudit` |
| Face / 人脸 | 16 | `FaceRefine` 全家桶、`FaceTrackAssign`、`FaceCastMerge` |
| LongVideo / 长视频 | 14 | 断点续跑、候选接受、上下文保存/加载、后台队列 |
| Motion / 运动 | 9 | `MotionQualityAudit`、`MotionRecovery`、`MotionOverlap` |
| Repair / 修复 | 8 | 选择性分段修复 |
| Hybrid / 混合 | 5 | `HybridModelLoader`、`HybridArtifactBuilder` |
| Audio / 音频 | 9 | `AudioMix`、`AudioIntegrityAudit` |
| Sampler / 采样器 | 21 | `DualClockSampler`、`NFEResumeSampler`、`SPEED` 系列 |

**其中与本项目最相关的**：
- `MiniMaxH3DialogueScriptT8` / `DialogueTurnSelect` / `DialogueBoundaryAnalyzer`
  → ✅ **已查证**：`DialogueBoundaryAnalyzer` 用 faster-whisper 做边界分析，思路已吸收进第六章 B/C
- `MiniMaxH3LongVideoOrchestrator` / `LongVideoAutoQueue`
  → ✅ **已查证**：见第十二章（上下文帧、种子策略、accepted 计数）
- `MiniMaxH3NFEResumeSampler` / `NativeLatentResumeManifest`
  → ✅ **已查证**：断点续跑机制已实现

**⚠️ 命名陷阱：两个「hybrid」不是一回事**

| 名称 | 实质 | 与本项目 |
|---|---|---|
| `task_type = "hybrid"` | **视频生成的输入模式**（关键帧 + 参考素材一起喂） | ✅ **直接相关** |
| `hybrid_model.py`（1828 行） | **模型权重合并工具**：把两个 checkpoint 的 AdaLN 曲线做仿射重基 | ❌ **与本项目无关** |

后者核心常量：

```python
ALGORITHM = "curve_affine_rebase_fp64_target_slice_set_v1"
BLOCK_COUNT = 50
CURVE_SHAPE = (1025, 8)      # 曲线表
HIDDEN_SIZE = 5376
MODALITY_ORDER = ("video", "text", "audio")
```

→ 这是模型工程（合并权重），不参与业务流程。**不要因为它叫 hybrid 就以为跟 Hybrid 模式有关。**

---

## 十一、关于「hybrid」命名陷阱的独立警示

**这一条单独成节，因为它已经误导过本鲸一次。**

在 `minimax-h3-audio-t8` 里搜 `hybrid`，会命中两个毫不相干的模块：

| 命中 | 文件 | 实际作用 |
|---|---|---|
| `task_type="Hybrid"` | `conditioning.py` `resolve_task_type()` | **视频输入模式**：关键帧 + 参考素材同时喂 |
| `HybridModelLoader` / `HybridArtifactBuilder` | `hybrid_model.py`（1837 行） | **模型权重合并**：AdaLN 曲线仿射重基 |

配置表里也有两处：

```python
# conditioning.py
"hybrid": (None, None, True),   # 首帧/尾帧可选，参考媒体必需

# hybrid_model.py
HYBRID_PLAN_TYPE   = "H3_T8_HYBRID_PLAN"
HYBRID_ARTIFACT_TYPE = "H3_T8_HYBRID_ARTIFACT"
```

**结论：本项目只需要 `conditioning.py` 那个 Hybrid。**
`hybrid_model.py` + `hybrid_compatibility.py` 共 106KB，**不需要读**。

---

## 十二、长视频编排机制（读码结论 · 未落入方案文档）

源码：`custom_nodes\minimax-h3-audio-t8\long_video.py`（46.1KB）+ `long_video_orchestration.py`（15.7KB）

### 12.1 核心机制：上下文帧（context frames）

**这是本方案完全没写、但至关重要的机制。**

```python
# LongVideoPlan
active_context = 0 if segment_index == 0 else context_frames
required_frames = max(minimum_render_frames, requested_frames + active_context)
render_frames = align_frame_count(required_frames)
available_after_context = render_frames - active_context
final_frame_count = available_after_context     # 非末段
```

**含义：第 2 段起要多生成 `context_frames` 帧作为运动上下文，生成后裁掉。**

```
第 1 段：生成 100 帧 → 成品 100 帧（无上下文）
第 2 段：生成 122 帧（100 + 22 上下文）→ 裁掉前/后 22 帧 → 成品 100 帧
```

**优势**：在 **latent 层**做上下文衔接，**像素时长不变**，不会产生「扣首帧少一帧」的问题。

### 12.2 `context_frames` 只有三个合法值

```python
if int(context_frames) not in CONTEXT_FRAME_STEPS:   # 5 / 22 / 39
    raise ValueError("context_frames must be 5, 22, or 39")
```

**不是自由参数**，是模型训练的固定档位。默认 22。

### 12.3 非末段不能裁尾巴（关键约束）

```python
# A continuable segment must end at the sampled latent tail.
# Otherwise the next context would come from frames the user trimmed away.
if is_final_segment:
    final_frame_count = requested_frames
    hidden_tail_frames = available_after_context - requested_frames
else:
    final_frame_count = available_after_context
    hidden_tail_frames = 0
```

**如果这一段要被下一段接续，就不能裁尾巴**——否则下一段取到的上下文是被裁掉的帧，链条断裂。

→ **只有最后一段可以裁到精确时长，前面各段必须保留到 latent 尾部。**

### 12.4 训练范围警告（不报错，只警告）

```python
payload["trained_range_warning"] = not (MIN_TRAINED_FRAMES <= render_frames <= 362)
```

约 15 秒以上出训练范围，**给警告但继续跑**。

### 12.5 种子策略三选一

```python
"fixed"              → 每段同种子
"increment"          → (base + index) & MAX_UINT64
"hash_chain_segment" → sha256(chain_id \0 seed \0 index) 取前 8 字节
```

**默认 `increment`。** `hash_chain_segment` 用于断点续跑——换了 chain_id 就是新链。

### 12.6 进度按「已接受」算，不按「已生成」

```python
@property
def complete(self):     return self.accepted_count == len(self.segments)
@property
def next_segment(self): return self.segments[self.accepted_count]
@property
def progress(self):     return self.accepted_count / len(self.segments)
```

**关键设计：生成的候选不算进度，被 accept 的才算。**

→ 这正好回答本方案「多候选挑选」的缺口：**候选 → 用户挑选 → accept → 才计入进度**。

### 12.7 段级覆盖

```python
_segment_overrides(segment_prompts_json)
```

支持三种格式：`list`、`{index: item}`、`{segments: [...]}`。每段可单独指定 `prompt` / `note` / `seed`。

### 12.8 采样参数需成组校验

```python
_sampling_identity(steps, shift_video, shift_audio, sampler_name, scheduler)
# steps: 1-1000
# shift_video / shift_audio: 有限正数
```

**五个参数绑成一个 identity**，确保整条链用同一套采样配置。改了就算不同链。

### 12.9 对方案文档的影响

本方案原文写的：

> 长视频分段封顶、断点续跑

**实际节点已经实现了**：
- 分段上下文帧（5/22/39）
- 断点状态保存/加载（`save_context_state` / `load_context_state`）
- 时间轴计算（`timeline_start_seconds` / `timeline_end_seconds`）
- 训练范围警告
- 分段种子派生
- 已接受计数驱动的进度与续跑

→ **方案里「断点续跑没定义」「多候选没定义」这两条可以划掉，改成「复用节点现成机制」。**

---

## 十三、`speech_verification.py` 匹配逻辑的技术评价

### 13.1 可直接复用的部分

**`normalized_asr_units()`** —— Unicode 感知的归一化：

```python
normalized = unicodedata.normalize("NFKC", text).casefold()
normalized = normalized.replace("'", "'").replace("ʼ", "'")
# CJK / 假名 / 韩文 → 按字切
# 其他文字 → 按词切，保留组合符和词内撇号
```

**`_word_unit_stream()`** —— 把 token 拆成字流并记住归属：

```python
for word_index, word in enumerate(words):
    units = normalized_asr_units(word.get("word", ""))
    heard_units.extend(units)              # 「我的」→ ['我','的']
    owners.extend([word_index] * len(units))  # 记住各自属于哪个 token
```

**这两段解决了实测发现的「中文分词不均匀」问题。**

### 13.2 必须改的部分：`exact_target_word_spans()`

```python
for start in range(len(heard_units) - len(expected_units) + 1):
    end = start + len(expected_units)
    if heard_units[start:end] != expected_units:   # ← 严格相等
        continue
```

**问题一：NFKC 不转换繁简。** `漸` 归一化后仍是 `漸`，与期望的 `渐` 不等 → 匹配失败。

**问题二：要求唯一命中。**

```python
unique_target_found = len(spans) == 1
```

台词重复出现（「我不知道」说两遍）→ 判成 `ambiguous_multiple_exact_targets` → 不报边界。

### 13.3 改进方案

```
原版：heard[start:end] == expected              严格相等
改进：edit_distance(heard[start:end], expected) ≤ max(1, len*0.15)   容错 15%
     且匹配前先过繁简归一化（opencc 或自建映射表）
```

### 13.4 值得借鉴的设计思路

**「找不到就报错，不猜」**：

| 情况 | status | 行为 |
|---|---|---|
| 找不到 | `target_not_found` | 不报边界 |
| 多处命中 | `ambiguous_multiple_exact_targets` | 不报边界 |
| 唯一且干净 | `clean_exact_target` | 报边界 |
| 唯一但有额外字 | `unique_target_with_lexical_extras` | 报边界 + 标记 |

**结果里明确标注 `"is_not_a_speech_classifier": True`**，防止把能量高低误当「有没有人在说话」。

→ **这个措辞说明作者踩过坑。**

---


## 十四、待用户确认的问题（问了没答）

1. 交付格式（FCPXML / SRT / CSV）—— 「等等，我想想」后话题转走
2. ~~切点两侧时间轴怎么对齐~~ → ✅ **已解决**（按分镜文本片段 + ASR 逐字时间戳）
3. ~~静音检测切在字中间怎么办~~ → ✅ **已解决**（根本不用静音检测，按字边界切）
4. `Hybrid` 模式在 GUI 里是否要单独露出（还是完全藏在「接尾帧」按钮后面）
5. 拼接做到什么程度（纯拼 vs 加转场 vs 烧字幕 vs 混 BGM）

---

## 十五、遮挡策略降级（2026-11-10 用户裁决）

**原规则**（EX02 §6 / EX08 §8 / nsfw-design §7.1）：R18 提示词遇到直白描述被过滤或质量下降时，「不靠加码形容词，靠改构图」，其中**遮挡**（手臂/大腿/被褥/衣物残片/前景道具/水面）是优先级第 2 的手段，且原文要求「必须在提示词里明确写出所选手段」；L4 档定义本身也写死「以遮挡与角度控制可见范围」。

**用户改主意**：遮挡等构图手段**不再作为系统强制策略**——要不要遮挡、用什么挡，**交给使用时判断**（用户调用时自行决定）。

**落点**：

| 位置 | 改动 |
|---|---|
| `nsfw-design.md` §二 L0-L5 表 | L4/L5 的可视状态描述改为「可见范围由用户决定」，去掉档位定义里的强制遮挡措辞 |
| `nsfw-design.md` §7.1 | 「遮挡与构图替代策略」降级为「构图手段参考（可选）」，删掉「必须明确写出所选手段」强制条款 |
| `nsfw-design.md` §10 目录树 | `policy-nsfw.md` 里的「遮挡策略」条目改为「构图手段参考（可选）」 |
| `packages/shared/src/schemas/nsfw.ts` | INTENSITY_LEVEL_TABLE 的 L4/L5 visualState 同步新口径（B 块直抄发生在裁决前，主会话修正） |
| `execution-plan.md` M3-5 | policy-nsfw.md 交付物清单仍含「遮挡替代策略」字样 → M3 施工时按本裁决降级为可选参考，不必改 WBS 结构 |

**不改的**：`docs/excerpts/` 全部摘录（证据快照，保持原文）；`storyboard-rules.md`/`13_分镜总控v9` 里的「遮挡」是转场与构图叙事用语，与 NSFW 档位无关，不动。

---

## 十六、合规闸门虚拟角色判定口径（2026-11-10 用户裁决）

**背景**：原闸门措辞（「幼态特征」「年龄无法确认为成年 → 拒」）会把「几百岁的少女 / 千年狐妖」等**设定为成年的虚拟角色**误拦截；同时幼态 NSFW 是绝对红线，任何时候都不允许。

**裁决**（详见 `nsfw-design.md` §12.1）：**判身体呈现，不判设定数字**。

- **硬拒不变**：儿童身体特征（头身比偏幼/四肢短粗/第二性征未发育）或明确的**未成年身份指向**（小学生/中学生/儿童/幼 + 义务教育语境）→ 任何情况下拒绝。「外表是小孩子」的虚拟角色设定几百岁也不行
- **判定集收窄**：单纯外表年轻、娇小（非儿童比例）、二次元画风、「少女」称呼、**非未成年的设定数字**（五百岁/千年）不再构成拦截理由——几百岁少女只要身体呈现为成年人体即正常过闸
- **JK 降级（同日追加裁决）**：JK 制服/百褶裙/水手服等**服装品类词从硬拒信号里移除**——JK 在当代语境已泛化为时尚品类。**成年身体 + JK = 放行**；服装只在「身份词 + 场景」组合指向未成年时作为佐证（如「初中教室里的学生」）
- **自报年龄数字 < 18 仍硬拒**：设定数字不拦指的是「五百岁」这类成年宣称；**自报未成年数字（12 岁/17 岁）是未成 年宣称，照拦**——两条不矛盾，拦的是宣称本身是未成年的
- **双信号冲突**：文本设定 vs 视觉呈现冲突时以**身体呈现**为准
- **证据不足**：原「无法确认 → 拒」一刀切改为「存在未成年身体信号才拒」；纯风格化画风不算信号
- **申诉通道**：GUI 人工复核，复核标准依然是身体呈现，不是设定数字

---

## 十七、D1 已定：闸门与读图同链分两步（2026-11-10 用户裁决）

**原待定项**（BUILD.md §5 D1）：合规闸门本地判还是云端判。

**裁决**：**不区分云端/本地**——后端全是 OpenAI 兼容接口，运行时手动选模型即可；NSFW 与否手动选择。闸门与读图**同链分两步**：

```
图进来
  ① 判定步（轻量）：引导词含 §12.1 口径，模型自然语言回答有无未成年信号
     → 拦则止，输出只进审计不进管线
  ② 读图步：引导词零审核字眼（防提示词污染），产出直接喂提示词链
后端拒绝/判拦 → 换一个后端手动重试
全部后端都不通过 → 拦截，无法推进
```

**裁决过程中的否决项**（防回潮）：
- ❌ 独立 JSON 判定字段（facts/gate 双输出）——多余，整条链决策主体是人不是程序，自然语言足够
- ❌ 判定与读图单次调用合一——模型注意力会带审查视角，输出混入免责声明污染视频提示词，故物理分两步
- ❌ 完全取消闸门靠模型自觉拒——模型拒绝发生在生成深处、无审计格式、覆盖率无保证，红线无兜底

**对 M2 的影响**：M2-1 从「写视觉判定」缩成「写 §12.1 引导词 + 信号标记检查」，人日下降；M2-2 绕过测试按 §12.1 口径重写。部署无新增依赖。

---

## 十八、TK 收编三处裁决（2026-11-10 用户裁决）

针对 EX15（TK 写作 SKILL）收编进 M13 的三个悬置点：

1. **C 类禁忌 12 的适用口径**：「公共场合禁大声笑声」按**场景当下状态**判，不按初始设定判——原文 L649-663 自带场景转化机制（崩溃不顾忌/挪至无人角落 → C 类自然过渡回 A/B 类，拟声词从省略号渐变到正常笑声）。转化过程要写出渐进感，不许从「……呜……」直接跳「嘿嘿嘿哈哈哈哈」
2. **♡/❤ 双轨矛盾听 R8**：润色 SKILL 说两符号等价可互换（L471），标点校对 SKILL R8 说对手戏甲方❤乙方♡（L1349）——**以 R8 为准**：对手戏中符号编码「谁在说」（甲方实心/乙方空心），非对手戏（独白/旁白）自由用。等价规则降级为非对手戏场景的默认
3. **素材库「幼儿退行」条目照单全收（A 案）**：作为 status 类正常设定模板进 M13-7 素材库。其实质是压力下退化到被宠着的状态（语言变软、依赖），属情味设定，不构成合规问题——主会话曾过度解读为重口味方向，已纠正

**附带备忘**（M13 开工时再议，不现在裁）：标点 SKILL 的 R1-R8 校对规则可程序化（M13-10 只排了 0.5 人日），届时评估做成自动校对工具还是维持提示词纪律。

---

## 十九、TK SKILL 收编形态：全篇入库、分段注入（2026-11-10 用户裁决）

**用户原话**：「全篇可以，但是不应该一次给完（一次直出）。」

**裁决**：EX15 全文（2068 行）**全部收编**进项目，但**运行时按阶段/场景类型分段注入**，任何一次 LLM 调用只看到它当前需要的那一段。依据是 architecture.md §5.3.3 的拼装机制与 content-tradeoffs §5.1 的归并表——知识全量入库，指令按需组装。

**切分与注入时机**（EX15 的天然段落边界）：

| 段 | 内容（EX15 位置） | 注入时机 |
|---|---|---|
| **S1 工作流骨架** | novel_nsfw 五阶段 + novel.kb 结构 + 创作准则（L50-164） | **M13 阶段一/二/三全程**（入口 C 的流程指令） |
| **S2 写作规范** | 词汇修正表 / 深度交织公式 / 拟声词总则 / 标点符号规范 / 瘙痒描写原则（L166-274） | **阶段三（初稿）与阶段五（润色）** |
| **S3 拟声词规则层** | A/B/C 类定义、笑声五阶段、符号系统规则、口塞/增敏识别、14 条注意事项（L285-1259 的规则性内容） | **阶段四（占位符填充）**，且按命中场景类型只给对应段：A 类场景不给 ♡/❤ 段，C 类不给振动器档位段 |
| **S4 场景专项词库** | 部位词库 / 档位音效 / 腔内 / 耳内（L386-947 的词表部分） | **阶段四**，按占位符涉及的部位/道具**检索命中后注入**（配合素材库机制，不是全表塞） |
| **S5 标点校对** | punctuation_brackets 全部（L1261-1446） | **阶段五（润色/校对）**独占 |
| **S6 素材库指南** | 目录结构 / 去作品化纪律 / 关键词索引（L1448-1538） | **建库时**与**阶段四检索时**（只给检索相关类的 section） |
| **S7 使用例** | 《遥控游戏》示范文（L1540-2066） | **不入注入池**——只作为 M13-8 整理素材时的风格参照（去作品化后入库） |

**防直出的硬规则**：
1. 拼装函数按 S1-S6 分文件存放（对应 `prompts/` 树的 writing-flow / theme-tk 位置），**禁止任何调用点整篇读 EX15**
2. 注入总量的软上限：单次调用附加的 TK 段 ≤ 2 段（流程段 + 内容段各一），超出说明该次调用职责不清
3. 防过拟合原则照抄原文 L292：示例文本是参考规律非固定模板，**严禁直接复制示例段落进成稿**

**与既有裁决的关系**：本条是 §十八 的实现层补充——§十八 定了「收编什么、按什么口径」，本条定「**怎么喂**」。M13-8 的 3.0 人日里含按 S3/S4 切分重构词表结构的工作量。

---

## 二十、秒转帧取整方向裁决：目标时长向上对齐（2026-11-10 · M7 施工 [BLOCKED] 裁决）

**矛盾**：architecture L1521 / api-contract L963 的 `secondsToFrames` 代码用 floor 取 n（17n+5 向下），但 api-contract L970-976 换算表（5→124 / 10→243 / 15→362）与 architecture L1533-1537 GUI 示例（5.0 秒 = 约 124 帧）只有 ceil/round 取 n 才成立。M7 施工时按 floor 实现，spec 冻结用例全红，[BLOCKED] 上报。

**裁决**：**目标用户时长换算用 ceil（向上对齐到 17n+5 网格），保证实际出片 ≥ 用户要求**。

- 依据一：换算表是 GUI 与 API 行为的权威描述（含 12 秒档），代码块与表格矛盾时以表格为准——表格被 GUI 截图、MCP 工具描述（mcp-tools L473）多处引用
- 依据二：语义上「用户要 5 秒片」给 4.46 秒（floor，107 帧）是缺斤短两；给 5.17 秒（ceil，124 帧）与「±0.6 秒内属正常」的回显声明一致
- 依据三：「向下对齐」在原文档中的**正确适用场景**是参考视频 probe 帧（L1559 alignH3Frames）与长视频分段裁剪（L1900）——那里向下是防超长，不是短斤少两
- **修正值**：12 秒 = 294 帧（12.25s，+0.25s），非换算表的 277（277 本身与 floor 公式矛盾，是表格笔误；ceil 网格上 12s 落 294）

**影响面**：frames.ts 已按 ceil 实现（[M07.md 002]）；architecture L1521 / api-contract L963 两处代码块为文档笔误，留待文档修订批次统一改（不阻塞施工）。refVideo.ts 的 probe 帧对齐**维持 floor 不变**（适用场景不同）。
