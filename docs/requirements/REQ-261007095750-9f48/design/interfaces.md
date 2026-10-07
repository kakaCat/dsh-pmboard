# 接口设计（REQ-261007095750-9f48）<!-- serves: FR-1, FR-2, FR-3 -->

> 本仓**冲突族判据的路径抽取口径**在这一份里写死：正则的根与扩展名、函数签名、输入输出样例、反例。
> 别处（含本文以外的文档）只引用，不重述——两份真相必然分叉。
> **口径澄清**：`src/domain/task/Footprint.ts:84` 另有一套更宽的 `PATH_RE`（体量下限用，已含 `src`、
> 不要求扩展名、不含 `packages`）——它不是冲突族的第二份真相，而是第三类消费者的独立口径；
> 本次只改冲突族这一套。

## 1. 冲突族唯一取数口：`declaredFiles` <!-- serves: FR-1 -->

```ts
// src/application/internal/conflict-check.ts
export function declaredFiles(implementation: string): string[]
```

| 项 | 契约 |
|---|---|
| 输入 | `implementation: string`（卡的实施说明原文，可空串） |
| 输出 | 工作区相对路径数组，**去重**，按出现顺序 |
| 副作用 | 无（纯函数，零 I/O） |
| 未知扩展名 | 不视为路径（不抽） |
| 空 / 缺字段 | 返回 `[]` ⇒ 消费方"没依据不判"（不误报） |

### 1.1 正则口径（本次唯一改动点） <!-- serves: FR-1 -->

```
改前：/(?:agent-dh\/)?(?:packages|scripts|tests|docs)\/(?:[\w@-]+\/)*[\w@.-]+\.(?:tsx|json|mjs|cjs|ts|js|md|css|html|yaml|yml)/g
改后：/(?:agent-dh\/)?(?:src|packages|scripts|tests|docs)\/(?:[\w@-]+\/)*[\w@.-]+\.(?:tsx|mts|json|mjs|cjs|ts|js|md|css|html|yaml|yml)/g
                                 ^^^^ 新增根                                            ^^^^ 新增扩展名
```

| 维度 | 值 | 说明 |
|---|---|---|
| 根 | `src` `packages` `scripts` `tests` `docs` | 新增 `src`；可选 `agent-dh/` 前缀（兼容，未改） |
| 扩展名 | `tsx` `mts` `json` `mjs` `cjs` `ts` `js` `md` `css` `html` `yaml` `yml` | 新增 `mts`；其余不变 |
| 目录段 | `[\w@-]+/` 任意层 | 未改 |
| 文件名 | `[\w@.-]+` 后紧跟已知扩展名 | **必须带扩展名**：这是"目录名不被误抽"的机制 |

### 1.2 输入输出样例（写进用例，扩根前后可对照） <!-- serves: FR-1, FR-2 -->

| 输入 `implementation` | 输出（改后） | 改前 |
|---|---|---|
| `改 src/application/internal/conflict-check.ts` | `['src/application/internal/conflict-check.ts']` | `[]` |
| `加 scripts/<新探针>.mts` | `['scripts/<新探针>.mts']` | `[]`（`.mts` 不在表内） |
| `改 src/.../a.ts 与 src/.../a.ts` | `['src/.../a.ts']`（去重） | `[]` |
| `见 src/application/internal/ 这一层` | `[]`（**目录名不是文件**） | `[]` |
| `改 tests/<既有根样例>.test.ts` | 命中该路径（既有根不回归） | 同 |
| `随便一句话，没有任何路径` | `[]` | `[]` |

## 2. 两处消费方的接口（签名与语义均不变）<!-- serves: FR-2 -->

```ts
// ① 文件冲突门（硬）
export interface WorkSurfaceTask { key: string; implementation: string; dependsOn: readonly string[] }
export interface WorkSurfaceConflict { file: string; keys: [string, string] }
export function findWorkSurfaceConflicts(tasks: readonly WorkSurfaceTask[]): WorkSurfaceConflict[]

// ② 零交集依赖边建议（软）
export function zeroOverlapDependencyWarnings(tasks: readonly WorkSurfaceTask[]): string[]
```

| 项 | ① 文件冲突门 | ② 零交集建议 |
|---|---|---|
| 触发 | 两卡**互无依赖**（含传递闭包）且 `declaredFiles` 交集非空 | 两端 `implementation` 都有可抽路径、交集为 ∅、且无 `dep_reasons` 理由 |
| 强度 | 硬：提交被拒，码 `REQBOARD_FILE_CONFLICT` | 软：进 `dependency_warnings`（不拒） |
| 本次变化 | **只有取数口径变**（能看见 `src/`） | 同 |
| 不受影响 | 传递闭包 `ancestorsOf`；同一依赖链上的卡不算冲突 | 语法理由解析（`dep_reasons`）与建议文本 |

**为什么两处必须共用一份取数**：门禁读 A、下游读 B 会造出"门禁绿、实际冲突"的静默缺口——
这是上个需求（REQ-261006211623-9dc1 FR-5）刚修过的同型病。

## 3. 错误与边界语义 <!-- serves: FR-1, FR-3 -->

| 情形 | 语义 |
|---|---|
| `implementation` 为空 / 缺字段 | 两处判据都"没依据不判"（既不放宽也不误报） |
| 路径写成本仓不存在的形态（如 `src/<不存在>/x.ts`） | **照样抽出**：抽取器不查盘（查盘是设计坐标探针的事，别混） |
| 同一文件在文本里出现多次 | 去重成一条 |
| 文本里出现目录名（`src/application/internal/`） | 不抽（缺文件名与扩展名） |
| 扩根后冲突门在真实数据上出现新命中 | **不许静默放宽**：逐条判"真冲突 / 误报"并留痕（见 `design/test-cases.md` §4） |

## 4. 复测口径的命令接口（仓库外，不新增脚本）<!-- serves: FR-3 -->

```bash
# 扩根前后各跑一次，取「含 src/ 的行被抽出的比例」与「零交集边命中数」
npx tsx -e "import {declaredFiles} from './src/application/internal/conflict-check.ts'; \
  console.log(JSON.stringify(declaredFiles('改 src/application/internal/conflict-check.ts')))"
```

样本口径：`docs/requirements/*/decomposition.md` 中**含 `src/` 的任务表行**；
"被抽出"= `declaredFiles(该行 implementation 列)`.length > 0。
读数写入该需求的证据文件（扩根前 / 扩根后两列），**必须可复跑**；一行式不可靠时退化为 `/tmp` 下的脚本，
并在证据里写明"仓库外"。
