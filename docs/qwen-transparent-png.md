# Qwen 透明底出图 · 验证记录

> 日期：2026-11-10
> 环境：ComfyUI 0.43.1 @ 127.0.0.1:8188，RTX 5070 Laptop（7.93 GB 显存）
> 状态：**文生透明底已验证可用** ✅ ｜ 照片抠主体未打通 ⚠️ ｜ 超分待补测

---

## 一、结论

**Qwen Image 2.1 文生图时，靠提示词就能直接输出带 alpha 的透明底 PNG，不需要 Layered 模型，也不需要 rembg / SAM 之类抠图节点。**

实测数据（主人标准写法）：

| 指标 | 结果 |
|---|---|
| 输出格式 | PNG 32bpp ARGB，alpha 通道有效 |
| 背景像素 | `A=0` 完全透明 |
| 主体像素 | `A=255` 完全不透明 |
| 半透明过渡 | **48.4%**（自然羽化，非二值） |
| 边缘 | 发丝通透，无白边 |

---

## 二、标准提示词写法（推荐）

### 三段式结构

主人给的写法，模型遵从度高，实测优于自由发挥的英文关键词堆砌。

```
[1] 开头声明格式：   这是一张具有透明度的 RGBA 格式图像。
[2] 中间描述主体：   [主体描述]，边界清晰、独立完整的完整主体。
[3] 结尾去掉背景：   该图像具有 alpha 通道，背景完全透明。
```

**三段的各自作用**：

| 段 | 作用 | 要点 |
|---|---|---|
| 开头 | 声明格式 | 模型对**前置指令**遵从度更高，必须放最前 |
| 中间 | 保证主体 | 必须是**边界清晰的独立主体**（人物、贴纸、杯子、图标）；别写"风景里的山"这种没有明确轮廓的内容 |
| 结尾 | 移除背景 | 把背景从画面里摘掉，防止模型脑补渐变底 |

### 已验证的完整提示词

**正向（中文，定妆照场景）**：

```
这是一张具有透明度的 RGBA 格式图像。
一个年轻女性的全身正面定妆照，站姿自然，双臂垂放，边界清晰、独立完整的完整人物主体。
该图像具有 alpha 通道，背景完全透明。
```

**负向**：

```
白色背景, 灰色背景, 影棚布景, 投影, 地面, 渐变背景
```

**对照用英文版**（也能用，但发丝细节略差）：

```
正向：A young woman standing, full body, front view, transparent background,
      PNG with alpha channel, isolated subject, no background, cutout style,
      photorealistic, sharp focus
负向：white background, gray background, studio backdrop, shadow, floor
```

### 两个变体（官方说明里提到的）

**变体 A · 照片抠主体**（传入参考图）：

```
从输入图像中提取包装主体，保留轮廓、杯柄空洞与半透明边缘，
移除货架与台面，输出带 Alpha 的透明背景素材。
```

> ⚠️ 本机实测这个变体**没打通**，详见 §五。

**变体 B · 改已有透明图**：

```
把台灯由红改蓝，保持轮廓、尺寸和透明区域，不添加背景。
```

> 未实测。逻辑上可行，因为它明确要求"保持轮廓和透明区域"。

### 官方极简写法

ComfyUI 工作流目录里的 `04_去背景_remove_bg.json` 备注写的是：

> 本质就是图像编辑 + 一句固定指令，官方模板同款：
> `Remove the background, and output a PNG image.`
> VAE 四通道，输出直接带 alpha，不需要 RMBG / SAM 之类抠图节点。

**一句话版可用**，适合快速测试。三段式版在细节上更稳。

---

## 三、工作流配置

### 文生透明底（已验证）

用 `image-qwen21v2-t2i.json`，**节点一个都不改**，只设置提示词。

```json
{
  "494": { "class_type": "UNETLoader",
           "inputs": { "unet_name": "qwen_image_2.1_int8_convrot.safetensors" } },
  "495": { "class_type": "CLIPLoader",
           "inputs": { "clip_name": "qwen3vl_8b_nvfp4.safetensors", "type": "qwen_image" } },
  "496": { "class_type": "VAELoader",
           "inputs": { "vae_name": "qwen_image_2.1_vae_bf16.safetensors" } },
  "493": { "class_type": "TextEncodeQwenImage21",
           "inputs": { "prompt": "<三段式提示词>",
                       "negative_prompt": "<上面那串负向>",
                       "resolution": 1024 } },
  "502": { "class_type": "EmptyLatentImage",
           "inputs": { "width": 768, "height": 1024, "batch_size": 1 } },
  "484": { "class_type": "RandomNoise",
           "inputs": { "noise_seed": 20261110 } }
}
```

**关键点**：

1. **`VAELoader` 必须是 `qwen_image_2.1_vae_bf16`** — 这个 VAE 是四通道的，alpha 就是从它出来的
2. **不需要 `SaveImageWithAlpha`** — 普通 `SaveImage` 接 `VAEDecode` 输出的就带 alpha
3. **seed 固定**，方便复现

### 本机可用模型（实测）

| 类型 | 文件 |
|---|---|
| UNET | `qwen_image_2.1_int8_convrot.safetensors`（6.76 GB） |
| CLIP | `qwen3vl_8b_nvfp4.safetensors` |
| VAE | `qwen_image_2.1_vae_bf16.safetensors`（644 MB） |

模型少但够用。MOSS 只有 `moss_image_sft_int8_convrot.safetensors` 一个 int8 版本。

---

## 四、GUI 设计

定妆照生成面板加一个勾选框：

```
┌ 角色定妆照 ──────────────────────────────────┐
│ 角色名  [林晚            ]                    │
│ 外观描述 [粉色长发，红色眼睛，白色水手服...]    │
│                                               │
│ ☑ 透明底输出（RGBA）                          │
│   勾选后自动注入透明底提示词片段               │
│                                               │
│ 画幅   [768 × 1024 ▾]                         │
│ 种子   [20261110]  [随机]                     │
│                                               │
│        [ 生成 ]  预计 8 秒                     │
└───────────────────────────────────────────────┘
```

**勾选后的注入逻辑**：

```ts
const TRANSPARENT_PREFIX = "这是一张具有透明度的 RGBA 格式图像。";
const TRANSPARENT_SUFFIX = "该图像具有 alpha 通道，背景完全透明。";
const TRANSPARENT_NEGATIVE = ["白色背景", "灰色背景", "影棚布景", "投影", "地面", "渐变背景"];

function buildPrompt(userPrompt: string, transparent: boolean) {
  if (!transparent) return { prompt: userPrompt, negative: "" };
  return {
    prompt: `${TRANSPARENT_PREFIX}\n${userPrompt}，边界清晰、独立完整的完整主体。\n${TRANSPARENT_SUFFIX}`,
    negative: TRANSPARENT_NEGATIVE.join(", "),
  };
}
```

**注意**：负向词是**合并**而非覆盖 —— 用户自己填的负面词要保留，透明底的负面词追加进去。

**出图后校验**：收图后读 alpha，若透明像素占比低于阈值（建议 5%）判定失败，提示重生成。实测同提示词不同种子有时会出白底，不能假设百分百成功。

---

## 五、失败记录：照片抠主体

### 现象

传入真实角色图（粉发二次元角色，背景为铁道口 + 列车），要求"去掉背景保留主体"，结果：

| 尝试 | 配置 | 结果 |
|---|---|---|
| 1 | `image-qwen21v2-edit.json` + 中文长提示词 + consistency LoRA | 整图半透明薄雾，`A=255` 占 **0%** |
| 2 | 同上，换 seed 破缓存 | **生成了完全不同的人**（粉发→黑发，水手服→黑背心） |
| 3 | 去掉 LoRA，改「去掉图片中的背景，保留……」 | 背景干净了，但**主体整个重画**（粉发长发→黑色短发） |
| 4 | 官方 `04_remove_bg.json`（API 转运） | 输出为抽象色块，**不是人像** |

### 可能原因

1. **`image-qwen21v2-edit.json` 是 Turbo 8 步**，采样步数太少，模型没时间保留原图细节，倾向重绘
2. **官方 `04_remove_bg.json` 是 30 步 + 不同采样路径**（`KSampler` 而非 `SamplerCustomAdvanced`），理论上更适合保主体
3. 但第 4 次尝试用 API 提交官方工作流时**结果异常**，可能是转换格式时漏了 UI 层的行为

### 待办

- [ ] 用 GUI 直接跑 `04_remove_bg.json` 确认正常
- [ ] 导出 API 格式对照，找出转换差异
- [ ] 确认 `TextEncodeQwenImage21` 的 `images.image_1` 接法正确

### 官方说明原文（`04_remove_bg.json` 内的 Note）

```
【去背景用法】
本质就是图像编辑 + 一句固定指令，官方模板同款：
  Remove the background, and output a PNG image.
VAE 四通道，输出直接带 alpha，不需要 RMBG / SAM 之类抠图节点。
想抠得更精细，可把 steps 提到 30-40。
```

---

## 六、环境信息

### ComfyUI 工作流目录

```
D:\AI\ComfyUI-aki-v1.7\ComfyUI\user\default\workflows\
├─ workflows.zip                      ← 打包的工作流集合
├─ 06_拆层_角色立绘.json               ← 已解压
└─ 22_H3_二采_作者原版_int8_8G显存版.json
```

`workflows.zip` 内相关条目：

| 文件 | 大小 | 说明 |
|---|---|---|
| `02_透明图_RGBA.json` | 7.9 KB | 文生透明图 |
| `04_去背景_remove_bg.json` | 11.5 KB | 图片去背景（带参考图） |
| `06_拆层_角色立绘.json` | 7.5 KB | 角色立绘拆层 |

已解压到 `D:\AI\dshw\qqbot\alpha_test\wf_extract\`（文件名按大小重命名，因为 zip 内的中文名编码混乱）。

### 其他发现

- `RemoveBackground`（birefnet）节点本机**有 bug**：`'str' object has no attribute 'encode_image'`
- `ImageRemoveBackground+`（essentials）**通道数不匹配**：`(1024,1024,4) vs (3,)`
- `WASRembgModelLoader` 需要 `models/birefnet` 或 `models/ben2` 权重，**本机未安装**
- 结论：**不要依赖这些抠图节点**，Qwen 的 VAE 四通道直出更可靠

---

## 七、测试产物

```
D:\AI\dshw\qqbot\alpha_test\
├─ std_rgba_zh_00001_.png               ★ 主人标准写法的透明底（质量最佳）
├─ composite_std_rgba_dark.png          ★ 深蓝背景合成，验边用
├─ prompt_only_00001_.png               英文关键词版透明底
├─ composite_prompt_only_00001__dark.png
├─ user_ref.png                         主人提供的角色参考图
├─ user_matte.png                       抠图失败产物（主体被重画）
├─ composite_user_matte.png
├─ orig_params.png                      官方工作流 API 提交的异常结果
├─ composite_orig_params.png
└─ wf_extract\                          从 workflows.zip 解出的工作流
   ├─ 02_RGBA.json
   ├─ 04_remove_bg.json
   ├─ 06_拆层_角色立绘.json
   └─ 04_api.json
```

ComfyUI 输出目录：`D:\AI\ComfyUI-aki-v1.7\ComfyUI\output\n2d_alpha_test\`、`n2d_matte_test\`
