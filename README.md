# 文本转短剧

把一段**文本**加工成**短剧**：文本 → 分集剧本 → 分镜 → 角色设定 → 图/视频提示词 → 配音 → 成片。

输入不限小说。小说、短故事、剧本、大纲、新闻都能进。

## 三个入口，同一套能力

```
        ┌────────────────────────────────────────┐
        │      核心业务逻辑（只有一份）             │
        └────────────────────────────────────────┘
             ▲            ▲              ▲
     ┌───────┴─────┐ ┌────┴────┐ ┌───────┴──────┐
     │ Agent (MCP) │ │ API 直调 │ │  GUI 手动点   │
     │ 对话式推进   │ │ 机械活用 │ │ 任意步骤插手   │
     └─────────────┘ └─────────┘ └──────────────┘
```

不是三条流水线，是同一个核的三种驱动方式。MCP 层刻意做薄——只转发，不含业务,
这样 GUI 和 Agent 不会漂移成两套逻辑。

## 状态

**设计阶段。** 目前这个仓库里是方案文档，代码尚未开始。

## 技术选型

| 层 | 选型 |
|---|---|
| 语言 | TypeScript（strict） |
| 运行时 | Node ≥ 22 |
| 包管理 | pnpm workspaces |
| 后端 | Express 5 |
| MCP | `@modelcontextprotocol/sdk`（stdio） |
| 存储 | better-sqlite3 + 文件系统 |
| 校验 | zod（REST 与 MCP 共用同一份 schema） |

本地生成后端：ComfyUI（出图/出片）、IndexTTS 2.5（配音）、Video2X（视频超分）。

## 目录

```
apps/
  core/        引擎：HTTP + 业务逻辑
  mcp/         MCP stdio 服务（只转发）
  web/         浏览器 GUI
packages/
  shared/      类型与 schema，REST/MCP 共用
prompts/       提示词运行时（骨架 / 输出壳 / 策略 / 主题包）
workflows/     ComfyUI 工作流
docs/          方案文档
```

## 开发

```bash
pnpm install
pnpm dev:core      # 引擎，默认 http://127.0.0.1:8400
pnpm test          # 单元测试
```

首次启动会在 `~/.n2d/config.json` 生成配置与访问 token（文件权限 0600）。

## 许可

私有项目，未授权请勿使用或分发。见 [LICENSE](./LICENSE)。
