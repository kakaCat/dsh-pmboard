# REQ-261001154450-b918 拆分计划 · 收尾门硬化 + 自动链默认开

> 目标 + 做法：把 REQ-8475 审核暴露的 5 处记账漏洞补成**代码级硬门**——验收不留白（新增 `unverified` 态、删占位兜底）、
> 系统项必处置、计划批准即自动投递一次链、节流文案给剩余秒数、挂起加 TTL、收尾闭环可判定（`closingGap`）、
> 计划 FR 引用必须落库、规范期望必须可达（kb-probe K11）。
> **零破坏性变更**：3 处新增可缺省字段 + 3 个开关即可回滚；五道人工门不动。

```
   契约先行                     实现卡                         收尾
   +----------------+   +---------------------------+   +------------------+
   | t1 门规纯函数   |-->| t2 验收收口  t3 挂起 TTL   |-->| t9 兼容回归       |
   | (unverified /   |   | t4 计划引用  t5 自动投递   |   | t10 端到端演练    |
   |  节流剩余/TTL/  |   | t6 节流文案  t7 收尾可见   |   | （本需求自己走）  |
   |  closingGap)    |   | t8 K11 规范自证            |   |                  |
   +----------------+   +---------------------------+   +------------------+
```

## 一、改动盘点

| 面 | 新增 | 修改 |
|---|---|---|
| domain | `closingGapOf`（`status/Predicates.ts`）、`isPendingExpired`（纯判定） | `workflow/AcceptanceSheetSpec.ts`（系统项判据导出）、`workflow/DoneEvidenceSpec.ts`（返回剩余毫秒）、`limits.ts`（TTL 缺省值）、`verification*` 状态联合新增 `unverified` |
| application | —— | `internal/verdicts.ts`（去占位、三态、需求级判定）、`internal/pending-confirm.ts`+`pending-guard.ts`（TTL）、`internal/plan-landing.ts`+`content-gate-wiring.ts`（refs 门禁）、`internal/confirm-settle.ts`（自动投递）、`internal/support.ts`（节流文案）、`use-cases/AcceptSheet.ts`（两问一批）、`use-cases/SubmitArtifact.ts`（plan 收 requirement_refs） |
| tools/http/client | —— | `AcceptSheetTool` / `PlanTool` / `StatusTool` 回执与 schema、只读投影 `closing_gap`+`unverified_items`、看板红标 |
| scripts | `kb-probe` K11 | `kb-conventions-sync.mts`（骨架补 `基线：` 占位） |

## 条款覆盖对照表

| 需求条款 | 接收任务 | 覆盖说明 |
|---|---|---|
| FR-1 | t1、t2、t9 | unverified 判定（domain）+ 两问裁决与去占位（用例）+ 兼容回归 |
| FR-2 | t1、t2、t9 | 系统项识别（domain）+ 无处置整批拒绝（用例）+ 兼容回归 |
| FR-3 | t1、t5、t9 | 剩余时间/投递判定（domain）+ 批准后自动投递（编排）+ 兼容回归 |
| FR-4 | t1、t6、t9 | 节流剩余毫秒（domain）+ 拒绝文案可执行（support）+ 兼容回归 |
| FR-5 | t1、t3、t9 | TTL 判定（domain）+ 挂起过期与回执（用例）+ 兼容回归 |
| FR-6 | t1、t7、t9 | closingGap 推导（domain）+ 只读投影与看板红标 + 兼容回归 |
| FR-7 | t1、t4、t5、t9 | 引用契约（domain）+ 计划引用通道与落库门禁 + 自动投递同源 + 兼容回归 |
| FR-8 | t8、t9 | K11 期望可达性（脚本门禁）+ 回归口径 |

**本轮不做**：无（8 条 FR 全部有接收任务）。

## 三、任务表

| key | 标题 | phase | 依赖 | 验收（可跑） |
|---|---|---|---|---|
| t1 | 定门规纯函数与状态契约 | implement | — | `npx vitest run tests/domain/req-b918-gates.test.ts` 全绿（unverified/系统项/TTL/closingGap 四组断言） |
| t2 | 验收裁决收口（两问一批 + 去占位 + 系统项必处置） | implement | t1 | `npx vitest run tests/accept-sheet-tool.test.ts tests/domain/acceptance-sheet.test.ts` 全绿；`grep -rn "未附实际结果" src/` 无输出 |
| t3 | 挂起确认 TTL 与过期回执 | implement | t1 | `npx vitest run tests/pending-confirm.test.ts` 全绿；假时钟超 TTL 后写路径不再被拦 |
| t4 | 计划引用通道与落库门禁 | implement | t1 | `npx vitest run tests/plan-refs.test.ts` 全绿；缺 refs 提交被拒（REQBOARD_PLAN_REFS_MISSING） |
| t5 | 批准计划后自动投递一次链 | implement | t4 | `npx vitest run tests/auto-advance-on-approve.test.ts` 全绿；投递失败回执含 dispatched:false + reason |
| t6 | 节流拒绝文案可执行化 | implement | t1 | `npx vitest run tests/done-throttle-message.test.ts` 全绿；message 匹配 `剩余 \\d+ 秒` |
| t7 | 收尾闭环可见（closingGap + 看板红标 + 下一步） | implement | t1 | `npx vitest run tests/closing-gap.test.ts tests/client-view.test.ts` 全绿；status/看板可见 archive_missing |
| t8 | kb-probe K11：规范期望可达性 | implement | — | 删掉 C-15 的基线声明 → `npx tsx scripts/kb-probe.mts` 退出码 1；补回 → 退出码 0 |
| t9 | 兼容与回归（旧台账/旧挂起/旧回执 + HEAD 基线） | test | t2,t3,t4,t5,t6,t7,t8 | `pnpm test` 失败数 ≤ HEAD 基线 106；`npx tsc --noEmit` 错误数 ≤ 223 |
| t10 | 端到端演练与验收证据 | test | t9 | `python3 docs/requirements/REQ-261001154450-b918/evidence/e2e-drill.py` 六步退出码 0，证据落 evidence/e2e-drill.txt |

## 四、红线

- 五道人工门、状态机主流程不动；老行为除新增拒绝/新增态外逐字节不变（HEAD worktree 对照）。
- 零破坏性 schema：新增字段全部可缺省，旧台账读得进。
- 失败要响亮：新增拒绝一律 `REQBOARD_*` 码 + 人话 message + 修复指引，不出现静默降级。
