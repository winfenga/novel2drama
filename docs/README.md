# 方案文档

文本转短剧的设计文档。**中断恢复先读 [handoff.md](./handoff.md)**。

## 先读这三份

| 文件 | 内容 |
|---|---|
| [core-principles.md](./core-principles.md) | **上位文档**：三层模型（事实 / 计划 / 渲染）、四条底线、内容策略分叉、三道质量闸 |
| [architecture.md](./architecture.md) | 总体架构、领域模型、MCP 层、提示词引擎、GUI 参数、生成后端、实施路线 |
| [api-contract.md](./api-contract.md) | REST 接口、错误码、响应包络、交付格式（FCPXML / SRT / CSV） |

## 分册

| 文件 | 内容 |
|---|---|
| [h3-prompt-rules.md](./h3-prompt-rules.md) | H3 提示词规则全集：六种分支路由、六段壳（Ref2VA / Hybrid 两版）、链上铁律、枚举值、运镜六条（含 `Arc Shot` 裁决） |
| [storyboard-rules.md](./storyboard-rules.md) | 分镜生产系统：八条铁律、时长级联 9 公式、资产编号、多模型适配层、20 项风险打分、因果审计 |
| [assets-and-config.md](./assets-and-config.md) | 素材清单、三步流程、参数速查与配方、速算表、黑话词典、FAQ |
| [nsfw-design.md](./nsfw-design.md) | NSFW 内容策略：L0–L5 档位、M1–M5 模块、8 类动作库、状态梯度 |
| [mcp-tools.md](./mcp-tools.md) | MCP 工具 schema、Agent instructions、幂等与审计 |
| [qwen-transparent-png.md](./qwen-transparent-png.md) | 透明底出图的提示词写法（已验证）、照片抠主体失败记录 |

## 过程记录

| 文件 | 内容 |
|---|---|
| [handoff.md](./handoff.md) | **中断恢复先读这份**：当前进度、已完成、下一步 |
| [conflict-register.md](./conflict-register.md) | 11 处工程冲突及处理结果（11/11 已闭合） |
| [content-tradeoffs.md](./content-tradeoffs.md) | 内容层的真冲突与分层方案 |
| [decision-log.md](./decision-log.md) | 对话中已定但未落进正式文档的决策 |
| [todo-and-reading.md](./todo-and-reading.md) | 待办与待读资料 |

## 配套目录

| 路径 | 内容 |
|---|---|
| [excerpts/](./excerpts/) | 15 份参考原文逐字摘录（687–2066 行），带行号索引 |
| [workflows/](./workflows/) | ComfyUI 工作流（图片超分，已实测跑通） |

## 验证状态

| 项 | 状态 | 说明 |
|---|---|---|
| Qwen 文生透明底 | ✅ **本机端到端验证** | 提示词直出 alpha，背景 A=0，发丝通透 |
| IndexTTS 2.5 配音 | ✅ **本机端到端验证** | RTF 0.88（预热后），时长控制误差 <3% |
| **图片超分（SeedVR2 3B）** | ✅ **本机端到端验证（2026-11-10）** | 1168×2016 → 1440×2484，111.1 s |
| H3 视频 2 采 | ⚙️ 用户侧已跑通，本项目未端到端验证 | 参数经确认可跑，尚未由本项目调用 |
| Video2X **视频**超分 | ⚠️ **待回测** | CLI 参数已摸清，实际出片未验证 |
| 照片抠主体（Qwen edit） | ❌ 未打通 | 会重画主体，不是精确抠图 |

> 「已验证」严格指**本机端到端跑通并有实测数据**，转述不算。
>
> ⚠️ **图片超分和视频超分是两套东西**：图片走 ComfyUI SeedVR2（已验证），视频走 Video2X（待回测）。

## 输入源

| 输入 | 处理差异 |
|---|---|
| 长篇网文 | 拆章 → 分集 → 分场 |
| 短故事 | 一段就是一集，跳过拆章 |
| 剧本 | 有对话标记，跳过改编直接分镜 |
| 大纲 | 框架不全，要扩写 |
| 新闻 / 热点 | 事实性强，要改写成戏剧冲突 |

统一抽象是「**文本单元**」`sourceUnit`，不是「章节」。

## 约定

- **中文文件名只出现在 `excerpts/` 内**，其余用英文名，避免跨平台与迁移问题。
- 文档里的行号引用指向 `excerpts/` 下的摘录文件，不是原始资料。
- 外部服务文档：`D:\AI\IndexTTS2_5\README_服务.md`（配音服务的用法、目录、性能）。
