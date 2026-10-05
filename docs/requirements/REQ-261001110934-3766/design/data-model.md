---
req: REQ-261001110934-3766
doc: data-model
serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-9, FR-10
---

# 数据模型 · 索引行、条目字段、页面与机器索引（REQ-261001110934-3766）

> **TL;DR**：知识层是**纯文件**：1 份索引（L0，≤8,000 字符）→ 5 份页面 + N 份条目（L1，每份/每节 ≤200 行）
> → 原文（L2，`docs/requirements/<REQ>/**`）。**台账 schema 零改动**：条目 id 与路径全部由既有归档字段**派生**。
> 四类实体、八条不变量、两条 id 形态（`kb-NNNN` 独立条目 / `kb-<page>-<slug>` 页面小节）。

## 实体总览 `serves: FR-1, FR-2`

| 实体 | 物理位置 | 谁写 | 上限 | 是否进上下文 |
|---|---|---|---|---|
| L0 索引 | `docs/knowledge/INDEX.md` | 归档流程 + `kb-build` | 8,000 字符 / 200 行 | **默认注入**（截断到 3,000 字符） |
| L1 页面（5 份） | `docs/knowledge/{architecture,conventions,tokens,code-map,glossary}.md` | Agent（前两份/glossary）+ `kb-build`（tokens/code-map） | 每份 200 行 | 按需（`reqboard_kb`） |
| L1 条目 | `docs/knowledge/entries/kb-NNNN.md` | Agent（归档时） | 正文 200 行 | 按需（`reqboard_kb id=`） |
| 机器索引 | `docs/knowledge/{code-map.symbols,design-tokens.classes}.tsv` | `kb-build` | 不限 | **永不注入**（只由工具检索） |
| L2 原文 | `docs/requirements/<REQ>/**` | 既有流程 | — | 指针指向，按需展开 |

## 索引行语法（唯一解析口径） `serves: FR-1`

```
- {{id}} · {{kind}} · {{one_liner}} · → {{pointer}}
```

| 段 | 约束 | 例 |
|---|---|---|
| `id` | 见「id 形态」两式 | `kb-0007` / `kb-conventions-c-01`（= `kb-<页面>-<锚点>`，锚点为 `c-01`） |
| `kind` | 8 枚举之一（architecture/standard/tokens/decision/pitfall/contract/map/glossary） | `decision` |
| `one_liner` | 1–140 字符，不含 `·`/换行/`→` | `知识层不做向量检索：<20 万 token 整装更便宜` |
| `pointer` | 工作区相对路径，可选 `#锚点`（**锚点必须等于 id 后缀**） | `entries/kb-0007.md` 或 `conventions.md#c-01` |
| 整行 | **≤200 字符** | — |

**正则（domain 单点，生成器与校验器共用）**：

```regex
^\- (?<id>kb-[0-9]{4}|kb-[a-z-]+-[a-z0-9-]+) · (?<kind>architecture|standard|tokens|decision|pitfall|contract|map|glossary) · (?<one>[^·→\n]{1,140}) · → (?<ptr>[^\s]+)$
```

**分节顺序（固定，缺节即 K2 失败）**：
`## 架构` → `## 规范` → `## 前端令牌` → `## 决策` → `## 坑` → `## 契约` → `## 术语` → `## 代码地图` → `## 待写`。

**机器区标记**：生成器只写 `<!-- kb:generated:begin -->` … `<!-- kb:generated:end -->` 之内（与 `<!-- reqboard:marks:begin -->` 同思路），手写行永不被覆盖。

## id 形态与存储映射 `serves: FR-2, FR-4, FR-8, FR-9, FR-10`

| id 形态 | 正则 | 存储 | 读取方式 |
|---|---|---|---|
| 独立条目 | `^kb-\d{4}$` | `docs/knowledge/entries/<id>.md` | 整文件 |
| 页面小节 | `^kb-(architecture\|conventions\|tokens\|code-map\|glossary)-[a-z0-9-]{2,60}$` | `docs/knowledge/<page>.md#<slug>` | **按 `##`/`###` 标题切出该节**（≤200 行内的子段） |

- `slug` 由标题经 domain 纯函数 `slugify()` 生成（小写、非字母数字转 `-`、去重后缀 `-2`）；
  **写入端与校验端共用同一函数**，避免「锚点对不上」这类静默失败。
- 归档派生条目的编号：取索引里现有 `kb-\d{4}` 最大值 +1（不依赖台账，可重生成）。

## 条目文件字段（YAML front-matter，`yaml` 已在依赖内） `serves: FR-2, FR-3`

```yaml
---
id: kb-0007                       # 必填，形态见上
kind: decision                     # 必填，8 枚举
status: active                     # 必填：active | stale | superseded
title: 知识层不做向量检索            # 必填，≤120 字符
one_liner: <20 万 token 整装更便宜>  # 必填，≤140 字符（与索引行同文）
applies_when: 有人提议引入 embedding/向量库/RAG 时   # 必填：适用条件
pointer: docs/requirements/REQ-261001110934-3766/requirement.md#边界   # 必填：L2 原文（可空串=无原文）
supersedes: kb-0003                # 可选：被本条目取代的旧条目
updated: 2026-10-01                # 必填：最后复核日期
expires: 2027-03-30                # 必填：复核期限（默认 updated+180 天）
req: REQ-261001110934-3766         # 可选：来源需求
---
## 结论      （≤10 行）
## 适用条件  （≤10 行）
## 证据      （命令/路径/数字，≤15 行）
## 失效条件  （什么情况下这条不再成立）
## 相关      （其他 kb-id，不复制正文）
```

**幂等**：同 `id` 重复写 → 条目文件覆盖、索引行**原位替换**（不追加），对齐既有 `reqboard_submit` 幂等语义。

## 页面格式 `serves: FR-8, FR-9, FR-10`

**`conventions.md`（规范，Agent 写、`kb-probe` 校验）**——每条规则一个小节：

```md
### C-01 层边界只许向内 · serves: FR-8
- 一句话：domain 不得 import 外层 / node / 框架。
- 校验：`npx vitest run tests/layer-boundary.test.ts`
- 症状：测试红，并报出跨层 import 的文件与行。
```

- `校验：` 后的反引号内必须是**存在且可跑**的命令或测试路径（K8 检查）；缺失即自检失败。
- 索引里每条规则一行：`- kb-conventions-c-01 · standard · 层边界只许向内 · → conventions.md#c-01`（id 后缀 = 锚点，双射，防漂移）。

**`design-tokens.md`（生成物，`kb-build` 写）**——分三节，各带锚点：

| 节 | 内容 | 规模（2026-10-01 实测） |
|---|---|---|
| `## 颜色 #colors` | 去重后的十六进制颜色 + 出现次数 + 所在分片 | 67 行 |
| `## 变量 #vars` | `--*` CSS 变量名 + 定义分片 | 35 行 |
| `## 断点 #breakpoints` | `@media/@container (max-width: Npx)` | 4 行 |
| `## 类名前缀 #classes` | **按前缀分组计数**（如 `dsh-pm-archive-* → 12 个`），全量清单指向 TSV | 30–60 行 |

**`code-map.md`（生成物）**：模块级（`src/domain` 337KB / `src/application` 920KB / …）+ 角色行 + 导出数 + 指向 `code-map.symbols.tsv`。

**`code-map.symbols.tsv`**：`file<TAB>symbol<TAB>kind<TAB>signature`（1,665 行，≈84K 字符）——**机器索引，永不注入**。

## 不变量（`kb-probe` 逐条检查） `serves: FR-7`

| # | 不变量 | 违反后果 |
|---|---|---|
| I-1 | `id` 全局唯一，匹配两式之一 | K2 失败 |
| I-2 | 每行匹配行语法、整行 ≤200 字符 | K2 失败 |
| I-3 | 索引 ≤8,000 字符 且 ≤200 行；分节齐全且顺序固定 | K1/K2 失败 |
| I-4 | 每份 L1 页 ≤200 行 | K3 失败 |
| I-5 | 每条索引行的 `id` 可解析到实体（文件存在 / 锚点在页面里找得到） | K4 失败 |
| I-6 | `entries/` 与索引**一一对应**（无孤儿、无悬空） | K5 失败 |
| I-7 | `status=superseded` 的条目**不出现在索引**（文件保留供追溯） | K5 失败 |
| I-8 | 生成区之外的行不得被脚本改写；生成物重跑 diff 必须为空 | K7 失败 |

## 与台账的关系（零 schema 改动） `serves: FR-3`

```
RequirementRecord.archive { dir, docs, mergedInto, indexEntry, manualUpdates, manualNote }
        │ 派生（只读，不新增字段）
        ▼
KbEntryDraft { id(新分配), kind(按归档材料推断：有 retro→pitfall 草案；否则 decision),
               title(取需求标题), one_liner(= archive.indexEntry),
               pointer(= archive.mergedInto[0] ?? requirement.md),
               req, updated(= 归档日期), expires(= updated+180d) }
```

- `merged_into` 的取值域（`docs/adr|architecture|guides|rfcs|work-logs|strategy-research`）**不变**，另作条目 `pointer` 使用。
- 归档材料校验（`index_entry` 非空等）**沿用既有代码**，本需求不新增拒绝点。

## 迁移与回填 `serves: FR-3, FR-7`

| 场景 | 做法 |
|---|---|
| 首次启用 | `npx tsx scripts/kb-build.mts --write` 生成 4 份生成物 + 索引骨架；Agent 补 `architecture.md` / `conventions.md` / `glossary.md` |
| 历史回填（可选） | `kb-build --backfill`：扫 `docs/requirements/*/verification.md` 已有 `indexEntry` → 生成 `entries/kb-NNNN.md`；**有 retro 的按 `kind=pitfall` 且 `status=stale`**（待人复核后置 active） |
| 老条目失效 | 条目 `expires` 到期 → `kb-probe` 标 `status=stale` 并降权（索引里保留但排在分节末尾？**不**——索引只列 active，stale 只留文件，由 K6 报告提示复核） |
| 回滚 | 删除 `docs/knowledge/` 即回到旧行为；`entries/` 若要保留可只删索引与生成物（索引可重建） |
