---
req: REQ-261001143526-8475
doc: data-model
serves: FR-1, FR-2, FR-3, FR-4, FR-6, FR-7
---

# 数据模型 · 规范条目、覆盖清单与索引行（REQ-261001143526-8475）

> **TL;DR**：**零 schema 变更**。新增的只有两处**文件形态**数据：规范页的 `## 工程操作` 节（人读）
> 与 `docs/knowledge/operations.tsv`（机器读的覆盖清单，生成物）。索引行沿用上一需求的行语法。

## 实体总览 `serves: FR-1, FR-2`

| 实体 | 物理位置 | 谁写 | 预算/约束 | 进上下文 |
|---|---|---|---|---|
| 工程操作条目 | `docs/knowledge/conventions.md` 的 `## 工程操作` 节，`### C-NN … #c-nn` | `kb-conventions-sync --write` 生成骨架 + Agent 补全 | 每条 ≥5 行；页面 ≤200 行 | 按需（`reqboard_kb`） |
| 覆盖清单 | `docs/knowledge/operations.tsv` | `kb-conventions-sync`（生成物） | 行数 = 必跑项数；不进上下文 | 永不 |
| 索引行 | `docs/knowledge/INDEX.md` 的 `## 规范` 节 | 同步脚本追加 / Agent 补 | 沿用既有行语法（≤200 字符/行） | 默认注入（截断） |
| 提示词片段 | `src/domain/prompt/fragments/**`（4 处） | Agent（本需求实施时） | 合计 ≤900 字符；受 `DEFAULT_PROMPT_BUDGET` 约束 | 每次注入 |

## 规范条目字段（四要素，K10 逐条校验） `serves: FR-1, FR-2`

| 字段行 | 类型 | 必填 | 取值域 / 约束 |
|---|---|---|---|
| `### C-NN 标题 #c-nn` | 标题 | 是 | `NN` 两位数字且全局唯一；`#c-nn` 锚点 = id 后缀（沿用 id↔锚点双射口径） |
| `- 时机：` | 枚举 | 是 | `开工前` / `改动后` / `提交前` / `发版前` |
| `- 命令：` | 命令 | 是 | 反引号内；`npx / pnpm / node / python3 / tsx` 起头；含路径时该路径必须存在（K8 同口径） |
| `- 期望：` | 文本 | 是 | 1–200 字符，含可对照锚点（`OK` / `退出码 0` / 具体文案） |
| `- 失败怎么办：` | 文本 | 是 | 非空；至少含一个 `C-NN` 或一个文件路径 |

**时机映射（同步脚本用；写死在脚本内的映射表，避免"猜"）**：

| 触发面 | 命令 | 时机 |
|---|---|---|
| 改 `src/**`（非 client） | `pnpm typecheck` | 改动后 |
| 改 `src/client/**` | `pnpm build:client` | 改动后 |
| 只校验客户端产物 | `pnpm verify:client` | 改动后 |
| 改提示词片段 `fragments/**` | `node scripts/inline-prompt-fragments.mjs` + `node scripts/check-prompt-fragments.mjs` | 改动后 |
| 改知识层内容/样式 | `pnpm run kb:build` → `pnpm run kb:check` | 改动后 |
| 提交前 | `pnpm test` | 提交前 |
| 发版前 | `pnpm build` + `pnpm typecheck` | 发版前 |
| 同步镜像仓库 | `bash scripts/sync-to-github.sh` | 发版前 |

## 覆盖清单 `operations.tsv`（生成物） `serves: FR-3, FR-4`

```tsv
command	trigger	entry_id	source
pnpm typecheck	改动后	kb-conventions-c-11	package.json:scripts
pnpm build:client	改动后	kb-conventions-c-12	package.json:scripts
...
```

| 列 | 类型 | 约束 |
|---|---|---|
| `command` | string | 覆盖清单里的原样命令（与规范条目 `命令：` 对齐的键） |
| `trigger` | enum | 同四要素的时机枚举 |
| `entry_id` | string \| `(缺)` | `(缺)` 表示尚未进规范页 → K10 红 |
| `source` | enum | `package.json:scripts` / `EXTRA_ENTRIES` |

**数据源**（`kb-conventions-sync.mts` 内三张表，均可人工审阅）：

| 表 | 内容 | 规则 |
|---|---|---|
| `SCRIPTS` | `package.json` 的 `scripts` 全量自动读入 | 每个 script 默认都是必跑项 |
| `EXTRA_ENTRIES` | `scripts/` 目录里必须进规范页的入口（如 `inline-prompt-fragments.mjs`、四个探针、`verify-client-build.mjs`） | 显式白名单，加一条要写理由 |
| `EXCLUDED` | 一次性/调试类（`migrate-ledger.ts`、`normalize-*.ts`、`fix-missing-rtm.ts`、`clean-test-cache.sh`） | **每条必须带非空理由**；空理由 → 脚本抛错 |

## 索引行与检索 `serves: FR-6`

| 项 | 契约 |
|---|---|
| 行语法 | 沿用 `- {{id}} · {{kind}} · {{一句话}} · → {{指针}}`（`kind=standard`） |
| id | `kb-conventions-c-NN`；指针 `conventions.md#c-nn`（超预算拆页后为 `operations.md#c-nn`） |
| 一句话 | ≤140 字符、不含 `·`/`→`（沿用既有校验） |
| 一致性 | 每个 `C-NN` 条目必须在索引中有且仅有一行（K5 + K10 双查） |

## 预算与拆页判据 `serves: FR-6, FR-7`

| 判据 | 阈值 | 超限动作 |
|---|---|---|
| 规范页行数 | >180 行（预警） / >200 行（K3 红） | 把 `## 工程操作` 节整体拆到 `docs/knowledge/operations.md`；索引行指针改指新页；`KB_PAGE_PATHS` 增加一项 |
| 索引字符/行数 | >7,200 字符（预警） / >8,000 字符或 >200 行（K1 红） | 新条目的「一句话」压缩到 ≤60 字符，不新增分节 |
| 提示词新增字符 | >900 字符 | 压缩为一句，或只在 `common/iron-rules.md` 保留总纲 |

**当前实测基线**：`conventions.md` = 77 行；预计新增 8 条 × 5 行 ≈ 40 行 → 约 117 行，**不触发拆页**。
（拆页判据仍写进设计，供后续增长时照办。）

## 不变量 `serves: FR-1, FR-4, FR-7`

| # | 不变量 | 违反后果 |
|---|---|---|
| I-1 | 每个必跑项在规范页**恰好一条**条目（不重不漏） | K10 红 |
| I-2 | 每条条目四要素齐全且合法 | K10 红 |
| I-3 | 条目 id 与锚点双射、全局唯一 | K2 红 |
| I-4 | 每个条目在索引中有且仅有一行 | K5 红 |
| I-5 | `operations.tsv` 与当次扫描一致（生成物不可手改） | K10 判据 3 红 |
| I-6 | 既有 `C-01…C-10` 的 id 与判据不变 | 回归断言红 |

## 迁移与回滚 `serves: FR-7`

| 场景 | 做法 |
|---|---|
| 首次启用 | 跑 `kb-conventions-sync --write` 生成 8 条骨架 → Agent 补「失败怎么办」与索引行 → K10 转绿 |
| 新增脚本 | 下次跑 `--check` 即报缺口（无需人记）；补条目后转绿 |
| 拆页迁移 | 建 `operations.md`，把 `## 工程操作` 节整体搬过去，索引行指针批量改指；`KB_PAGE_PATHS` 增加 `operations`；跑 `kb:check` 验证 |
| 回滚 | 删除 `## 工程操作` 节 + `operations.tsv` + 两个脚本改动 + 4 处提示词句子；既有 10 条与全部流程不受影响 |
