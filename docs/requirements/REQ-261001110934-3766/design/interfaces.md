---
req: REQ-261001110934-3766
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10
---

# 接口设计 · reqboard_kb / HTTP / 端口 / 生成与自检 CLI（REQ-261001110934-3766）

> **TL;DR**：对外只新增 **1 个 Agent 工具**（`reqboard_kb`）与 **1 条只读 HTTP 路由**（`GET /kb`）；
> 对内新增 **1 个端口**（`KnowledgePort`）与 **2 个 CLI**（`kb-build.mts` 生成、`kb-probe.mts` 自检）。
> 台账 schema、既有 20 个工具签名、既有路由**一律不动**；错误码走既有 `REQBOARD_*` 家族。

## Agent 工具 `reqboard_kb` `serves: FR-5`

```ts
reqboard_kb({
  query?:       string   // 关键词/问题片段（大小写不敏感子串匹配，中文按字面）
  id?:          string   // 精确取条目，形如 kb-0007
  kind?:        'architecture'|'standard'|'tokens'|'decision'|'pitfall'|'contract'|'map'|'glossary'
  limit?:       number   // 默认 5，上限 20（LIMITS 内新增 kbLimitMax）
  budgetChars?: number   // 默认 1500，上限 8000
}): Promise<{
  items: Array<{
    id: string            // kb-0007（条目）或 kb-<页面>-<锚点>（页面小节，如 kb-architecture-layers）
    kind: KbKind
    title: string         // ≤120 字符
    oneLiner: string      // ≤140 字符（索引行原文）
    pointer: string       // 工作区相对路径（页面/条目/原文三选一）
    updatedAt: string     // ISO 日期
    truncated?: boolean   // 该条目正文因预算被截断
  }>
  total: number           // 命中总数（>items.length 表示被 limit 截断）
  truncated: boolean      // 因预算整体截断（此时 items 只回指针，不回正文）
  budgetChars: number     // 本次生效预算（回显）
  hint?: string           // 截断/无命中时的下一步指令（如「用 id=kb-0007 精确取」）
}>
```

**语义细则**：

- **至少给一个** `id` / `kind` / `query`；三者都给时取交集。
- `budgetChars` 不足 → **不截断正文**，改为只回 `title/oneLiner/pointer` 并置 `truncated=true`（指针优于碎片）。
- 无命中：`items=[]`、`total=0`、`hint='知识层里没有这条，考虑读 <候选路径> 或新增条目'`。
- 工具 `description` **写死后不再改**（缓存前缀稳定）；新增说明一律进 `prompt.ts` 的阶段片段。

**错误码（沿用既有风格）**：

| 错误码 | 触发 | 返回 |
|---|---|---|
| `REQBOARD_INVALID_INPUT` | 三个选择器全空 / `limit` 非 1–20 / `budgetChars` 非 1–8000 | 拒绝，给修复指引 |
| `REQBOARD_KB_NOT_FOUND` | `id` 不存在 | `items=[]` + `hint`（不抛异常） |
| `REQBOARD_KB_DISABLED` | `knowledge.enabled=false` | 返回空集 + `hint='知识层已停用'` |
| `REQBOARD_CONFIRM_PENDING` | 本窗口有待确认弹框（既有写路径闸门） | 沿用既有行为（本工具**只读**，不额外加闸） |

## HTTP 路由 `GET /dashboard/api/reqboard/kb` `serves: FR-5, FR-8, FR-9, FR-10`

| 项 | 值 |
|---|---|
| 方法/路径 | `GET /dashboard/api/reqboard/kb` |
| 查询参数 | `query`、`kind`、`id`、`limit`（≤20）、`budget_chars`（≤8000） |
| 返回 | 与工具**同构**的 JSON（`items/total/truncated/budgetChars/hint`）+ 页面清单（`pages[]`：4 份页面的路径与行数） |
| 错误 | 400 + `{ error: 'REQBOARD_INVALID_INPUT', message }`；非 200 不产生副作用 |
| 用途 | 看板「知识库」只读页（`src/client/views/knowledge.ts`）的数据源 |

## 端口 `KnowledgePort` `serves: FR-1, FR-2, FR-3, FR-7`

```ts
// src/application/ports.ts —— 追加（现有端口不动）
export interface KnowledgePort {
  /** 索引是否存在（注入侧据此决定是否加节：不存在 → 逐字节不变） */
  indexExists(): Promise<boolean>
  /** 读索引原文（已含预算校验结果） */
  readIndex(): Promise<{ text: string; chars: number; lines: number; overflow?: KbOverflow }>
  /** 解析后的行（解析失败行以 issues 报出，不静默丢弃） */
  readEntries(): Promise<{ rows: readonly KbIndexRow[]; issues: readonly KbIssue[] }>
  /** 取单条正文（不存在 → undefined） */
  readEntry(id: string): Promise<string | undefined>
  /** 追加一条（幂等：同 id 重复写 → 覆盖条目文件但索引行不重复） */
  appendEntry(input: KbEntryDraft): Promise<{ id: string; indexPath: string }>
  /** 页面/机器索引导航（供 kb-build --check 与自检复用） */
  listArtifacts(): Promise<readonly KbArtifact[]>
}
```

- **实现**：`src/adapters/KnowledgeRepository.ts`，全部经 `DocRepository`（`exists/read/write/list`），
  自己**不碰 fs**（保持「adapter 只适配」与可测性）。
- `appendEntry` 的幂等键 = `id`；重复提交同一归档 → 条目覆盖、索引行不变（对齐 `reqboard_submit` 既有幂等语义）。

## 生成 CLI `scripts/kb-build.mts` `serves: FR-4, FR-8, FR-9, FR-10`

```bash
npx tsx scripts/kb-build.mts --write     # 生成/覆盖 4 份生成物与 2 份机器索引
npx tsx scripts/kb-build.mts --check     # 只生成到内存并与库内比对，diff 非空 → 退出码 1（CI 门禁）
```

| 产物 | 生成方式（确定性） | 口径 |
|---|---|---|
| `code-map.md` | 遍历 `src/**/*.ts`：模块 → 导出符号数 + 关键文件 + 角色行（角色来自文件头 JSDoc 首句） | 模块级，≤200 行 |
| `code-map.symbols.tsv` | 同上，逐符号一行 `file\tsymbol\tsignature` | 全量，不进上下文 |
| `design-tokens.md` | 抽 `src/client/styles*.ts`：`#hex` 去重、`--var:`、`@media/@container (max-width: Npx)`、类名前缀分组 | ≤200 行 |
| `design-tokens.classes.tsv` | 全量 `dsh-pm-*` 类名 | 不进上下文 |
| `INDEX.md` 的「代码地图」「前端令牌」两节 | 由本脚本维护（标记块内） | 只改标记块，**不碰**手写条目行 |

**标记块约定**：生成物在 INDEX 中只写 `<!-- kb:generated:begin -->` … `<!-- kb:generated:end -->` 之内，
与既有 `<!-- reqboard:marks:begin -->` 同思路——**机器区与手写区互不覆盖**。

## 自检 CLI `scripts/kb-probe.mts` `serves: FR-7`

```bash
npx tsx scripts/kb-probe.mts            # 人读输出；任一失败 → 退出码 1
npx tsx scripts/kb-probe.mts --json     # 结构化（进 CI 日志/验收证据）
```

| 检查 | 失败条件 | 输出 |
|---|---|---|
| K1 索引预算 | `INDEX.md` >8,000 字符 或 >200 行 | 实际值与超限量 |
| K2 索引可解析 | 行不匹配行语法 / 同 id 重复 / 分节缺失 | 行号 + 原文 + 期望语法 |
| K3 页面预算 | 任一 L1 页 >200 行 | 文件 + 行数 |
| K4 死链 | 条目/页面 `pointer` 指向的目标不存在（文件或 `#锚点` 章节） | 条目 id + 目标路径 |
| K5 孤儿 | `entries/*.md` 存在但索引未列（或反之） | 条目 id |
| K6 stale | `updated` 超过 `expires`（默认 180 天）未复核 | 条目 id + 日期 |
| K7 生成物漂移 | `kb-build --check` 的 diff 非空 | 漂移文件 + 首个差异行 |
| K8 规范可执行 | `conventions.md` 某条的 `校验：` 目标文件/测试不存在 | `C-NN` + 目标 |
| K9 代码地图覆盖 | `code-map.symbols.tsv` 行数与当次扫描不一致 | 期望/实际 |

## 与既有接口的关系 `serves: FR-5, FR-6, FR-7`

| 既有接口 | 变化 |
|---|---|
| 既有 20 个 Agent 工具 | **签名与描述零变化**（仅新增第 21 个） |
| `reqboard_submit(kind=archive)` | 入参不变；**副作用新增**「写条目 + 索引行」，失败即抛错 |
| `GET /dashboard/api/reqboard/*` | 只新增 `/kb` 一条；既有路由零变化 |
| 节点输入包 | 结构新增可选节；无 `docs/knowledge/` 时**逐字节不变** |
| `templates/archived/index.md` | 从「格式模板」升级为「索引条目字段的说明」+ 指向 `docs/knowledge/`（旧路径 `requirements/INDEX.md` 作废并注明） |
