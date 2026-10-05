---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 设计 · 接口与数据契约（REQ-261004174324-4195 知识层自动自举）

## 新增用例 `ensureKnowledgeLayer` `serves: FR-2, FR-4`

`src/application/use-cases/EnsureKnowledgeLayer.ts`

```ts
export type KbEnsureReason = 'index-exists' | 'root-unknown' | 'root-drifted' | 'markers-missing' | 'disabled'

export interface KbEnsureResult {
  readonly status: 'created' | 'skipped' | 'failed'
  readonly root: string
  /** 本次真正写入的文件（工作区相对路径，按写入顺序）。 */
  readonly created: readonly string[]
  /** 未写入者 + 原因。 */
  readonly skipped: readonly { path: string; reason: 'same-content' | 'index-exists' }[]
  /** check 模式下的漂移文件（write 模式恒为空）。 */
  readonly drift: readonly string[]
  readonly reason?: KbEnsureReason
  readonly failedPath?: string
  readonly error?: string
}

export async function ensureKnowledgeLayer(
  deps: Pick<UseCaseDeps, 'docs'>,
  opts?: { readonly force?: boolean; readonly mode?: 'write' | 'check' },
): Promise<KbEnsureResult>
```

| 项 | 契约 |
|---|---|
| 输入 | 只吃端口：`deps.docs`（`exists/read/write/list/stat/workspaceRoot`）；**根取自 `docs.workspaceRoot()`**，不接受外部传根（避免第二份根真相） |
| 输出 | 上表结果对象；**永不抛**（启动路径不能因自举中断），失败一律 `status:'failed'` + `error` |
| 默认 | `mode='write'`、`force=false` |
| 幂等 | 同根同内容重复调用 → `created=[]`、`skipped[*].reason='same-content'` |
| `force` | 仅跳过"进程内已尝试过"的去重（不跳过内容比对），供测试与 CLI |
| `mode='check'` | 只算不写，漂移进 `drift`（CLI `--check` 用） |

## 新增窄端口 `KbSourcePort` `serves: FR-4`

```ts
// src/application/ports.ts
export interface KbSourcePort {
  list(relDir: string): readonly DocEntry[]
  read(relPath: string): Promise<string>
}
```

- `FileDocRepository` **已结构化满足**，不写新适配器；`UseCaseDeps` 增加可选 `knowledgeSource?: KbSourcePort`（缺省 → 复用 `docs`）。
- 用例只认这两个方法 → 测试用内存假实现即可跑（不碰真 fs）。

## 领域纯函数 `src/domain/knowledge/generate.ts` `serves: FR-3, FR-4`

```ts
export interface KbSourceFile { readonly path: string; readonly text: string }
export interface KbSymbolRow { readonly file: string; readonly name: string; readonly kind: string; readonly signature: string }

export function extractSymbols(relPath: string, text: string): readonly KbSymbolRow[]
export function renderCodeMap(files: readonly KbSourceFile[]): { page: string; symbolsTsv: string }
export function renderDesignTokens(files: readonly KbSourceFile[]): { page: string; classesTsv: string; counts: { colors: number; vars: number; breakpoints: number; classes: number } }
export function scaffoldIndex(): string
export function replaceGeneratedSection(indexText: string, sectionTitle: string, rows: readonly string[]): string
```

- 零 IO、零 fs import、零时间戳（确定性：两次同输入逐字节相同）。
- 抽取正则与分组上限（`GROUP_TOP=24`）**沿用** [kb-build.mts](scripts/kb-build.mts) 现值，保证与既有生成物逐字节兼容（`pnpm kb:check` 不红）。

## CLI 契约（保持不变） `serves: FR-4`

```bash
npx tsx scripts/kb-build.mts --write [--root <dir>]
npx tsx scripts/kb-build.mts --check [--root <dir>]
npx tsx scripts/kb-build.mts --backfill --ledger <path>   # 行为不变，留在脚本内
```

| 模式 | stdout | 退出码 |
|---|---|---|
| `--write` | 逐文件 `[write] <path>（<chars> 字符 / <lines> 行）`；内容一致者 `[skip] <path>（内容一致）` | 0（失败 → 1 + `[error]`） |
| `--check` | 每处漂移 `[drift] <path>：首个差异在第 N 行（库内 X 行 / 期望 Y 行）` + `期望:` / `实际:` 两行 | 有漂移 1，否则 0 |

`--root` 为**新增可选参数**（缺省 `process.cwd()`）；既有调用（`package.json` 的 `kb:build` / `kb:check`）无需改动，输出格式与退出码语义不变（C-13 门禁依赖）。

## 配置契约 `knowledge.autoBootstrap` `serves: FR-6`

```ts
knowledge?: {
  enabled?: boolean
  injectIndex?: boolean
  trimRequirementDoc?: boolean
  injectBudgetChars?: number
  autoBootstrap?: boolean   // 新增，缺省 true
}
```

| 情况 | 行为 |
|---|---|
| 不写 `knowledge` | `autoBootstrap=true`（自举开启，符合本需求目标） |
| `autoBootstrap:false` | 不检测、不生成（回到手动跑脚本） |
| `enabled:false` | 整层停用：工具空集 + **不自举**（优先级高于 `autoBootstrap`） |
| 非布尔值（如 `"no"`） | **装配期抛** `Error('knowledge.autoBootstrap 只能是 boolean：实际 …')`（响亮，不静默当默认） |
| 其余 `knowledge.*` 字段 | 判定风格**不动**（`!== false`），不引入回归 |

## 数据契约：生成物与写入规则 `serves: FR-3, FR-5`

| 产物 | 来源 | 自举时怎么写 | 冲突处理 |
|---|---|---|---|
| `docs/knowledge/INDEX.md` | 骨架生成 + 生成区由脚本维护 | 缺 → 建骨架；在 → 只替换 `<!-- kb:generated:begin/end -->` 区内两节 | 手写行**逐字不动**；生成区标记缺失 → `status:'failed', reason:'markers-missing'`（不猜、不重建） |
| `code-map.md`、`code-map.symbols.tsv` | 全生成 | 内容不同才写 | 内容同 → 跳过（保 mtime） |
| `design-tokens.md`、`design-tokens.classes.tsv` | 全生成 | 同上 | 同上 |
| `architecture.md`、`conventions.md`、`glossary.md` | **人手写** | **永不创建、永不覆盖** | 不存在 → INDEX 对应节如实写「（暂无）」/「待写」 |
| `entries/kb-NNNN.md` | 归档沉淀（`reqboard_submit`） | 不在自举范围 | — |
| `*.tsv` | 机器索引 | 生成但**永不进上下文** | 读取仍只走 `reqboard_kb` |

**无源码时的诚实降级**：无 `src/` → code-map 页写「未发现源文件」+ 空表；无 `src/client/styles*` → design-tokens 页同样置空。**两者都不算失败**（`status:'created'`，页面内说明），退出码不为 1。

**预算**：页 ≤200 行、INDEX ≤8000 字符 / ≤200 行（沿用 `KB_LIMITS`）；超限按既有规则截断并在页内标注。

## 客户端契约变更 `serves: FR-1`

| 项 | 变更 |
|---|---|
| page panel 注册 | `pmboard-knowledge` **不再注册**（`main` 与 `sidebar.panellist` 两端一起消失） |
| 其余面板 | `dsh-pmboard`（看板）等 order/label 不变 |
| 样式 | `KNOWLEDGE_CSS` 从拼接中移除；归属章机制（`dataset.plugin/pluginCss`）不变 |
| 删除的文件 | `views/knowledge.ts`、`page/register-knowledge.ts`、`styles/knowledge.ts`、`tests/kb-client-page.test.ts`、`scripts/knowledge-page-probe.mts` |

## Agent 侧契约（零变化） `serves: FR-1`

| 契约 | 状态 |
|---|---|
| `reqboard_kb(id/kind/query/list/limit/budgetChars)` 工具 | **签名与说明零变化** |
| `GET /dashboard/api/reqboard/kb` 响应 | **零变化**：`{ items, total, truncated, budgetChars, hint?, pages[] }` |
| 节点输入包「项目知识索引」节 | 机制不变（`injectIndex` / `injectBudgetChars` 语义不变）；变化只是"索引现在几乎总是存在" |
| 归档沉淀 `kind=archive` | 不变（自举不写条目） |

## 与需求的显式偏离 `serves: FR-6`

1. **FR-6 的"非法值结构化报错"** 只对新增字段 `autoBootstrap` 生效（装配期抛 Error）；既有 `knowledge.*` 字段的宽容判定保持不变——理由：改它们的语义属回归风险，不在本需求范围。
2. **用例签名不接受外部 `root` 参数**（需求 FR-4 只说"根参数化"）：根真相收敛在 `docs.workspaceRoot()` 单点，避免调用方传错根；CLI 的 `--root` 由脚本先构造 `FileDocRepository({ workspaceRoot })` 实现，不污染用例签名。
