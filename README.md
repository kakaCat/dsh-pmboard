# dsh-pmboard

**项目看板** — [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/dsh) 的需求流水线页面插件。
把「用户在对话里提出一个想法」到「需求立项 → 评审 → 拆分 → 实施 → 验收 → 归档」的完整生命周期，
做成看板可视、工具可调、每步留痕的流水线。

## 这是什么

一个 DSH **双半插件**（host + client）：

- **host 半**（Node）：reqboard JSON + SSE API（`/dashboard/api/reqboard/*`）、
  JSON 台账（两级状态机）、立项捕获管线（捕获用户消息 → 注入立项引导 → 三问弹框立项）、
  以及 **27 个 pm 工具**（见下）供 Agent 调用。
- **client 半**（Web GUI）：侧栏入口 + 中心栏看板视图——需求泳道、任务时间线、
  逐项弹框验收单、归档区。

设计原则：**创建即立项**（无待归类中间态）、**人工闸门在关键节点**
（立项三问 / 计划批准 / 逐项验收 / 归档）、**一切决策留痕可复盘**。

## 安装

在 DSH profile 的 `cordis.patch.yml` 中注册（无必填配置项）：

```yaml
- insert:
    - id: pmboard
      name: 'dsh-pmboard'
```

并在 profile 的 `package.json` 中加入依赖：

```json
{
  "dependencies": {
    "dsh-pmboard": "^0.1.0"
  }
}
```

重启 profile 后，GUI 侧栏会出现「项目看板」入口，Agent 可使用 reqboard_* 系列工具。

## 提供的工具（27 个）

工具清单的**唯一事实源**是 `src/tools/registry.ts`：本表与它逐条对齐，由 `tests/readme-tool-face.test.ts` 校验。
按用途分 6 组；`reqboard_submit` 是提交类合一入口，按 `kind` 分派六种产物。

### 立项与自查

| 工具 | 作用 |
|---|---|
| `reqboard_capture` | 立项弹框：识别到新工作意图时弹框问名称 / 类型 / 难度 / 文档位置（含工作区落点），作答即立项并绑定窗口 |
| `reqboard_create` | 手工立项路径（弹框通道不可用，或取值已明确时） |
| `reqboard_status` | 查本窗口绑定状态、席位、条款接收状态、待确认门与可选动作 |

### 阶段推进与人工门

| 工具 | 作用 |
|---|---|
| `reqboard_submit` | 提交阶段产物，按 `kind` 分派：需求文档 / 设计文档 / 拆分计划 / 验收材料 / 归档材料 / 原型 |
| `reqboard_ask_confirm` | 关键确认（原子化：确认 → 落章 → 推进）；弹框路径与文字证据路径自动分派 |
| `reqboard_confirm_receipt` | 取挂起确认回执（非阻塞弹框的取件口） |
| `reqboard_move` | 推进需求阶段（draft → … → accepting；取消 / 归档 / 重开是人工闸门） |
| `reqboard_accept_sheet` | 验收单逐项弹框裁决，未过项自动返工 |
| `reqboard_note_interruption` | 补写断点（中断原因原文进台账，供新窗口续跑） |
| `reqboard_clear_pause` | 清除 Dive 模式 armed 状态，允许手动干预 |

### 拆分与任务

| 工具 | 作用 |
|---|---|
| `reqboard_decompose` | 把**已批准**的拆分计划落成任务卡 DAG |
| `reqboard_task_move` | 推进任务状态（也可只修订某张卡的验收标准） |
| `reqboard_task_report` | 完工汇报：结构化落进任务卡文档（done 凭证门的前置） |
| `reqboard_task_tree` | 查父子卡结构：子卡阶段 / 状态 / 依赖 / 是否跑过 / 最近汇报 |
| `reqboard_task_status` | 查单卡执行状态与最近一次 run / 汇报 |
| `reqboard_task_adopt` | 归属补救：把缺父卡归属的卡挂回指定父卡下 |
| `reqboard_task_regenerate` | 给「意图=chain 却缺子卡链」的父卡补链（缺省只做只读诊断） |
| `reqboard_task_refs` | 补写 / 修正任务卡的需求条款引用（全量替换） |

### 自动实施链

| 工具 | 作用 |
|---|---|
| `reqboard_task_run` | 推进自动实施链：投递后台任务执行当前 ready 的子卡（投递式，立即返回） |
| `reqboard_task_execute` | 已弃用别名：语义与「自动实施链」组的唯一链入口完全相同，仅保留兼容 |
| `reqboard_run_status` | 查实施链运行态（runId / stepIndex / nextReady / jobStatus / pauseReason） |

### 归档

| 工具 | 作用 |
|---|---|
| `reqboard_archive_amend` | 需求归档后补录归档清单条目（只追加、幂等；不改产物、不改状态） |

### 协作与环境

| 工具 | 作用 |
|---|---|
| `reqboard_open_window` | 开一个新窗口（DSH 现成的会话分支）：本窗口忙时把新项目 / 长任务交给新会话 |
| `reqboard_bind` | 给一条需求加 / 减**席位**：worker（能领卡干活）或 observer（只读） |
| `reqboard_handoff` | 把需求交接给接管窗口（换 owner + 留痕 + 投底稿） |
| `reqboard_kb` | **知识层检索**：按 id / kind / query 取架构、规范、前端令牌、决策与坑；受 `budgetChars` 约束 |
| `reqboard_skill_install` | 投放 UI/UX skill 资产到会话工作区，返回子代理要用的绝对路径 |

## 项目知识层（docs/knowledge/）

新窗口的 Agent **读一份 ≤8K 字符的索引**就能知道：项目分几层、依赖往哪边、有哪些硬纪律、改 UI 去哪取颜色。

**缺层会自动生成**（REQ-261004174324-4195）：插件在项目根确定时检测 `docs/knowledge/INDEX.md`，缺了就自动补齐骨架与生成物（代码地图 / 设计令牌 / 两份 TSV），手写页只留占位、绝不覆盖；已有知识层则一个字节都不动。用 `knowledge.autoBootstrap=false`（或 `knowledge.enabled=false`）可关掉自动生成，回到下面的手动命令。

```bash
pnpm run kb:build   # 生成 代码地图 / 设计令牌 / 索引生成区（确定性，可重跑）
pnpm run kb:check   # 门禁：生成物零漂移 + 九项自检（预算/死链/孤儿/stale/规范可执行…）
pnpm run kb:probe   # 只跑自检，人读输出
```

| 产物 | 角色 | 上限 |
|---|---|---|
| `docs/knowledge/INDEX.md` | 唯一认知入口（一行一条指针） | ≤8,000 字符 / 200 行 |
| `architecture.md` / `conventions.md` / `glossary.md` | 架构 / 规范（每条挂可跑校验）/ 术语 | 每页 ≤200 行 |
| `design-tokens.md` / `code-map.md` | 生成物：前端令牌、模块级代码地图 | 每页 ≤200 行 |
| `entries/kb-NNNN.md` | 归档沉淀出的结论条目（带指针与失效条件） | 单条 ≤200 行 |
| `*.tsv` | 机器索引（全量符号 / 全量类名）——**永不进上下文**，用 `reqboard_kb` 按需检索 | —— |

## 开发

```bash
pnpm install
pnpm build        # 服务端 dist + 客户端 lib（含 wrap 与产物校验门禁）
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
```

### 架构（四层，依赖只许向内）

```
src/
├── domain/        # 纯领域：状态机、门规、提示词片段（禁止 import 外层/node/框架）
├── application/   # 用例：立项/拆分/验收/闸门链
├── adapters/      # 端口实现：JSON 台账、文件文档库、会话探针
├── http/          # 路由薄层（组合根 + 错误→状态码唯一映射点）
├── tools/         # 27 个 Agent 工具定义（清单事实源：tools/registry.ts）
└── client/        # GUI 半：看板视图（自包含，无外部 UI 依赖）
```

层边界由 `tests/layer-boundary.test.ts` 静态扫描强制；宿主单文件 ≤400 行由尺寸门禁强制。

### Client 构建纪律

DSH shell 的 module-loader 种子表只含 react/react-dom/@deepseek-ai/*——
**client 代码引入的任何裸 npm 包都必须打进 bundle**（tsdown `noExternal`），
否则运行时 `require("xxx") missed the module table`，侧栏入口静默消失。
构建产物经 `scripts/verify-client-build.mjs` 校验（含 WRAP_SENTINEL 哨兵：
禁止对 bundle 做逐行字符串变换）。

## License

[MIT](./LICENSE)
