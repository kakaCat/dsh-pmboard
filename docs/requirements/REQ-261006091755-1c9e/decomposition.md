# 拆分计划（REQ-261006091755-1c9e）

> 目标一句话：**让「人已裁定本需求不要原型」在拆分覆盖门的锚点维也算数**——
> 豁免生效 ∧ 无已登记原型产物 ⇒ 锚点维整维跳过；做法是在 `assertUiCardPrototypeAnchors` 加一条前置（2 行 + 2 个 import），
> 判据全部复用既有单点（`prototypeExemptOf` / `registeredPrototypesOf`）。本计划须**人批准**后才能落任务卡。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（FR-1～FR-4） |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（D-1 缺口另立需求、D-2 豁免边界） |
| I-x | design/interfaces.md | 接口 / 前置条件（I-1 新增前置、I-2 `prototypeExemptOf` 读侧、I-3 `registeredPrototypesOf` 读侧） |
| T-x | design/data-model.md | 读侧字段（T-1 `prototype_exempt`、T-2 `artifacts[].kind/confirmedAt/autoDiscovered`） |
| S-x | design/backend.md | 应用层落点与三条入口（S-1 改动文件、S-2 三条入口时序、S-3 错误码表） |
| UC-x | design/use-cases.md | 用户场景（UC-1～UC-5） |
| TC-x | design/test-cases.md | 测试用例（TC-1～TC-10） |
| t-x | 本文档任务表 | 任务 |

## §1 代码层面变更盘点

**新增**：无新增文件、无新增导出、无新增错误码、无新增 front-matter 键。

**修改**（精确到函数）：

| 文件 | 函数/位置 | 改动 |
|---|---|---|
| `src/application/internal/content-gate-wiring.ts` | `assertUiCardPrototypeAnchors` | 在 `if (!applies) return undefined` 之后加一条前置：`prototypeExemptOf(req, doc.frontmatter).active && registeredPrototypesOf(req).length === 0` → `return undefined` |
| 同上 | 文件头 import 块 | `prototype-gates.js` 的既有 import 里补 `prototypeExemptOf`；新增 `prototype-registration.js` 的 `registeredPrototypesOf` import |
| `tests/plan-prototype-anchor-gate.test.ts` | 新增 describe | 豁免四组合断言 + 两条逆验证（临时改/删前置，跑红后复原） |

**删除**：无。

**不改**：`prototype-gates.ts` / `prototype-registration.ts` / `plan-prototype-refs.ts` / 三条入口用例签名 / 模板与提示词 / 台账与协议。

## §2 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 让豁免在拆分锚点维也算数 | FR-1, FR-3 | I-1, I-2, I-3, S-1, S-2 + `src/application/internal/content-gate-wiring.ts` | — | D-2 | implement | backend | — | S | ① `npx vitest run tests/plan-prototype-anchor-gate.test.ts` 全绿（既有 4 组断言零改动）；② `pnpm typecheck` 退出码 0；③ 源码断言：锚点维函数体内 `prototypeExemptOf(` 与 `registeredPrototypesOf(` 各命中且**无**手写判据（`grep -n "prototype_exempt" src/application/internal/content-gate-wiring.ts` 在函数体内零命中） | dev,review |
| t2 | （落库后回填） | 补豁免四组合断言与逆验证 | FR-1, FR-2, FR-3, FR-4 | TC-1～TC-10, UC-1～UC-3, UC-5 + `tests/plan-prototype-anchor-gate.test.ts`、`src/application/internal/content-gate-wiring.ts` | — | D-2 | test | backend | t1 | M | ① 目标文件全绿且含 TC-1～TC-9 逐条断言（豁免生效无原型放行 / 未登记骨架仍放行 / 理由空仍拒 / 未落章仍拒 / 无键仍拒 / 有原型仍拒 / 有原型+权威锚点放行 / 非 UI 放行 / 存量放行）；② 两条逆验证：删掉前置 → TC-1/TC-2 必红；条件放宽成「豁免即跳过」→ TC-6 必红，复原后全绿；③ `npx vitest run tests/plan-prototype-anchor-gate.test.ts` 退出码 0 | dev,review,test |
| t3 | （落库后回填） | 核验兼容、回滚与交付基线 | FR-2, FR-4 | I-2, I-3, S-3 + `tests/move-gate-paths.test.ts`、`tests/prototype-gates.test.ts`、`tests/category-doc-sets.test.ts`、`src/application/internal/content-gate-wiring.ts` | — | D-1, D-2 | test | backend | t1 | S | ① 未豁免路径逐字不变：既有拒绝用例（四条转移路径 + 三门 + 适用性）全绿，且同一 input 的 `GateFailure` 码/gaps 文案无变化；② 回滚演练：删掉前置两行与两个 import 后 `pnpm typecheck` 0、目标文件回到改动前计数（全绿），复原后仍全绿；③ 交付基线：`pnpm typecheck` 0、`pnpm build` 0、`pnpm test` 失败集合与改动前基线**逐文件一致**（规范 C-14） | dev,review |

**子卡段说明**：三张卡都无接口可联调，落库时 `skipIntegration: true`（不落联调段）。

**体量声明（files/anchors/chars → DU = files + anchors/2 + chars/2000，容量 16 DU）**：

| key | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 4 | 6 | 1600 | 4 + 3 + 0.8 = **7.8** | ≤16 ✓ |
| t2 | 3 | 12 | 2600 | 3 + 6 + 1.3 = **10.3** | ≤16 ✓ |
| t3 | 5 | 8 | 2200 | 5 + 4 + 1.1 = **10.1** | ≤16 ✓ |

无超容量卡（不需要 `⚠️超容量` 标记）。

## §3 覆盖对照

| 需求条款 | 接口（interfaces） | 模块（backend/data-model） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1 | S-1, S-2, T-2 | TC-1, TC-2, TC-8, TC-9 | t1, t2 | ✅ |
| FR-2 | I-1, I-2 | S-3, T-1 | TC-3, TC-4, TC-5, TC-10 | t1, t2, t3 | ✅ |
| FR-3 | I-1, I-3 | T-2 | TC-6, TC-7 | t1, t2 | ✅ |
| FR-4 | I-2, I-3 | S-1 | TC-10 | t2, t3 | ✅ |
| **合计** | 3 接口 | 3 模块 + 2 字段 | 10 用例 | 3 任务 | 4/4 条款有主 |

**场景对照（UC-x → 任务）**：UC-1 → t1, t2；UC-2 → t2, t3；UC-3 → t2；UC-4 → t3；UC-5 → t2。

**裁定对照（D-x → 任务）**：D-1（缺口另立需求，不在原需求扩范围）→ t3（兼容卡如实记录绕行历史不追改）；D-2（跳过条件 = 豁免生效 ∧ 无已登记原型）→ t1（实现该条件）、t2（TC-6 锁死"有原型仍拒"）。

## §4 边界校验

- 每张卡都能被独立验收：acceptance 都写明"跑什么命令 / 看到什么"，新窗口零会话历史即可开工。
- 不二次创作设计：实现与用例都按已确认的 `design/*.md` 口径；若发现设计缺口则退回设计改计划。
- 不超范围：不碰版本门 / 原型锚点门 / presence 门 / 模板 / 提示词 / 台账 schema；不修改已归档需求的文档。
