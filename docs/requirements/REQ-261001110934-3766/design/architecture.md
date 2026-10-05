---
req: REQ-261001110934-3766
doc: architecture
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10
---

# 架构设计 · 项目知识层（REQ-261001110934-3766）

> **TL;DR**：新增一个**本地文件形态的知识层**——`docs/knowledge/` 下 5 份人读页面 + 2 份机器索引，
> 由 `scripts/kb-build.mts` **确定性生成**（代码地图、设计令牌）、由 `reqboard_submit(kind=archive)` **强制写入**（决策/坑）、
> 由 `scripts/kb-probe.mts` **自检**（预算/死链/孤儿/stale/漂移）、由 `reqboard_kb` 工具与节点输入包**按预算读取**。
> 不引入新运行时依赖、不动台账 schema、不改既有状态机；**没有 `docs/knowledge/` 的仓库行为逐字节不变**。

## 目标与总体方案 `serves: FR-1, FR-5, FR-6`

**问题**：Agent 认识项目只能整份读（源码 199.7 万字符 / 文档 45.4 万字符 / 测试 186.4 万字符），
且归档结论**没有读取者**（`templates/archived/index.md` 是死模板）。

**方案**：把「知识」做成**两层存储 + 三条通道**。

```
                  ┌─────────────── 读取通道（默认只读 L0） ───────────────┐
   会话/新窗口 ──注入(≤3,000 字符)──▶ L0 INDEX.md(≤8,000 字符/≤200 行)
                                          │ 指针（id / 路径 / 符号）
   agent ──reqboard_kb(id|kind|query)────▶├──▶ L1 页面：architecture / conventions / tokens / code-map
                                          └──▶ L1 条目：entries/<kb-id>.md
                                                     │ pointer
                                                     ▼
                                          L2 原文：docs/requirements/<REQ>/**（按需展开）

                  ┌─────────────── 写入通道（谁写是硬约定） ───────────────┐
   reqboard_submit(kind=archive) ──▶ DepositKnowledge ──▶ entries/<kb-id>.md + INDEX 行
   scripts/kb-build.mts ──生成──▶ code-map.md(+symbols.tsv) · design-tokens.md(+classes.tsv)
   scripts/kb-probe.mts ──自检──▶ 预算/解析/死链/孤儿/stale/漂移/校验命令存在
```

**三条不变量**：

- **只加载目录**：默认进上下文的只有 L0；L1/L2 一律经工具或显式读取（对齐「目录常驻、正文懒加载」）。
- **预算兜底**：L0 ≤8,000 字符、任一 L1 页 ≤200 行、工具单次返回 ≤`budgetChars`；超限**响亮失败**，不静默截断。
- **生成物 vs 手写物分离**：`code-map*` / `design-tokens*` 是生成物（可重跑、diff 必须为空）；
  `entries/*` 是人/Agent 写的真源（生成脚本**不得**触碰）。

## 分层落点与依赖方向 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8, FR-9, FR-10`

| 层 | 新增文件 | 职责 | 依赖 |
|---|---|---|---|
| domain（纯） | `src/domain/knowledge/{types,index-line,entry,budget}.ts` | 索引行**解析/渲染**、条目字段校验、预算常量、`kind` 枚举 | 零 import 外层（层边界门禁） |
| application | `src/application/use-cases/{QueryKnowledge,DepositKnowledge}.ts`、`internal/knowledge-inject.ts` | 检索与沉淀两个用例；注入片段拼装 | 依赖 domain + ports |
| adapters | `src/adapters/KnowledgeRepository.ts` | 读写 `docs/knowledge/*`，**经 `DocRepository` 端口**（不直接碰 fs） | 实现 new port |
| tools | `src/tools/KnowledgeTool/{KnowledgeTool,prompt}.ts` + `src/tools/index.ts` 注册 | `reqboard_kb` 工具壳（schema 短、描述稳定） | 依赖 application |
| http | `src/http/routers/knowledge.ts` | `GET /kb`（看板页数据源） | 依赖 application |
| client | `src/client/views/knowledge.ts` + 入口挂载 | 看板「知识库」只读页（复用 `open-doc`） | 依赖 http |
| scripts | `scripts/kb-build.mts`、`scripts/kb-probe.mts` | 生成（`--check` 门禁模式）与自检（非零退出） | 只 import `src/domain/knowledge/*`（复用同一套行语法，不复制解析器） |

**依赖方向**：`tools/http/client → application → domain`；`adapters` 实现 `application/ports.ts` 中的 `KnowledgePort`。
**禁止**：domain 引 node/fs/框架（现有 `tests/layer-boundary.test.ts` 自动拦）；scripts 反向 import application/client。

**宿主单文件 ≤400 行**：`KnowledgeRepository` / `QueryKnowledge` / 生成脚本各自拆到 ≤400 行；生成脚本按「发现器 / 抽取器 / 渲染器」拆三段函数。

## 关键机制 1 · 入口与入口的预算 `serves: FR-1, FR-8, FR-9, FR-10`

| 页面 | 内容 | 上限 | 来源 |
|---|---|---|---|
| `INDEX.md` | H1 + 一句话摘要 + 分节条目行 + 「待写」节 | **8,000 字符 / 200 行** | 归档流程写条目行 + 生成脚本写「代码地图/令牌」两节 |
| `architecture.md` | 分层图 + 各层职责 + 依赖方向 + 扩展点（加工具/适配器/视图的落点） | 200 行 | Agent 汇总（README + design 文档） |
| `conventions.md` | 每条 `C-NN · 一句话 · 校验：<命令或测试路径>` | 200 行 | Agent + `kb-probe` 反查（命令必须存在） |
| `design-tokens.md` | 颜色 67 / CSS 变量 35 / 断点 4 / 类名前缀分组 | 200 行 | 生成脚本（确定性） |
| `code-map.md` | 模块职责 + 关键文件 + 导出数（**模块级**，不是逐符号） | 200 行 | 生成脚本（确定性） |
| `code-map.symbols.tsv` | 全量符号：`file\tsymbol\tsignature`（1,665 行 ≈84K 字符） | **不进上下文** | 生成脚本；由 `reqboard_kb(kind=map, query=<符号>)` 检索 |
| `design-tokens.classes.tsv` | 545 个 `dsh-pm-*` 类名全量 | **不进上下文** | 同上，按 `query` 检索 |

**为什么分「页面 + TSV」**：页面是给人/Agent 的**入口**（有预算），TSV 是**索引**（无限但不能进上下文）。
Aider 的做法同构：1k token 的 map 进上下文，细节靠按需读文件。

## 关键机制 2 · 写入闭环 `serves: FR-2, FR-3`

```
reqboard_submit(kind=archive)
        │ 已有：校验 merged_into / index_entry / docs 清单
        ▼
DepositKnowledge（同一用例内，紧随归档记录写入）
        ├─ 1) 生成 kb-id（kb-NNNN，全局递增，从 INDEX 现有最大号 +1）
        ├─ 2) 写 entries/<kb-id>.md（头部字段来自 index_entry / merged_into / retro）
        ├─ 3) 在 INDEX.md 对应分节追加一行
        └─ 4) 失败即**抛错**并留痕（不静默：归档已写台账，但索引缺失会被 kb-probe 报死链）
```

- `index_entry` 缺失：**沿用既有代码级拒绝**（`SubmitArchive` 已校验非空），不新增拒绝点。
- 复盘（`retro.md`）中的「被证伪的假设 / 踩到的坑」→ `kind=pitfall` 条目（Agent 在归档时补写，`kb-probe` 检查「有 retro 无 pitfall 条目」时给出**警告**而非失败）。
- 条目**只链接原文、不复制正文**：`pointer` 指向 `docs/requirements/<REQ>/...`（对齐「同一事实只存一处」）。

## 关键机制 3 · 读取与注入（灰度可回滚） `serves: FR-5, FR-6`

| 开关（plugin config） | 默认 | 作用 |
|---|---|---|
| `knowledge.enabled` | `true` | 总开关：关掉后工具返回空、页面隐藏、注入不加节 |
| `knowledge.injectIndex` | `true` | 是否在节点输入包追加 `## 项目知识（索引截断 + 指针）` |
| `knowledge.trimRequirementDoc` | **`false`** | 是否把 `## 需求文档` 从**全文**改为「TL;DR + 指针」（**灰度二阶段再开**） |
| `knowledge.injectBudgetChars` | `3000` | 索引注入片段的字符预算 |

**逐字节兼容规则（A7）**：仓库内**不存在** `docs/knowledge/INDEX.md` 时，
节点输入包输出与改动前**逐字节相同**（不追加任何节）；`trimRequirementDoc=false` 时需求文档节保持全文。

**缓存友好（成本杠杆）**：索引片段在输入包中的**位置固定**、内容**只在归档时变化**；
`reqboard_kb` 的 `description` 写死不再改（避免工具定义变更导致前缀缓存整体失效）。

## 迁移、兼容与回滚 `serves: FR-6, FR-7`

| 项 | 结论 |
|---|---|
| 数据迁移 | **无**：`docs/knowledge/` 全是新增文件；首次启用由 `kb-build.mts` 生成 + Agent 补 `architecture/conventions` 两页 |
| 台账兼容 | **不改字段**：`kb-id` 与条目路径由归档记录**派生**，不写入台账 schema |
| 老需求兼容 | 无 `docs/knowledge/` → 注入与交互逐字节不变（golden 用例锁死） |
| 灰度 | 先开 `injectIndex`（只加索引节）→ 观察 → 再开 `trimRequirementDoc`（省文档 token） |
| 回滚 | ① 关 `knowledge.enabled`（一键停用）；② 还原 3 处补丁（`tools/index.ts` 注册、`node-input-package.ts`、`SubmitArchive` 调用）；③ `entries/` 与两页手写内容**保留在仓库**，可原地重建索引 |
| 生成物回滚 | `code-map*` / `design-tokens*` 重跑即恢复；`--check` 模式用于 CI 防漂移 |

## 风险与对策 `serves: FR-1, FR-7`

| 风险 | 症状 | 对策 |
|---|---|---|
| 知识层自身膨胀 | 索引越过 8K、页面越写越长 | 预算硬门禁（`kb-probe` 非零退出）+ `status: stale` + 「待写」节显式化缺口 |
| 生成物漂移 | 有人手改了 `design-tokens.md` | `--check` 重跑 diff，非空即失败 |
| 索引与实际不符 | 条目指向的文件被删/改名 | 死链检查（指针存在性）+ `updated` 超期标 stale |
| 注入反而变贵 | 索引太大或每次都在变 | 预算 3,000 字符 + 位置固定 + 只在归档时变更 |
| 规范条目沦为空话 | 写了「要注意分层」但没挂命令 | `kb-probe` 强制每条规范挂**存在且可跑**的校验路径 |
