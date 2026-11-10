# WORKLOG · 施工日志索引

> **本文件是索引，不是日志本体。** 实际日志在 `docs/worklog/M*.md`，一个里程碑一个文件。
>
> **为什么分文件**：多个子代理并行时，写同一个文件会打架。**每个里程碑独占一个文件，互不干扰。**

---

## §1 铁律（不可协商）

### 1.1 只能追加，不能减少

| 允许 | 禁止 |
|---|---|
| ✅ 在文件末尾追加新条目 | ❌ 修改已有条目的任何内容 |
| ✅ 追加 `[CORRECTION #N]` 修正前面的错误 | ❌ 删除任何条目 |
| ✅ 追加新条目说明"上一条作废" | ❌ 把已写的条目改短、改轻、抹掉 |

**为什么**：日志的价值在于它是**当时**的记录。事后修改 = 失去证据价值。错了就追加一条修正，让两条并存——**读者能看到你当时怎么想的、后来怎么发现的，这比一条"正确"的记录更有用。**

### 1.2 每完成一个板块立刻写

**不要攒着写。** 攒着写 = 429 时全丢。判断标准：

| 情况 | 是否写 |
|---|---|
| 完成一个子任务（如 M0-2） | ✅ 写 |
| 完成一个里程碑（如 M0 全部） | ✅ 写，并在条目里标 `[里程碑完成]` |
| 卡住了、放弃某个方案 | ✅ 写，这条最值钱 |
| 发现前一条件错了 | ✅ 写 `[CORRECTION #N]` |
| 只是读文件、没产出 | ❌ 不写 |

### 1.3 谁写

| 角色 | 写什么 |
|---|---|
| **子代理** | 只写自己那个里程碑的文件（`docs/worklog/M{NN}.md`） |
| **主会话（Lead）** | ① 更新本索引 §3 ② 汇总跨里程碑的事 ③ **不代写子代理的日志** |

**硬要求**：子代理的 prompt 里必须明确告诉它「你要写 `docs/worklog/M{NN}.md`，格式按 `docs/worklog/_模板.md`」。

---

## §2 条目格式（固定，不要自创）

```markdown
## [001] 2026-11-10 17:50 · M0-2 · monorepo 骨架建好，pnpm install 通过

- **做了什么**：建了根 package.json、pnpm-workspace.yaml、tsconfig.base.json，
  以及 apps/{core,mcp}、packages/shared 三处的 package.json + tsconfig.json
- **改了哪些文件**：
  - 新增 package.json
  - 新增 pnpm-workspace.yaml
  - 新增 tsconfig.base.json
  - 新增 apps/core/package.json、apps/core/tsconfig.json
  - 新增 apps/mcp/package.json、apps/mcp/tsconfig.json
  - 新增 packages/shared/package.json、packages/shared/tsconfig.json
- **关键决定**：tsconfig 用 NodeNext 而非 ESNext，因为 express 5 的 ESM 互操作还没稳
- **踩到的坑**：pnpm 第一次装报了 peer dep 警告，加 `--no-strict-peer-dependencies` 通过。
  这不是 bug，是 express 5 的类型包还没跟上
- **验证**：`pnpm install` 无报错（退出码 0）；`pnpm -r exec tsc --noEmit` 通过
- **下一步**：M0-3 配置层
```

**七个字段都要填。** 尤其「踩到的坑」和「关键决定」——这两项是给 429 后接手的人看的，比"做了什么"更重要。

**序号规则**：每个文件从 `[001]` 起，**只增不减**。即使删除条目也不重新编号（那会破坏外部引用）。

---

## §3 各里程碑状态

| 里程碑 | 日志文件 | 子任务 | 状态 | 最后更新 |
|---|---|---:|---|---|
| M0 地基 | `worklog/M00.md` | 8 | ✅ 完成（`dec4b5d`） | 2026-11-10 |
| M1 领域模型 | `worklog/M01.md` | 8 | 🚧 契约冻结（`m1-spec.md`），Block A/B 待派 | 2026-11-10 |
| M2 合规闸门 | `worklog/M02.md` | 4 | ⬜ 未开工 | — |
| M3 提示词资产 | `worklog/M03.md` | 8 | ⬜ 未开工 | — |
| M4 校验器 | `worklog/M04.md` | 7 | ⬜ 未开工 | — |
| M5 LLM 接入 | `worklog/M05.md` | 5 | ⬜ 未开工 | — |
| M6 分镜引擎 | `worklog/M06.md` | 8 | ⬜ 未开工 | — |
| M7 task_type | `worklog/M07.md` | 5 | ⬜ 未开工 | — |
| M8 ComfyUI | `worklog/M08.md` | 6 | ⬜ 未开工 | — |
| M9 媒体链路 | `worklog/M09.md` | 6 | ⬜ 未开工 | — |
| M10 拼接交付 | `worklog/M10.md` | 6 | ⬜ 未开工 | — |
| M11 前端 | `worklog/M11.md` | 7 | ⬜ 未开工 | — |
| M12 接帧长视频 | `worklog/M12.md` | 4 | ⬜ 未开工 | — |
| M13 小说创作 | `worklog/M13.md` | 11 | ⬜ 未开工 | — |

**状态取值**：`⬜ 未开工` / `🚧 进行中` / `✅ 完成` / `⛔ 阻塞`

---

## §4 跨里程碑的记录

> 不属于任何单个里程碑的事记在这里：架构级决定、全局约定、影响多处的变更。

| 日期 | 内容 |
|---|---|
| 2026-11-10 | 建立本日志体系。按里程碑分文件，避免并行写冲突 |
| 2026-11-10 | 计划表 v2.1 定稿：14 里程碑 / 171.5 人日。见 `execution-plan.md` |
| 2026-11-10 | 新增 `m0-spec.md`：M0 冻结契约（包名/端口/目录/签名/37 错误码/日志纪律）。**M1 起复用其中 shared 包约定** |
| 2026-11-10 | M0 施工期间发现并裁决文档漂移 D8-D11（见 `m0-spec.md` §9）；`DramaPaths` 签名修订（四字段→五字段，读写分离） |
| 2026-11-10 | M0 出口标准全绿（`dec4b5d`）：tsc 三包 0 error、vitest 24/24、三 source 审计落盘、MCP stdio 握手通。**两个子代理窗口死于 429，日志 [005]/[006] 由主会话代记（已标注）** |

---

## §5 检查日志是否被破坏

**append-only 是可以机械验证的**——用 git：

```bash
# 看某个日志文件的所有改动
git log -p -- docs/worklog/M00.md

# 有没有删除行（减号开头的内容 = 被删的）
git log -p -- docs/worklog/M00.md | Select-String '^-[^-]'
```

**如果出现删除行，就是违规。** 除了文件头部的初始化提交，任何后续提交都不应有删除行。

**恢复办法**：`git show <旧commit>:docs/worklog/M00.md` 取回被删内容，追加回去（不是覆盖）。
