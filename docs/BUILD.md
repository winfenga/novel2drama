# BUILD · 施工状态

> **这份文件的唯一用途：429 / 换模型 / 隔天回来时，五分钟接上。**
>
> 怎么用：
> 1. 先读本文件 §1 现状 → 知道停在哪
> 2. 再读 §2 当前任务 → 知道下一步做什么
> 3. 需要依据时查 `execution-plan.md` §5 对应里程碑的 WBS 行号
>
> **维护纪律**：每个子任务完成后立刻更新本文件，**不要攒着写**。攒着写 = 429 时全丢。

---

## §1 现状

| 项 | 值 |
|---|---|
| 当前版本 | `ce68952` + 未提交的 M0 代码（M0-2…M0-7 已验收，M0-8 进行中） |
| 当前里程碑 | **M0（地基）🚧 进行中 7/8** |
| 已完成子任务 | M0-1 ✅ M0-2 ✅ M0-3 ✅ M0-4 ✅ M0-5 ✅ M0-6 ✅ M0-7 ✅ / M0-8 🚧 |
| 下一任务 | **M0-8 装配 + echo 打通 + 三 source 审计验证**（一次性子代理 fef05b8a 施工中） |
| 阻塞项 | team 名额满 8/8（5 个死窗口占位，无法清理），M0-8 已改走一次性 subagent |

**一句话**：M0 的零件全部完工并验收（tsc 三包 0 error；config 4 项 + dispatch 6 项运行时验证全过），只剩装配层 routes/server/index + MCP 转发 + e2e。代码全部在盘上，日志 `worklog/M00.md` [001]–[006]。

---

## §2 下一步具体做什么

### 进行中的：M0-8 装配（task-5）

**要写的文件**：`apps/core/src/routes/tools.ts`、`apps/core/src/server.ts`、`apps/core/src/index.ts`、`apps/core/vitest.config.ts`、`apps/core/test/*.test.ts`、`apps/mcp/src/{forward,index}.ts`

**零件全部冻结**（不许改）：
- `packages/shared`（errors 37 码 / envelope / source）
- `apps/core/src/paths.ts`（五字段 DramaPaths：configFile=写路径恒新目录，legacyConfigFile=只读回退）
- `apps/core/src/config/*`（load/save/mask/net/types）
- `apps/core/src/auth/*`（guard 五步判定）
- `apps/core/src/tools/*`（audit / idempotency / registry / dispatcher / echo）

**M0 出口标准**（全绿才算完）：
1. `pnpm install` exit 0
2. `pnpm -r exec tsc --noEmit` 全包 0 error
3. `pnpm -C apps/core test` 全绿
4. 起服务 + 三 source（mcp/api/gui）各调一次 echo
5. 审计文件里 source 三值各 ≥1 条
6. 附带：MCP stdio 握手 initialize → tools/list → tools/call echo

**若子代理死了/429**：读 `docs/m0-spec.md` §5.12/§5.13 + 任务板 task-5，接着写。文件清单和验收标准全在本节。

### M0 完成后

1. 更新 `WORKLOG.md` §3 状态表（M0 → ✅）
2. git commit（M0 全部代码 + 日志 + `m0-spec.md`）
3. **下一里程碑**：关键路径 → **M1 领域模型与 schema**（14.0 人日，`execution-plan.md` L152-165，是 M2/M6/M7 共同前置）。M13 小说创作要等 M5（LLM 接入 6.0 人日）完成后才能起跑。

---

## §3 已完成

| 日期 | 内容 | 提交 |
|---|---|---|
| 2026-11-10 | 15 份主文档 + 15 份摘录逐行读完（16,632 行） | — |
| 2026-11-10 | `execution-plan.md` v2.1：14 里程碑 / 171.5 人日 / 190 处引用 | `421cfd8` |
| 2026-11-10 | `BUILD.md` + 工作日志体系（WORKLOG.md + 14 里程碑文件） | `edecafd` / `ce68952` |
| 2026-11-10 | `m0-spec.md` 冻结契约（§1-§10：版本/归属/签名/错误码/日志纪律） | 待提交 |
| 2026-11-10 | M0-2 骨架 + packages/shared 37 码；M0-3/4 配置+鉴权；M0-5 dispatcher；M0-6/7 审计+幂等 | 待提交 |

---

## §4 已知的坑（踩过就别再踩）

| # | 坑 | 教训 |
|---|---|---|
| 1 | 把文档里已有的东西当成"新发现" | 引用前先 grep 原文，`excerpts/` 里可能早就写了（`EX07` L145 那次） |
| 2 | 查文件"不存在"就下结论 | 只查了一个目录。**先 `Get-ChildItem -Recurse` 全盘找，再说没有** |
| 3 | 人日汇总表与 WBS 对不上 | **每个里程碑的子任务逐项求和，当场核对**，不靠估 |
| 4 | 计划表漏掉整块工作 | v2.0 漏了 M13 小说创作（入口 C），足足 20 人日。**列范围时把"入口"全查一遍** |
| 5 | 概念混称 | "三个入口"= 喂料方式（A/B/C）；MCP/API/GUI = 访问方式。两回事 |
| 6 | pnpm 12 默认拒跑依赖 install 脚本 | 首次 install 报 `ERR_PNPM_IGNORED_BUILDS`（esbuild）。`pnpm-workspace.yaml` 里 `allowBuilds: esbuild: true` 已配好，新里程碑不用再踩 |
| 7 | `DramaPaths` 四字段读写不分 | 初版把 legacy 回退做进 `configFile`，`saveConfig` 会写回旧目录。**规范缺陷要在调用侧打补丁之前修签名**——签名表达力不足是根因 |
| 8 | 根目录跑 tsx 探针报 `ERR_MODULE_NOT_FOUND` | 根 package.json 不依赖 shared。**探针必须放 `apps/core` 下跑**才能解析 workspace 链接 |
| 9 | TS 运行时判断不收窄联合类型 | `v6.kind() === "ipv6"` 不让 TS 窄化 `IPv4 \| IPv6`。用 `instanceof`（`ipaddr.IPv6`） |
| 10 | 子代理窗口会死于 429，遗言都没有 | 两个窗口同时死、closing message 为空。**纪律**：每完成一块立刻写日志；主会话验收只看盘上文件不看回报；代写日志必须标「主会话代记」 |
| 11 | team 名额 8 满后死窗口占位无法清理 | `maxMembers` 是 immutable roster。**长会话省着用 spawn_teammate**；单块任务用一次性 subagent（不占名额） |

---

## §5 待用户定的事（不阻塞 M0）

| # | 待定 | 卡在 | 归属 |
|---|---|---|---|
| D1 | 合规闸门本地判还是云端判 | 部署形态 | M2 前 |
| D2 | 动作库 150+ 条目全结构化 vs 原文 + 按需检索 | M3-6 人日 | M3 前 |
| D3 | `template` 引擎是否保留 | M5 接口 | M3 前 |
| D4 | 资产板模板选哪个 | M6-5 | M6 前 |
| D5 | 俯视平面图是否必出 | M6-5 | M6 前 |
| D6 | 多条生成时第 2 条起接帧是否默认勾上 | M12-1 | M12 前 |
| D7 | CF 证据等级是否展示给用户 | M11 | M11 前 |

---

## §6 恢复流程（429 后照这个做）

```
1. 读本文件 §1 → 知道停在哪
2. 读 §2 → 知道下一步
3. git log --oneline -5 → 确认代码与文档一致
4. git status → 看有没有未提交的半成品
5. 需要细节时：execution-plan.md §5 的对应里程碑
6. 需要规则时：execution-plan.md §0 的缩写表 → 查对应文档行号
```

**不要做的事**：不要从头读 16,632 行文档。`execution-plan.md` 的引用已经指向需要的那几行。

---

## §7 子代理使用约定

| 场景 | 用什么 | 注意 |
|---|---|---|
| 纯数据录入（M3-6 八类动作库、M13-8 TK 题材包） | `subagent`，独立窗口 | **必须把完整规则贴进 prompt**，它看不到本会话 |
| 跨多个任务的持续工作 | `teammate` | 可反复派活、可中断 |
| 需要本会话上下文的活 | `subagent_fork` | 继承已完成轮次 |

**硬要求**：子代理完成后，**必须由主会话更新本文件 §1/§2**。子代理不负责写 BUILD.md——它没有全貌。

**并行纪律**：`execution-plan.md` §6 列了可并行对。动手前先看那张表，别把有依赖的任务同时派出去。

---

## §8 日志纪律（每次派子代理必须交代）

### 8.1 一个里程碑一个文件

| 角色 | 写哪 |
|---|---|
| 子代理 | **只写自己那个** `docs/worklog/M{NN}.md` |
| 主会话 | 更新 `docs/WORKLOG.md` §3 索引、§4 跨里程碑记录 |

**为什么分文件**：多个子代理并行时写同一个文件会打架。分文件 = 零冲突。

### 8.2 只能追加，不能减少

| 允许 | 禁止 |
|---|---|
| ✅ 末尾追加新条目 | ❌ 修改已有条目 |
| ✅ 追加 `[CORRECTION #N]` 修正 | ❌ 删除任何条目 |

### 8.3 每完成一个板块立刻写

不攒着写——**攒着写 = 429 时全丢**。判断标准：

| 情况 | 是否写 |
|---|---|
| 完成一个子任务 | ✅ 写 |
| 完成一个里程碑 | ✅ 写，标 `[里程碑完成]` |
| 卡住了、放弃某方案 | ✅ 写，**这条最值钱** |
| 发现前面错了 | ✅ 写 `[CORRECTION #N]` |
| 只读文件没产出 | ❌ 不写 |

### 8.4 派子代理的 prompt 必须包含这段

```
你要写日志：docs/worklog/M{NN}.md
- 每完成一个子任务立刻追加一条 [00N]，格式照该文件内的模板
- 七个字段都要填，「踩到的坑」和「关键决定」最重要
- 只能追加，不能修改或删除已有条目
- 发现前面写错了，追加 [CORRECTION #N]，不要改原条目
```

**漏了这段，子代理就不会写日志**——它不知道有这个要求。

