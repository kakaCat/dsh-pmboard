# REQ-261001143526-8475 技术规范自动沉淀 + 补齐打包/发版工程规范

> 档位：**重档**（新增「规范自动沉淀」机制 + 多处接入点 + 新门禁）· 类型：feature

## TL;DR

上一个需求（REQ-261001110934-3766）建起了知识层，但暴露两个真缺口：

- **知识层没人叫它**：`src/domain/prompt/fragments/**` 里 **0 处**提及知识层或 `reqboard_kb`——工具在，没人用；
- **工程操作不在库里**：`docs/knowledge/conventions.md` 现有 **10 条**规范**全是「代码纪律」**（层边界/尺寸/样式归属…），
  而「开发完到底要跑什么」（打包、客户端构建、提示词重生成、知识层重生成、类型检查、测试、发版前检查）
  散在 `package.json` 的 10 个 scripts 与 `scripts/` 的 20 个入口里，**一条都没进规范页**。

本需求做三件事：**① 把工程操作写成规范条目**（每条挂可跑命令与期望输出）；
**② 让 Agent 在收尾时自动沉淀规范**（新增/变更的工程操作自动变 `C-NN` 条目 + 索引行，缺校验目标即失败）；
**③ 把「先查知识层 → 改完自证 → 收尾沉淀」写进阶段提示词**，形成闭环。

```
                     今天                                本需求之后
   +--------------------------------+     +--------------------------------------+
   | 规范页 10 条：只有代码纪律      |     | 规范页 = 代码纪律(10) + 工程操作(N)  |
   | 必做动作散在 package.json /     | --> | 每条：何时跑 | 命令 | 期望 | 失败怎么办 |
   | scripts/ 里，靠人记得           |     | 覆盖度由 kb-probe 机器检查           |
   | 提示词 0 处提及知识层           |     | 提示词三段各一句：先查 / 自证 / 沉淀  |
   +--------------------------------+     +--------------------------------------+
                                                     |
                                          +----------v-----------+
                                          | 收尾自动沉淀新规范    |
                                          | 缺校验目标 -> 门禁红  |
                                          +----------------------+
```

## 现状（实测，可复核）

| 面 | 实测 | 说明 |
|---|---|---|
| 规范页条目 | **10 条**（C-01…C-10），全部是代码纪律 | 无一条覆盖「打包 / 构建 / 重生成 / 发版」 |
| `package.json` scripts | **10 个**（build / build:client / verify:client / kb:build / kb:check / kb:probe / test / typecheck / prepublishOnly / prepare） | 只有名字在 package.json 里，语义与时机没人写 |
| `scripts/` 入口 | **20 个**（含 wrap-client / verify-client-build / inline-prompt-fragments / check-prompt-fragments / 4 个探针 …） | 哪些"必须跑"、跑完看什么，无文档 |
| 阶段提示词提及知识层 | **0 处** | `grep -rc "reqboard_kb\|知识层" src/domain/prompt/fragments/` → 全 0 |
| 已文档化的运行前提 | `docs/architecture/plugin-runtime-prerequisites.md`（装载层/构建产物陈旧态/样式归属） | 只覆盖"前提"，不是"操作清单" |

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|---|---|---|
| A1 工程操作条目化 | 打开 `docs/knowledge/conventions.md` 的 `## 工程操作` 节 | 覆盖下表 8 类动作，每条含「何时跑 / 命令 / 期望 / 失败怎么办」 |
| A2 每条命令真能跑 | 抽 5 条按卡片命令实跑 | 命令存在且退出语义与卡片描述一致（0 条"命令不存在"） |
| A3 覆盖度机器可查 | `npx tsx scripts/kb-probe.mts`（新增检查项） | `package.json` 的 scripts 与 `scripts/` 的"必跑入口"清单 100% 出现在规范页；缺一即非零退出 |
| A4 提示词接入 | `grep -c "reqboard_kb\|知识层" src/domain/prompt/fragments/{brainstorming,design,implementing}/*.md` | 三个阶段各 ≥1 处；且 `npx vitest run tests/prompt-gates.test.ts` 全绿（预算不超、floor 未裁） |
| A5 自动沉淀演练 | 走一次需求收尾（归档材料提交） | 知识库自动多出 ≥1 条 `C-NN` + 索引行；`pnpm run kb:check` 仍退出码 0 |
| A6 沉淀必须可验 | 故意写一条无校验目标的规范 → 跑自检 | 非零退出并指出该条 id（沿用 K8 口径，不新增"警告放过"） |
| A7 零回归 | 老片段注入 golden diff；`pnpm test` 与基线比 | 除新增句子外注入逐字节不变；失败数不高于基线（当前 106） |

## 产品定义

「技术规范」= **做事的方法**，分两类，都进同一个规范页：

| 类 | 回答什么 | 例 | 现状 |
|---|---|---|---|
| 代码纪律（已有 10 条） | 写代码时不许怎样 | 层边界只许向内、单文件 ≤400 行 | ✅ 已在规范页 |
| **工程操作（本需求补）** | 改完之后必须跑什么 | 改了 `src/client/**` → 必须 `pnpm build:client`；改了提示词片段 → 必须重生成 | ❌ 散落在 package.json / scripts |

「**规范自动沉淀**」= 收尾时由流程驱动、**由代码兜底质量**地把本次新增/变更的工程操作写成规范条目：
命令必须存在、必须可跑、必须登记索引行——否则门禁失败（不是"记得补文档"）。

## 用户与角色

- **实施 agent**：开工前查规范页（知道要跑什么）、改完照跑自证、收尾把新操作沉淀——不依赖记忆。
- **新窗口的 Agent**：索引 `## 规范` 节一眼看到操作清单，不必读 `package.json` + `scripts/` 猜。
- **维护者（人）**：发版前按规范页逐条过；新增脚本时被门禁提醒"这条还没进规范"。
- **知识层自身**：规范页是它的一个分节，沉淀走既有写入端（`entries` / 页面小节）。

## 接口与数据契约

**规范页新增分节**（`docs/knowledge/conventions.md`）：

```md
## 工程操作 #operations

### C-11 改了客户端源码必须重建 bundle #c-11
- 何时跑：改动 src/client/** 之后、提交前
- 命令：`pnpm build:client`
- 期望：`[verify-client] OK ... 样式归属章在场, CSS 分片完整`
- 失败怎么办：按提示修（缺归属章 → 见 C-05；分片截断 → 检查 styles/*.ts 收尾）
- 索引行：`- kb-conventions-c-11 · standard · 改客户端必须重建 bundle · → conventions.md#c-11`
```

**覆盖清单（机器可读，进自检）**：

| 触发面 | 必跑动作 | 现状来源 |
|---|---|---|
| 改 `src/**`（非 client） | `pnpm typecheck` | package.json |
| 改 `src/client/**` | `pnpm build:client`（含 wrap + verify） | package.json |
| 改提示词片段 `fragments/**` | `node scripts/inline-prompt-fragments.mjs` + `check-prompt-fragments.mjs` | scripts/ |
| 改知识层内容/样式 | `pnpm run kb:build` → `pnpm run kb:check` | package.json |
| 提交前 | `pnpm test`（与基线比失败数，而非求全绿） | package.json |
| 发版前 | `pnpm build` + `pnpm typecheck`（`prepublishOnly` 已挂） | package.json |
| 包内容 | `files` 白名单 + vendor 源码必须进包（镜像独立构建） | package.json |
| 装载面 | profile 是软链 → 改 client 后 GUI 需刷新（HMR 仅 dev:web 时自动） | plugin-runtime-prerequisites.md |

**自动沉淀的入口（设计阶段定稿，二选一或并存）**：

- **A 归档驱动**：`SubmitArchive` → `DepositKnowledge` 扩展一个 `kind=standard` 草稿（把本次新增的工程操作写入规范页 + 索引行）；
- **B 卡驱动**：实施收尾卡（doc 阶段）按 `serves: FR-3` 生成，走既有 `reqboard_task_report` 留痕。

**迁移与兼容**：既有 C-01…C-10 语义不动；新增条目只追加；提示词片段新增句子受既有预算与 floor 规则约束；
未开启自动沉淀时行为与今天一致。**回滚**：还原片段与规范页新增节即可。

## 功能点

- **FR-1: 工程操作条目化** —— 在 `docs/knowledge/conventions.md` 新增 `## 工程操作` 节，覆盖上表 8 类动作；每条含「何时跑 / 命令 / 期望输出 / 失败怎么办」四要素，且命令必须真实存在
- **FR-2: 操作条目按时机分组** —— 规范页明确「开工前 / 改动后 / 提交前 / 发版前」四档时机，让 Agent 能按当前阶段取用（而不是一次读全部）
- **FR-3: 规范自动沉淀** —— 需求收尾时（归档材料提交）自动把本次新增/变更的工程操作写成 `C-NN` 条目 + `## 规范` 索引行；**缺校验目标即失败**（沿用 K8 口径）
- **FR-4: 覆盖度机器可查** —— `scripts/kb-probe.mts` 新增检查：`package.json` scripts + `scripts/` 必跑入口清单必须 100% 出现在规范页，缺一即非零退出并列出缺失项
- **FR-5: 提示词接入（三段）** —— `brainstorming`/`design`/`implementing` 三个阶段片段各加一句：开工前 `reqboard_kb(kind='standard')` 查规范、改完按条目自证、收尾沉淀新规范；总预算不超（prompt-gates 绿）
- **FR-6: 检索可达** —— 操作条目在索引 `## 规范` 节登记，`reqboard_kb(kind='standard', query='打包')` 之类能查到；页面行数仍 ≤200（超限须拆页而不是硬塞）
- **FR-7: 兼容与预算护栏** —— 老片段注入除新增句子外逐字节不变；新增内容受 `kb-probe`（索引/页面预算）与 `prompt-gates`（floor 不裁）双重约束

## 边界

**做**：

1. 规范页新增「工程操作」节与 `C-11…C-NN` 条目（含打包/构建/重生成/发版前检查）
2. 自动沉淀机制（归档驱动或卡驱动，设计阶段定稿）+ 覆盖度自检
3. 三阶段提示词各加一句「先查 / 自证 / 沉淀」

**不做**：

1. **不改既有 10 条规范的语义**（C-01…C-10 只做措辞对齐，不改判据）
2. **不新增发版自动化脚本**（不做一键发布/自动 changelog）——本需求只把**已有动作**写清楚并可查
3. **不引入新依赖、不改台账 schema**；不碰 DSH 宿主与别的插件

## 档位依据（重档）

- **为什么是重档**：新增「规范自动沉淀」机制（写入端扩展 + 新门禁 + 三处提示词接入），且存在未定决策
  （沉淀入口二选一、操作清单的边界怎么划、覆盖度检查用什么口径）。
- **批准闸门**：本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认。

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t5 |
| FR-2 | ✅ 已接收 | t1、t5 |
| FR-3 | ✅ 已接收 | t2、t7 |
| FR-4 | ✅ 已接收 | t1、t7、t3 |
| FR-5 | ✅ 已接收 | t4、t6 |
| FR-6 | ✅ 已接收 | t5、t8 |
| FR-7 | ✅ 已接收 | t6、t8 |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
