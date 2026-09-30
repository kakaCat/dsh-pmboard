# REQ-260930183951-eb6c 测试用例设计 · 验收单自证失败修复 serves: FR-1, FR-2, FR-3, FR-4

> 测试策略：**domain 单测 + 一条全链路用例**为主，每个 FR 至少一条**可证伪**断言
> （能说清"改坏了哪一处它就会红"）。不追求用例数量，追求"这条断言真的在守那个契约"。
>
> **重建说明**：2026-09-30 19:39 被并发写入者删除，此处按原稿重建（落章记录仍在 ledger，路径不变）。
> 表内点名的测试文件**前 20 行都带 `serves:`**（否则会被"孤儿用例"探针点名）。

## 用例总览 serves: FR-1, FR-2, FR-3, FR-4

| 用例 | 断言什么 | 测试文件（实际文件） | 证伪方式（改坏哪里→变红） |
|---|---|---|---|
| TC-1.1 | `toSheetTasks` 保留 `parentId` | `tests/sheet-projection.test.ts` | 从投影返回对象里删掉 `parentId` |
| TC-1.2~1.3 | `parentId` 空串归一为缺省；`canceled` 剔除 | `tests/sheet-projection.test.ts` | 把空串判定改成 `!== undefined` |
| TC-1.4 | 投影产物过 domain 过滤 → 只剩父卡项 | `tests/sheet-projection.test.ts` | 去掉 domain 侧过滤（子卡项冒出） |
| TC-2.1~2.7 | 锚点失效 → 一条不阻断的可见项（含护栏） | `tests/sheet-anchor-gaps.test.ts` | 从 `collectMissingAnchors` 里删掉 `docs.exists` 判定 |
| TC-3.1~3.4 | 编号 `v<ver>-1..N` 连续无空洞 | `tests/sheet-items-format.test.ts` | 把编号改回 `taskCount + N` 预留位 |
| TC-4.1~4.3 | 需求级项标题按缺口类型区分 | `tests/sheet-items-format.test.ts` | 标题单点改回硬编码 `'需求级验收'` |

**回归面（既有套件，不在上表「实际文件」列点名以免孤儿探针误报）**：`tests/verification-sheet.test.ts`（1 父 3 子经 use case 只出父卡项）、`tests/domain/acceptance-sheet.test.ts`、`tests/domain/verification-doc.test.ts`、`tests/e2e-coverage.test.ts`、`tests/consistency.test.ts`、`tests/design-serves-gate.test.ts`、`tests/accept-sheet-tool.test.ts`、`tests/verdicts-and-rework.test.ts`、`tests/accept-verdicts-snapshot.test.ts`。

## FR-1 投影与去重用例 serves: FR-1

**TC-1.1（可证伪主断言）**：`toSheetTasks([child]).parentId === 't-parent1'`
——**这是 FR-1 唯一能证伪投影的断言**（全链路用例做不到：调用方那层过滤还在，删掉投影它照样绿）。

**TC-1.2**：`parentId: ''` 的任务 → 返回对象**不含** `parentId` 键（顶层卡只有一种形态）。

**TC-1.3**：`status: 'canceled'` 的任务被剔除；顺序与输入一致。

**TC-1.4**：`toSheetTasks([父, 子, 子])` 的产物喂给 `buildSheet` → 任务项只剩父卡 1 项。

**与既有 `tests/verification-sheet.test.ts` 的分工**：那条用例走完整 use case（1 父 3 子 → `sheet_items === 2`），
证明"调用方过滤 + 投影"整链成立；TC-1.1 证明**投影本身不丢字段**。两者缺一，"双保险"就还是只有一层是真的。

## FR-2 锚点探针用例 serves: FR-2

| 用例 | 输入 | 期望 |
|---|---|---|
| TC-2.1 | 验收标准引用 `tests/a.test.ts`（存在，且 `tests/` 目录存在） | 清单为空（不制造噪声） |
| TC-2.2 | 验收标准引用 `tests/gone.test.ts`（不存在） | 产出 `"任务一 → tests/gone.test.ts"` |
| TC-2.3 | 两条任务各引用一个不存在的文件 | 探针给 2 条；**验收单只出 1 项**，criterion 同时含两个路径 |
| TC-2.4 | 构造 `anchorGaps` 入 `buildSheet` | 项为 `pending` / `gapKind='consistency'` / `source={kind:'requirement'}` |
| TC-2.5 | 引用 `docs/…md` 与 `src/a.ts`（非测试文件） | 不触发（只认 `tests/*.{test,spec}.*`） |
| TC-2.6 | `canceled` 任务引用了不存在的测试文件 | 不征集 |
| TC-2.7 | 工作区**没有 `tests/` 目录** | 整段跳过（读数未知不追加，裸夹具工作区不制造噪声） |

## FR-3 编号连续性用例 serves: FR-3

**TC-3.1**：一次触发全部系统项（孤儿 + 不可照着验 + E2E 缺口 + 三方一致性 + 锚点失效 + 追溯断链）
→ `items.map(i => i.id)` 严格等于 `['v1-1', …, 'v1-N']`，`N === items.length`，**无空洞**。

**TC-3.2（事故形态回归）**：只触发 E2E 缺口（`e2eCoverage: false`），2 张任务卡
→ 编号 `v1-1, v1-2, v1-3, v1-4`，**不得**出现旧口径的 `taskCount+4 = v1-6` 跳号。

**TC-3.3**：`reworkOnly` 续版（上一版有 `failed`）→ 续版编号同样连续（`v2-1..v2-N`）。

**TC-3.4（既有回归）**：2 张顶层卡、无系统项 → `['v1-1','v1-2','v1-3']`（行为逐字不变）。

## FR-4 标题区分用例 serves: FR-4

**TC-4.1（表驱动单测）**：`requirementItemTitle(criterion, gapKind)` 六种组合逐一断言：

| 入参 | 期望 |
|---|---|
| `(普通需求级 criterion, undefined)` | `需求级验收` |
| `('验收项不可照着验…', undefined)` | `需求级验收 · 不可照着验` |
| `(任意, 'e2e')` | `需求级验收 · E2E 覆盖` |
| `(任意, 'orphan')` | `需求级验收 · 孤儿用例` |
| `(任意, 'traceability')` | `需求级验收 · 追溯断链` |
| `('验收锚点失效…', 'consistency')` | `需求级验收 · 锚点失效` |
| `('三方一致性…', 'consistency')` | `需求级验收 · 三方一致性` |

**TC-4.2（渲染）**：同时含 E2E 缺口项与锚点失效项的验收单 → 需求级项标题**互不相同**，
渲染出的 `verification.md` 里同时出现「需求级验收 · E2E 覆盖」「· 锚点失效」「· 追溯断链」。

**TC-4.3（普通项不受影响）**：无缺口的需求级项仍是裸「需求级验收」。

## 回归与命令锚点 serves: FR-1, FR-2, FR-3, FR-4

| 检查 | 命令 | 期望 |
|---|---|---|
| 新增用例全绿 | `npx vitest run tests/sheet-projection.test.ts tests/sheet-anchor-gaps.test.ts tests/sheet-items-format.test.ts` | **17 passed** |
| 同层回归 | `npx vitest run tests/verification-sheet.test.ts tests/domain/acceptance-sheet.test.ts tests/domain/verification-doc.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts tests/accept-sheet-tool.test.ts tests/verdicts-and-rework.test.ts tests/accept-verdicts-snapshot.test.ts` | 全绿 |
| 类型不回归 | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | 不高于施工前基线 220（实测 212） |
| 全量不回归 | `npx vitest run 2>&1 \| grep "Tests "` | 失败数不高于施工前基线 103（实测 103，零新增） |
| 构建通过 | `npx tsdown -c tsdown.config.mjs 2>&1 \| tail -1` | 含 `Build complete`（**留到 t5 执行**：会覆写运行中的 dist） |

## 覆盖读数说明（E2E 与孤儿用例） serves: FR-2, FR-3

- 本需求的 `requirement.md` **未含「测试策略表」** → `e2eCoverageOf` 读数未知 → 验收单**不追加 E2E 项**
  （既有语义：读数未知不追加，避免噪声）。如实声明：本需求以 **domain 单测 + 全链路用例**为主，
  没有跨组件（UI+服务端）的 E2E 场景；如验收人认为必须补，按返工处理。
- 本文件「实际文件」列点名的三个测试文件**都已带 `serves:` 抬头**；回归面文件以散文列出，不进该列。
