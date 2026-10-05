# REQ-261001110934-3766 拆分计划 · 项目知识层（索引 + 条目 + 生成物 + 工具 + 自检）

> 目标 + 做法：把设计文档（architecture / interfaces / data-model / use-cases / test-cases）落成**可跑的知识层**——
> `docs/knowledge/` 落盘、`kb-build` 确定性生成、归档时强制沉淀、`reqboard_kb` 按预算读取、
> `kb-probe` 九项自检。**不引入新运行时依赖、台账 schema 零改动**；无 `docs/knowledge/` 时老行为逐字节不变。

## 改动盘点

```
新增（14 个文件 + 1 个目录树）                         修改（5 个文件，均为「接线」）
├─ src/domain/knowledge/{types,index-line,slug,entry,budget}.ts   ├─ src/application/ports.ts   (+KnowledgePort)
├─ src/application/use-cases/{QueryKnowledge,DepositKnowledge}.ts ├─ src/application/use-cases/SubmitArchive.ts (+沉淀调用)
├─ src/application/internal/{knowledge-budget,knowledge-inject,knowledge-id}.ts
│                                                                 ├─ src/application/internal/node-input-package.ts (+索引节)
├─ src/adapters/KnowledgeRepository.ts                            ├─ src/tools/index.ts         (+注册第 21 个工具)
├─ src/tools/KnowledgeTool/{KnowledgeTool,prompt}.ts              └─ src/plugin-config.ts       (+knowledge 配置面)
├─ src/http/routers/knowledge.ts
├─ src/client/views/knowledge.ts
├─ scripts/{kb-build,kb-probe,kb-coldstart-probe}.mts
├─ docs/knowledge/{INDEX,architecture,conventions,glossary}.md（首版内容）
└─ tests/kb-*.test.ts（6 份）

不改：台账 schema / 既有 20 个工具签名 / 既有路由 / 五道人工门 / 状态机 / rtm-*.yml
生成物（进版本控制、可重跑、diff 必须为空）：docs/knowledge/{code-map,design-tokens}.md、{code-map.symbols,design-tokens.classes}.tsv
```

## 分层与依赖方向

```
tools/http/client ─┐
                   ├─▶ application ─▶ domain（纯）
adapters ──────────┘        ▲
scripts/kb-*.mts ───────────┘（只 import domain 的语法与预算单点）
```

## 条款覆盖对照表

| 需求条款 | 接收任务 | 覆盖说明 |
|---|---|---|
| FR-1 | t1、t3、t8、t10 | 语法与预算单点、生成区、注入、首版索引内容 |
| FR-2 | t1、t2、t7、t10 | 条目形态与校验、读写实现、归档写入闭环、术语页 |
| FR-3 | t7、t11 | 归档接线沉淀、历史回填 |
| FR-4 | t3、t9、t10 | 生成器、K9 覆盖检查、索引挂载 |
| FR-5 | t4、t5 | 工具与检索用例、HTTP 同构接口 |
| FR-6 | t1、t8、t10 | 预算判定、注入与灰度、索引内容 |
| FR-7 | t3、t9、t12 | --check 漂移门禁、九项自检、门禁接入 |
| FR-8 | t9、t10 | 页面行数/死链检查、架构页内容 |
| FR-9 | t9、t10、t12 | K8 校验目标存在、规范页内容、文档挂载 |
| FR-10 | t3、t6、t9 | 抽取生成、页面消费、漂移检查 |

**本轮不做**：无（十条 FR 全部有接收任务）。

## 任务表

| key | 卡 | 层/端 | 依赖 | 关键验收（可跑） |
|---|---|---|---|---|
| t1 | 知识层领域模型与语法 | domain / backend | — | `npx vitest run tests/kb-domain.test.ts` |
| t2 | KnowledgePort 与文件实现 | adapters / backend | t1 | `npx vitest run tests/kb-repository.test.ts` |
| t3 | 生成器 kb-build（地图 + 令牌） | scripts / backend | t1 | `npx tsx scripts/kb-build.mts --check` |
| t4 | reqboard_kb 工具与检索用例 | tools+application / backend | t2 | `npx vitest run tests/kb-tool-budget.test.ts` |
| t5 | HTTP 路由 GET /kb | http / backend | t4 | `curl` 请求样例 + 400 分支 |
| t6 | 看板「知识库」只读页 | client / frontend | t5 | 真实 GUI 截图 + `pnpm build:client` |
| t7 | 归档即沉淀（条目 + 索引行） | application / backend | t1, t2 | `npx vitest run tests/kb-archive-deposit.test.ts` |
| t8 | 注入侧接入与灰度兼容 | application / backend | t2 | `npx vitest run tests/kb-inject-compat.test.ts` |
| t9 | 自检 kb-probe（K1–K9） | scripts / backend | t1, t2, t3 | 五类故障注入各非零退出 |
| t10 | 索引/架构/规范/术语首版内容 | doc / doc | t3 | `npx tsx scripts/kb-probe.mts` 退出码 0 |
| t11 | 历史回填与老需求回归 | application / backend | t7, t8 | `pnpm test` 全绿 + `--backfill` 幂等 |
| t12 | 门禁接入与文档挂载 | doc / doc | t9, t10 | `pnpm run kb:check` + 工具表更新为 21 |

## 逐卡实施与验收

### t1 · 知识层领域模型与语法（纯函数）

- **implementation**：新建 `src/domain/knowledge/{types,index-line,slug,entry,budget}.ts`：
  8 类 `kind` 枚举；两种 `id` 形态判定；索引行 `parseIndexLine/renderIndexLine`（正则与转义口径见 design/data-model）；
  `slugify()` 与 `sliceSection(md, anchor)`（按 `##`/`###` 切节）；预算常量（`INDEX_MAX_CHARS=8000`、
  `INDEX_MAX_LINES=200`、`PAGE_MAX_LINES=200`、`ONE_LINER_MAX=140`、`KB_QUERY_DEFAULT_BUDGET=1500`、
  `KB_QUERY_MAX_BUDGET=8000`、`KB_LIMIT_MAX=20`）与结构化溢出 `KbOverflow`。零 import 外层。
- **acceptance**：`npx vitest run tests/kb-domain.test.ts` 全绿，且失败分支覆盖：非法行**带行号报错**、
  8,001 字符 / 201 行 → 返回 `KbOverflow`（不静默裁剪）、`kb-x`/`kb-7` 判非法；
  `npx vitest run tests/layer-boundary.test.ts` 仍绿。
- **skipIntegration**：是（纯函数，无接口可联调）。

### t2 · KnowledgePort 与文件实现

- **implementation**：`src/application/ports.ts` 追加 `KnowledgePort`（含 `KnowledgePort` 与 `DocRepository` 的组合），
  `src/adapters/KnowledgeRepository.ts` 实现 `indexExists/readIndex/readEntries/readEntry/appendEntry/listArtifacts`，
  全部经 `DocRepository`（不直接 `node:fs`）；`appendEntry` 幂等（同 id 覆盖条目、索引行原位替换）。
- **acceptance**：`npx vitest run tests/kb-repository.test.ts` 全绿，含：`readEntry('kb-conventions-c-01')` 只返回该节、
  `readEntry('kb-0001')` 返回整文件、`appendEntry` 调两次后索引行数与内容不变。

### t3 · 生成器 kb-build（代码地图 + 设计令牌）

- **implementation**：`scripts/kb-build.mts`（`npx tsx` 运行）：扫 `src/**/*.ts` 产出 `code-map.md`（模块级，≤200 行）
  与 `code-map.symbols.tsv`（`file\tsymbol\tkind\tsignature`）；扫 `src/client/styles*.ts` 产出 `design-tokens.md`
  （颜色/变量/断点/类名前缀分组，各带锚点）与 `design-tokens.classes.tsv`；
  只写 INDEX 的 `<!-- kb:generated:begin/end -->` 区；`--write` / `--check` 两种模式。
  语法与预算判定**复用 t1 的 domain 单点**，不另写解析器。
- **acceptance**：`npx tsx scripts/kb-build.mts --write` 连跑两次，第二次无文件差异；
  `code-map.symbols.tsv` 行数与 `python3 docs/requirements/REQ-261001110934-3766/evidence/volume-probe.py`
  打印的骨架条数（1,665）一致；手改 `design-tokens.md` 一行后 `--check` 非零退出并打印漂移文件与首个差异行。

### t4 · reqboard_kb 工具与检索用例

- **implementation**：`src/application/use-cases/QueryKnowledge.ts` + `internal/knowledge-budget.ts`（预算裁剪：
  预算不足**只回指针**，不返回碎片）；`src/tools/KnowledgeTool/`（schema 与 design/interfaces 一致，description 写死短文案）；
  `src/tools/index.ts` 注册。只读，不加 `assertNoPendingConfirm`。
- **acceptance**：`npx vitest run tests/kb-tool-budget.test.ts`：`budgetChars=300` → `truncated=true` 且 items 仅含
  `title/oneLiner/pointer`；`budgetChars=1500` → 返回总字符 ≤1500；三选择器全空 → `REQBOARD_INVALID_INPUT`；
  `limit=999` → 拒绝；既有 20 个工具的 schema 快照不变。

### t5 · HTTP 路由 GET /kb

- **implementation**：`src/http/routers/knowledge.ts` + 组合根注册；参数 `query/kind/id/limit/budget_chars`；
  返回与工具同构 JSON + `pages[]`（4 份页面路径与行数）；非法参数 400 + `REQBOARD_INVALID_INPUT`。
- **acceptance**：`curl -s 'http://127.0.0.1:<port>/dashboard/api/reqboard/kb?kind=decision&limit=3'` 返回 200 且
  `items.length ≤ 3`；`?budget_chars=0` 返回 400；既有路由抽样请求（`/reqboard/status`）响应体不变。

### t6 · 看板「知识库」只读页

- **implementation**：`src/client/views/knowledge.ts` + 入口挂载（沿用既有 view 挂载方式与样式分片归属契约），
  8 个分节渲染索引行，点击条目调用既有 `open-doc` 打开文件。
- **acceptance**：`pnpm build:client` 通过（含 `verify-client-build.mjs` 归属章与分片校验）；
  真实 GUI 里打开知识库页截图，8 个分节在场且 `.dsh-pm-` 样式生效（提供截图路径作为证据）。

### t7 · 归档即沉淀（写入闭环）

- **implementation**：`src/application/use-cases/DepositKnowledge.ts`（分配 `kb-NNNN`、写条目、追加索引行、失败抛错）
  + `internal/knowledge-id.ts`（编号分配，从索引最大值 +1）；在 `SubmitArchive.ts` 归档记录写入后调用。
- **acceptance**：`npx vitest run tests/kb-archive-deposit.test.ts`：归档后索引对应分节 +1 行且 `entries/kb-NNNN.md` 存在、
  front-matter 字段齐全；重复提交幂等；`index_entry=''` → 既有拒绝且 `docs/knowledge/` 零变化。

### t8 · 注入侧接入与灰度兼容

- **implementation**：`src/plugin-config.ts` 增 `knowledge.{enabled,injectIndex,trimRequirementDoc,injectBudgetChars}`；
  `internal/knowledge-inject.ts` 拼装索引节（≤`injectBudgetChars`，超限响亮标注）；
  `node-input-package.ts` 接线：**仅当 `docs/knowledge/INDEX.md` 存在**时追加；`trimRequirementDoc=true` 时把
  `## 需求文档` 改为「TL;DR + 指针」。
- **acceptance**：`npx vitest run tests/kb-inject-compat.test.ts`：无 `docs/knowledge/` → 输出**逐字节**等于改动前快照（golden）；
  有索引 + `trimRequirementDoc=false` → 仅在既有文本后追加索引节，需求文档节仍为全文；
  `true` → 需求文档节被替换且带 `truncated` 标注与指针路径；索引节超预算时打印结构化超限而非静默截断。

### t9 · 自检 kb-probe（K1–K9）

- **implementation**：`scripts/kb-probe.mts`（`npx tsx` 运行，`--json` 可选）：K1 索引预算、K2 行语法与分节顺序、
  K3 页面行数、K4 死链（含锚点）、K5 孤儿、K6 stale、K7 生成物漂移（内部调 `kb-build --check`）、
  K8 规范 `校验：` 目标存在、K9 符号表覆盖。任一失败 → 退出码 1 + 人读一行 + 结构化明细。
- **acceptance**：五类故障各注入一次（非法行 / 死链 / 孤儿 / stale / 规范命令缺失）→ 每种都非零退出并指出
  `id` 或行号；未注入故障的干净仓库退出码 0；`--json` 输出可被 `python3 -c 'import json,sys;json.load(sys.stdin)'` 解析。

### t10 · 索引 / 架构 / 规范 / 术语首版内容

- **implementation**：`docs/knowledge/{INDEX,architecture,conventions,glossary}.md`：
  架构页含四层图与依赖方向、扩展点；规范页每条 = 一句话 + `校验：` 命令（层边界、单文件 ≤400 行、客户端构建纪律、
  样式归属、注入预算 floor、失败要响亮、产物闸门）；索引含 8 个固定分节与生成区。
- **acceptance**：`npx tsx scripts/kb-probe.mts` 退出码 0（索引 ≤8,000 字符/≤200 行、四份页面 ≤200 行、规范 100% 挂可跑校验）；
  `npx tsx scripts/kb-coldstart-probe.mts` 输出问答包评分 ≥4/5（A3）。

### t11 · 历史回填与老需求回归

- **implementation**：`kb-build --backfill`：扫 `docs/requirements/*/verification.md` 与归档材料，为已有 `indexEntry`
  的历史需求生成条目（有 `retro` 的按 `kind=pitfall` 且 `status=stale` 待复核）；幂等（已存在条目不覆盖）。
- **acceptance**：`--backfill` 连跑两次第二次零写入；回填后 `kb-probe` 仍绿；`pnpm test` 全量通过（无既有回归）。

### t12 · 门禁接入与文档挂载

- **implementation**：`package.json` 增 `kb:build` / `kb:check` / `kb:probe` 三个 script；
  `README.md` 工具表更新为 21 个工具并新增「项目知识库」一节；
  `docs/architecture/project-manual.md` 挂载知识层说明（新增领域篇或挂目录入口）。
- **acceptance**：`pnpm run kb:check` 退出码 0；`grep -c 'reqboard_kb' README.md` ≥1 且工具表计数为 21；
  `docs/architecture/project-manual.md` 的索引表里出现知识层条目。
- **skipIntegration**：是（纯文档与脚本接线，无接口可联调）。

## 风险与对策

| 风险 | 触发信号 | 对策 |
|---|---|---|
| 注入改造破坏老行为 | golden 快照红 | t8 的逐字节用例是硬门；`knowledge.enabled=false` 一键停 |
| 生成物与源码漂移 | `kb-build --check` 非零 | 进 CI；禁止手改生成物（K7） |
| 知识层自身膨胀 | K1/K3 非零 | 预算硬门禁 + 「待写」节显式化 |
| 规范条目成空话 | K8 非零 | 每条规范必须挂存在的校验目标 |
| 编号冲突（并发归档） | 两个 kb-NNNN 相同 | 编号分配在单进程写路径内完成 + K2 唯一性检查 |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 交棒；未获批准不得落库。
