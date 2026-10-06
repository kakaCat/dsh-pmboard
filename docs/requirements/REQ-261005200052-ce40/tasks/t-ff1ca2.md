# t-ff1ca2 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路·研发

> 需求：REQ-261005200052-ce40 拦截要讲清理由：REQBOARD_CONFIRM_PENDING 必须说清为何被拦、拦的是谁、哪条出路真的通

## 在做什么
诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T12:20:46.454Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t3 研发段：加诊断单点（为什么被拦 + 真实可用出路），四处文案与 status 投影共用它；拦截口径未动。

### 完成项

- pending-guard 新增 PendingConfirmFacts 与 pendingConfirmFactsOf 单点：需求状态 / 是否有门 / 在册产物数 / 失效时刻 / 可用出路
- usableRecovery 按可用性生成：①恒有；②③仅当有门且在册；无产物附「先登记产物」，终态附「agent 侧无法覆盖」
- pendingConfirmRejectMessage 支持 facts：缺省逐字保持旧文案，带 facts 时输出需求状态、target/kind、在册份数与真实出路
- assertNoPendingConfirm 接 facts（台账读不到则退回旧文案，不伪造诊断）
- ConfirmReceipt 的 receiptNote 未确认时追加可用出路（已确认不追加）
- artifactNotifyText 门感知：无门产物写「无需人工确认（登记即生效）」，有门照旧写确认入口
- QueryState 的 pending_confirms[] 追加五键；QueryReport 的缺口 why 用同一份 facts；StatusTool schema 同步声明五键
- 证据：npx vitest run pending-guard + pending-guard-integration + ask-confirm-pending + submit-prototype → 61 例全绿
- 逆验证 N4（固定三条出路）打红 3 例、N5（通知无条件写确认入口）打红 1 例，均逐字节还原
- npx tsc --noEmit -p tsconfig.json → 退出码 0
- 改既有测试 2 处并说明：集成用例的固定文案常量加「可用出路」后缀（FR-3 的契约变更，前缀仍精确断言），非放宽

### 改动文件

- `src/application/internal/pending-guard.ts`
- `src/application/internal/support.ts`
- `src/application/internal/artifact-gates.ts`
- `src/application/query/QueryState.ts`
- `src/application/query/QueryReport.ts`
- `src/application/use-cases/ConfirmReceipt.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `tests/pending-guard.test.ts`
- `tests/pending-guard-integration.test.ts`

### 下一步

复核段：核对四处文案同源与旧键未变（N4/N5 已跑）。

---
