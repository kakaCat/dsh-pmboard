# 拆分计划（REQ-261006094052-1da2 确认门死锁：已落章未推进后 agent 无路可走）

> 需求：`docs/requirements/REQ-261006094052-1da2/requirement.md`（FR-1~FR-4，判据 A1~A4，D-1~D-7）
> 设计：同目录 `design/`（architecture / interfaces / data-model / use-cases / test-cases / backend）
> 现场：来源需求 REQ-261006092213-4f5b 窗口实测 `confirmed:true / advanced:false`、`REQBOARD_HUMAN_GATE` 拒 move
> 基线：`pnpm test` = **70 条失败用例 / 39 个失败文件**（`.dsh-data/baseline-test.txt`，HEAD 实测，2026-10-06 09:39）

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（本计划用到 D-1~D-7） |
| I-x | design/interfaces.md 接口清单 | 内部函数签名 / 工具契约（I-1~I-6） |
| S-x | design/backend.md 代码落点（B-7） | 模块落点（S-1~S-4） |
| TC-x | design/test-cases.md 用例表 | 测试用例（TC-1~TC-7） |
| A-x | requirement.md 判据 | 可证伪验收判据（A1~A4） |

## §1 改动盘点（逐份对照设计）

| 设计文档 | 被哪张卡兑现 | 改动性质 |
|---|---|---|
| `design/architecture.md` | t1（推进单点）、t2（早退分支复用）、t3（窄口径预判） | 1 处抽单点 + 1 处早退分支补推进 + 1 处预判 |
| `design/interfaces.md` | t1（I-1/I-2）、t2（I-3/I-4）、t3（I-5/I-6） | 新增 1 导出函数 + 1 函数改 async + 2 调用点 await |
| `design/data-model.md` | t5（D-1 零 schema 变更核对） | **零** schema / 零迁移 / 零新字段 |
| `design/use-cases.md` | t2（UC-1/UC-2/UC-5/UC-6）、t3（UC-3/UC-4） | 用例即验收脚本 |
| `design/test-cases.md` | t4（TC-1~TC-7 + 既有期望修正 + 反向验证） | 新增 1 个测试文件 + 改 1 条既有期望 |
| `design/backend.md` | t1~t4 逐条兑现 B-1~B-7；t5 对账 | application 3 文件 + 1 个用例文件 + 1 个测试文件 |

**零改动项（设计明确要求不动的）**：`src/shared/protocol.ts`（schema）、`reqboard_move` 的人工门与其判定、
`planAwaitingAdvance` 与 plan 门合并（批准 → 落库 → 开跑）、`applyDiveTransition` 事件规则、
`contentGatesForMove` / `checkPrototypePresenceGate` 的判定本体、`src/client/**`（看板渲染）、
`PendingConfirmRegistry` 的 TTL 与拦截语义。

## §2 RTM 覆盖对照（每条 FR 的落点）

| 条款 | 承载卡 | 说明 |
|---|---|---|
| FR-1 已落章重发即推进 | t1, t2, t4, t5 | t1 出单点；t2 早退分支调用并返回 `advanced/from/to`；t4 用 TC-1 读回台账钉死；t5 全量对账 |
| FR-2 闸门不过行为不变 | t1, t2, t4, t5 | t1 保留原分支与文案；t2 两处失败返回体一字不动；t4 TC-2/TC-3 断言 `gate_failure.code` 与状态不变 |
| FR-3 不制造注定失败的确认 | t3, t4 | t3 窄口径预判（只判原型存在门）；t4 TC-5/TC-7 断言 UI 不弹、非 UI 照弹 |
| FR-4 推进单点 + 恢复路径可读 | t1, t2, t4, t5 | t1 单点化；t2 note 追加推进结论；t5 核对无 schema 变更与基线 |

无遗漏条款；无「写进计划但无卡」的条款。

## §3 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 抽出推进单点 applyConfirmedAdvance 并让首次确认路径复用 | FR-1, FR-2, FR-4 | I-1, I-2, S-1 + src/application/internal/confirm-settle.ts | — | D-1, D-2 | implement | backend | — | S | ① `grep -n "export async function applyConfirmedAdvance" src/application/internal/confirm-settle.ts` 命中 1 行；② `npx vitest run tests/confirm-settle-plan-persist.test.ts tests/auto-chain-approval.test.ts` 失败数不高于基线（这两条锁死主路径逐字不变）；③ `npx tsc --noEmit` 错误数不高于 HEAD 基线 |
| t2 | （落库后回填） | 早退分支兑现推进：已落章 + 闸门全过 ⇒ 真推进 | FR-1, FR-2 | I-3, I-4, S-2 + src/application/use-cases/AskConfirm.ts | — | D-2, D-4 | implement | backend | t1 | S | `npx vitest run tests/confirm-advance-deadlock.test.ts` 中 TC-1~TC-4 全绿；TC-1 必须**读回台账**（`store.get(id).status === 'design'`）而非只看返回体；TC-2 断言 `gate_failure.code === 'decision_log_missing'` 且 `status` 仍为 `brainstorming` |
| t3 | （落库后回填） | 自动确认窄口径预判（UI 缺原型不弹）+ 两处调用点 await | FR-3 | I-5, S-3, S-4 + src/application/internal/auto-confirm.ts, src/application/use-cases/SubmitArtifact.ts | — | D-3 | implement | backend | — | S | ① `npx vitest run tests/confirm-advance-deadlock.test.ts` 中 TC-5/TC-7 绿（UI 不弹且 `reason` 含原型目录与 `reqboard_submit(kind=prototype)`；非 UI 照弹）；② `npx vitest run tests/output-contract.test.ts tests/submit-prototype.test.ts tests/prototype-registration-no-pin.test.ts` 失败数不高于基线（async 化不得把 Promise 塞进 `auto_confirm`） |
| t4 | （落库后回填） | 新增回归用例文件 + 修正被缺陷行为锁住的既有期望 | FR-1, FR-2, FR-3 | TC-1~TC-7 + tests/confirm-advance-deadlock.test.ts, tests/design-gate-messages.test.ts | — | D-3, D-5 | test | backend | t1, t2, t3 | M | ① `npx vitest run tests/confirm-advance-deadlock.test.ts tests/design-gate-messages.test.ts` 退出码 0；② 四条反向验证（test-cases.md「反向验证」表）各跑一次**必红**并打印改坏点，跑完逐字节还原；③ 新测试文件顶部有 `serves:` 头（避免孤儿用例） |
| t5 | （落库后回填） | 全量回归与基线对账（零新增失败 + 无 schema 变更） | FR-1, FR-2, FR-3, FR-4 | A3, A4 + .dsh-data/baseline-test.txt | — | D-6, D-7 | test | backend | t4 | S | ① `git diff --stat` 中 `src/shared/protocol.ts` 无改动；② `pnpm typecheck` 错误数不高于 HEAD 基线；③ `pnpm test` 失败用例数 ≤ 70 且失败文件数 ≤ 39，逐条列出与 `baseline-cases.txt` 的差集（新增失败必须为 0，若有则逐条定位） |

无超容量卡（单卡上限 16 DU，最大约 6.6 DU：t4）。

## §4 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-2, I-3, I-4（4） | S-1, S-2（2） | TC-1, TC-4, TC-6（3） | t1, t2, t4（3） | ✅ |
| FR-2 | I-3, I-6（2） | S-1, S-2（2） | TC-2, TC-3, TC-6（3） | t1, t2, t4（3） | ✅ |
| FR-3 | I-5（1） | S-3, S-4（2） | TC-5, TC-7（2） | t3, t4（2） | ✅ |
| FR-4 | I-1, I-6（2） | S-1~S-4（4） | 反向验证（4）（4） | t1, t5（2） | ✅ |
| **合计** | 6 接口 | 4 模块 | 12 用例 | 5 任务 | 4/4 条款有主 |

## §5 逐卡实施与验收

### t1 抽出推进单点
- **实施**：`src/application/internal/confirm-settle.ts` 新增导出 `applyConfirmedAdvance`（签名与语义逐字照
  `design/interfaces.md` I-1：`canReqTransition` 不过 → 兜底文案；否则 `mutateIfPresent` 内 `status !== from`
  原样返回，否则迁移 + `[自动推进]` 评论 + `stampCheckpoint`；异常吞进 `advanceNote` **不抛**）。
  把 `applyConfirmDecision` 里那段 `try { mutateIfPresent(...) } catch {}` 整块换成一次调用。
  **不动**：`contentGateFailure` / `designGateFailure` 两个分支、兜底文案、第 267 行 `applyDiveTransition` 的位置与条件、
  plan 门合并整块。
- **怎么验收**：见任务表 t1 三条锚点。

### t2 早退分支兑现推进
- **实施**：`src/application/use-cases/AskConfirm.ts` 早退分支（`alreadyConfirmed && !planAwaitingAdvance`）：
  闸门全过后若 `advanceTo !== undefined && advance !== false` → 调 `applyConfirmedAdvance`；
  `advanced === true` 时再调 `applyDiveTransition(..., 'confirm-advance', {kind:'human',sessionId:windowKey},
  {stageChanged:true, status:from})`。返回体：`advanced:true`、`from`、`to`，note 前缀保留
  「已确认，未重复弹框（FR-9/FR-11）」并追加「；已自动推进：<from> → <to>」。
  **两处闸门失败返回体一字不动**（`gate_failure` + 「未推进」文案 + 「仍有 N 份未登记」）。
- **怎么验收**：TC-1~TC-4。

### t3 自动确认窄口径预判
- **实施**：`src/application/internal/auto-confirm.ts` 的 `triggerAutoConfirm` 改 async；在
  `deps.questions.available()` 判定之后、**任何票登记之前**加预判（`input.target === 'artifact'` 且
  `advanceTargetFor(req.status) === 'design'` ⇒ `applyRequirementWorkspaceRoot` + `checkPrototypePresenceGate`，
  不过则 `{triggered:false, reason: gate.message}`）。`src/application/use-cases/SubmitArtifact.ts` 两处调用点
  改 `await`，`reason` 进回执 note。**不动** `kind=prototype` 的 `{triggered:false, reason:'…无需人工确认…'}`
  既有形状。
- **怎么验收**：TC-5/TC-7 + output-contract 面。

### t4 回归用例与既有期望修正
- **实施**：新建 `tests/confirm-advance-deadlock.test.ts`（顶部 `serves: FR-1, FR-2, FR-3`），按
  `design/test-cases.md` 的 7 条用例写；断言一律读回台账。改 `tests/design-gate-messages.test.ts` 的
  「全部落章且磁盘无新增」例：`advanced` 期望改为 `true` 并补状态前进断言，其余断言逐字保留。
- **怎么验收**：两条命令绿 + 四条反向验证必红。

### t5 全量回归与基线对账
- **实施**：`pnpm typecheck`、`pnpm test`；与 `.dsh-data/baseline-cases.txt` 求差集。
- **怎么验收**：见任务表 t5 三条锚点；新增失败必须为 0（若为既有失败需逐条给出与基线同名的证据）。
