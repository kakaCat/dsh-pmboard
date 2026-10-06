# 拆分计划（REQ-261006164732-6503）

> **目标**：把人工确认门的生命周期收敛成单一事实源——同一道门只在一处建、只在一处落章，
> 台账首写即事实；顺带把"叫 agent 去弹框"的三处文案改成条件式。
> **做法**：12 张卡分 5 批。批次 1 立契约（只读 `findOpen` → `requestGate` 判定序）；
> 批次 2 三个建门调用点全部接线；批次 3 落章两前提 + 迟到作答中性化；
> 批次 4 文案去机制化 + 恢复指引去"覆盖"；批次 5 用例/探针/反向演练/迁移清单（含四门回归矩阵）。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。纯后端改动（`sides: [backend]`），无 UI 卡、无原型锚点。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定 |
| I-x | design/interfaces.md | 接口 / 文案契约条目 |
| A-x / G-x / B-x | design/architecture.md · data-model.md · backend.md | 架构 / 数据模型 / 后端设计条目 |
| T-x · U-x | design/test-cases.md | 测试用例组 / 单例 |
| UC-x | design/use-cases.md | 场景 |
| t-x | 本文档任务表 | 任务 |

## 变更盘点（对照需求文档 + 设计一套）

**新增**
- `src/application/internal/gate-request.ts`——建门唯一入口（`requestGate`，判定序 复用 → 早退 → 新建）。
- `src/adapters/PendingConfirmRegistry.ts::findOpen`——只读查同门未作答未过期的门。
- `recordStaleAnswer`（落 `confirm-settle.ts`）——失效门的迟到作答只留痕。
- `tests/gate-request-uniqueness.test.ts`（U1~U9）、`tests/pending-confirm-registry-findopen.test.ts`。
- `docs/requirements/REQ-261006164732-6503/notes/migration-rollback.md`、`tests/evidence.md`。

**修改**
- `internal/auto-confirm.ts` / `use-cases/AskConfirm.ts` / `use-cases/SubmitVerification.ts`——三个建门调用点改走 `requestGate`。
- `use-cases/AskConfirm.ts:242` 陈旧票清理——**分门**：同门复用（不清）、异门照清。
- `internal/confirm-settle.ts`——落章两前提（门仍 open ∧ 仍在来源阶段）+ 首写不变（`approvedAt` / `confirmedAt` / evidence 仅当为空时写）。
- `internal/pending-confirm.ts`——迟到作答路由到中性通道。
- `internal/pending-guard.ts`——recovery / 拒绝文案删「重新发起…覆盖旧记录」。
- `use-cases/SubmitArtifact.ts`——回执 note 分支（`triggered=true` 不再指向 `ask_confirm`）。
- `internal/capture-section.ts` + `domain/prompt/fragments/{decomposing/light,decomposing/heavy,brainstorming/heavy/overrides}.md` + `generated/fragments.ts`（重生成）。

**删除**
- 无源文件删除。**移除三处文案行为**：无条件"调 `reqboard_ask_confirm` 弹框"（指南两处副本 + 回执 note）、
  recovery 里的"重新发起覆盖旧记录"、以及 `AskConfirm.ts:242` 对同门旧票的 settle。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 给 PendingConfirmRegistry 加只读 findOpen | FR-1, FR-2 | I-4 + src/adapters/PendingConfirmRegistry.ts | — | D-2 | implement | backend | — | S | ① `npx vitest run tests/pending-confirm-registry-findopen.test.ts` 退出码 0 且 ≥5 例过；② 实现内不出现 settle/register/markInterrupted 调用（三处 grep 计数为 0）；③ `tests/pending-confirm-ttl.test.ts` 全绿（TTL 语义零变化） | dev,review |
| t2 | （落库后回填） | 新增 gate-request.ts 建门唯一入口（复用→早退→新建） | FR-1, FR-3 | I-1 + src/application/internal/gate-request.ts | — | D-2, D-3 | implement | backend | t1 | M | ① `npx vitest run tests/gate-request-uniqueness.test.ts` 中 U1~U5 全绿（弹框端口 1 次、票表计数不变、两次 ticket 相同）；② `npx tsc --noEmit -p tsconfig.json` 退出码 0；③ 反向验证：reused 分支改成"照旧登记"⇒ U1 必红 | dev,review |
| t3 | （落库后回填） | auto-confirm 改走 requestGate（自动弹不再重复建门） | FR-1, FR-3 | I-2 + src/application/internal/auto-confirm.ts | — | D-2 | implement | backend | t2 | S | ① `npx vitest run tests/ask-confirm-pending.test.ts` 全绿；② 新增断言：已有同门时 `triggerAutoConfirm` 返回 `triggered=false` 且弹框端口调用 0 次；③ `tests/submit-prototype.test.ts` 全绿（无门产物仍不建门） | dev,review |
| t4 | （落库后回填） | AskConfirm 改走 requestGate 且陈旧票清理分门 | FR-1, FR-2 | I-2, I-5 + src/application/use-cases/AskConfirm.ts | — | D-2 | implement | backend | t2 | M | ① `npx vitest run tests/ask-confirm-pending.test.ts tests/pending-guard.test.ts` 全绿；② 同门连调两次 ⇒ `pending_confirms` 计数不变且 ticket 相同；③ 异门实例：旧票 `outcome` 非空、新票在场 | dev,integrate,review |
| t5 | （落库后回填） | 验收门自动确认改走 requestGate（阻塞形态不变） | FR-1, FR-3 | I-2 + src/application/use-cases/SubmitVerification.ts | — | — | implement | backend | t2 | S | ① `npx vitest run tests/verification-sheet.test.ts` 全绿；② `blockers` 存在时仍不建门；③ 重复提交验收材料 ⇒ 第二次不弹框（reused） | dev,review |
| t6 | （落库后回填） | confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer | FR-4, FR-5 | I-6, G-4 + src/application/internal/confirm-settle.ts | — | D-3 | implement | backend | t4 | M | ① `npx vitest run tests/confirm-advance-deadlock.test.ts` 全绿；② 已批准计划再走落章 ⇒ `approvedAt` 与 evidence 逐字节不变；③ 需求已离开来源阶段时作答 ⇒ 台账零新时间戳、评论 +1 | dev,review |
| t7 | （落库后回填） | 迟到作答路由到中性通道（不落章不推进） | FR-5 | I-6 + src/application/internal/pending-confirm.ts | — | D-3 | implement | backend | t6 | S | ① `npx vitest run tests/gate-request-uniqueness.test.ts`（U7/U8）全绿；② 失效门作答回执 `confirmed=false` 且 note 含「已被取代 / 已推进」；③ 后台续跑路径不再调 `applyConfirmDecision`（spy 计数 0） | dev,review |
| t8 | （落库后回填） | 指南三处与回执 note 去机制化并重生成产物 | FR-3 | I-7 + src/application/internal/capture-section.ts | — | D-1, D-3 | implement | backend | t3, t4 | M | ① `node scripts/check-prompt-fragments.mjs` 退出码 0；② `triggered=true` 的 note 不含「下一步：调 `reqboard_ask_confirm`」；③ 指南三处不再出现无条件"提交后调 ask_confirm"；④ `npx vitest run tests/stage-prompts.test.ts` 全绿 | change-only |
| t9 | （落库后回填） | recovery 与拒绝文案删掉"覆盖"措辞 | FR-3 | I-7 + src/application/internal/pending-guard.ts | — | D-1 | implement | backend | t4 | S | ① `npx vitest run tests/pending-guard.test.ts tests/pending-guard-integration.test.ts` 全绿；② 文案断言：不含「覆盖旧记录」、含「取回执」与「看板」 | change-only |
| t10 | （落库后回填） | 补 U1~U9 用例与"同门唯一"探针 | FR-1, FR-2, FR-4, FR-5, FR-6 | T-2 + tests/gate-request-uniqueness.test.ts | — | D-2, D-3 | test | backend | t3, t4, t6, t7 | M | ① 该文件 9 例全绿；② 探针输出含 ref / target / createdAt 且同门计数 ≤1；③ 三条"改坏必红"在 U1/U4/U6 上真的红（记录输出后还原） | dev,review,test |
| t11 | （落库后回填） | 四门回归矩阵 + 反向演练 + 基线证据落盘 | FR-6 | T-1, T-3, T-4, T-5 + docs/requirements/REQ-261006164732-6503/tests/evidence.md | — | D-3 | test | backend | t10 | M | ① G1~G4 各一例全绿（首次照旧弹、肯定照旧推进、否定只留痕）；② `npx tsc --noEmit -p tsconfig.json` 退出码 0；③ `pnpm baseline:check` 失败用例集合差为空；④ 证据落盘含命令 + 输出摘要 | dev,review,test |
| t12 | （落库后回填） | 落盘迁移 / 兼容 / 回滚清单 | FR-6 | G-5 + docs/requirements/REQ-261006164732-6503/notes/migration-rollback.md | — | D-3 | doc | doc | t4 | S | ① 清单含零 schema 变更依据、旧调用方逐条核对（参数与返回键零变更）、回滚步骤、历史覆写记录阅读口径；② `npx vitest run tests/output-contract.test.ts` 全绿（返回键零新增） | dev,review |

- 一个任务只干一件事，标题动词开头；**落点** = 覆盖对照里出现过的编号 + 具体文件路径。
- 原型锚点列全为「—」：本需求 `sides: [backend]`，无 UI 卡（设计 A-6 已声明不做界面）。
- 工作量口径：S = 半天内 / M = 1~2 天；**本计划无 L 卡**。

**容量（`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU）**：
t1 6.3 · t2 7.1 · t3 4.1 · t4 4.9 · t5 2.5 · t6 6.6 · t7 4.1 · t8 11.2 · t9 3.5 · t10 8.8 · t11 7.5 · t12 3.2
——**全部低于 16 DU，无超容量卡**；依赖无前向引用（t1 → t2 → {t3,t4,t5} → …）。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-2, I-3, I-4, I-5（5） | B-1, B-2, B-3, B-6（4） | T-2(U1~U5), T-3(G1,G3)（2） | t1, t2, t3, t4, t5, t10（6） | ✅ |
| FR-2 | I-3, I-4（2） | B-2, B-6（2） | T-2(U9), T-3（2） | t1, t4, t10（3） | ✅ |
| FR-3 | I-1, I-2, I-7（3） | B-5, B-7（2） | T-3(G1,G2,G4)（1） | t2, t3, t5, t8, t9（5） | ✅ |
| FR-4 | I-6（1） | B-4（1） | T-2(U6,U7), T-4（2） | t6, t10（2） | ✅ |
| FR-5 | I-6, I-8（2） | B-4（1） | T-2(U7,U8)（1） | t6, t7, t10（3） | ✅ |
| FR-6 | I-8（1） | B-7（1） | T-1, T-3, T-4, T-5（4） | t10, t11, t12（3） | ✅ |
| **合计** | 8 接口 | 7 模块 | 5 组用例 | 12 任务 | **6/6 条款有主** |

## 覆盖完整性规则

1. 每行三格不许空：本计划 6 行全部有接口 + 模块 + 用例 + 接收任务，无空缺行。
2. 反向也查过：设计侧 8 条接口 / 7 条后端条目 / 5 组用例全部被上表认领，无超范围设计。
3. 每条 FR 都有卡接（FR-1~FR-6 全部命中），无孤儿条款。

## 不覆盖（明确不做，防范围蔓延）

- 不统一 G4 的 `await` 阻塞形态（登记为后续线，见设计 B-7）。
- 不做新界面、不新增门、不改门值域、不改 TTL 与宽限数值。
- 不追溯修正历史被覆写的 `approvedAt`（只保证此后不再被覆写）。
