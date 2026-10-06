# t-1c8e8d 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
命令 npx vitest run tests/pending-guard.test.ts 退出码 0；断言：① prototype 票与「有门但无产物」票的拒绝原文不含「看板点确认」、含缺产物说明；② kind=verification 且有产物的票的原文含「看板点确认」且含失效时刻；③ artifactNotifyText(req, {kind:'prototype'}) 不含「一键确认」且含「无需人工确认」；④ reqboard_status 的 pending_confirms[] 五项新键在场且旧键逐字未变。逆验证 N4（文案固定三条出路）打红①、N5（通知无条件输出确认入口）打红③。

## 实施方案（implementation）
① src/application/internal/pending-guard.ts：新增 pendingConfirmFactsOf(req, rec, now)（requirementStatus / gate / artifactCount / expiresAt = (interruptedAt ?? createdAt) + LIMITS.pendingConfirmTtlMs / usableRecovery[]）与 pendingConfirmRejectMessage(p, facts?)（缺省 facts 时逐字保持旧文案，兼容既有调用点）；usableRecovery 只列真实出路：①取回执恒定；②「看板点确认」仅当 hasConfirmGateOf；③「重新发起覆盖」仅当目标需求是本窗口进行中需求且产物在册；产物数为 0 时附「先登记产物」，目标需求非本窗口/终态时附「agent 侧无法覆盖，请人点看板或等失效」。② src/application/use-cases/ConfirmReceipt.ts 的 receiptNote 接同一 facts。③ src/application/internal/artifact-gates.ts 的 artifactNotifyText 改为门感知（无门产物写「无需人工确认（登记即生效）」）。④ src/tools/StatusTool/StatusTool.ts 的 pending_confirms[] 追加 requirement_status / gate / artifact_count / expires_at / usable_recovery 五键（schema 与投影同改，旧键不动）。

## 上游产出摘要（dependsSummary）
- 加守卫两谓词与判定序：无门/无产物的票不拦写路径

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T12:21:00.446Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t3 完成：被拦时能看到「为什么、卡在哪份产物、何时失效、哪条路真的通」，且四条消费点同源。

### 完成项

- 新增 facts 单点（pendingConfirmFactsOf）：需求状态 / 是否有门 / 在册产物数 / 失效时刻 / 真实可用出路
- 拒绝原文带因果与真实出路；缺省 facts 时逐字保持旧文案（兼容既有调用点）
- 回执未确认时补可用出路；登记通知门感知（无门不写确认入口）
- status 投影追加五键，看板缺口 why 同源；schema 同步声明
- 证据：四套件 61 例全绿（pending-guard 20 / integration 8 / ask-confirm-pending 13 / submit-prototype 20）
- 逆验证 N4 / N5 真跑必红并逐字节还原；npx tsc --noEmit → 退出码 0

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

t4 开工：探针转正 + 六条逆验证 + 全量基线比对。

---
