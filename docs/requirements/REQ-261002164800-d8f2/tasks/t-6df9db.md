# t-6df9db 失败与降级要响亮：无落点警告可见、文案只指可执行入口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
失败与降级要响亮：无落点警告可见、文案只指可执行入口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/landing-failure-loud.test.ts 全绿：注入落库抛错时需求状态不推进且 advance.pausedReason 非空、评论含可执行恢复入口；无落点卡场景 warning 与评论各出现一次；grep -rn REQBOARD_PLAN_REFS_MISSING src 不再命中拒绝分支。

## 实施方案（implementation）
src/application/internal/approved-plan-landing.ts 与 src/application/internal/confirm-settle.ts 的失败分支定型：落库未生效则不推进 + 系统评论 + advance.pausedReason + 告警；落库生效而收尾失败则照常推进并留痕；unrefed 非空时写需求评论并在返回体 warning 复述；审计并删除指向做不到动作的文案。验证：tests/reqboard/landing-failure-loud.test.ts。

## 上游产出摘要（dependsSummary）
- 看板「批准计划」也落库并推进，与弹框路径同结果

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T09:28:40.349Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

这一步做完，落库链上的每一次失败都有人看得见、也有真能走的下一步：卡缺引用两处点名，落库失败停手留痕并给可执行入口

### 完成项

- 卡 t-6df9db 三段子卡（研发 / 复核 / 测试）全部 done（本卡无联调段）
- 无落点警告两处可见：回执里复述 + 写一条需求评论（此前只进回执，看板查不到）
- 落库未生效：不推进 + 系统评论（含两条可执行恢复路径）+ advance.pausedReason + 告警
- 落库生效而收尾失败：照常推进并留痕（用例注入第一次推进写入失败验证，不制造半迁移态）
- 文案审计：src 内已无废弃的 REQBOARD_PLAN_REFS_MISSING 拒绝分支；恢复指引只指 reqboard_decompose / 看板拆分 / reqboard_task_refs
- 测试：landing-failure-loud 4 passed；相关面回归 221 passed / 1 failed（既有 autoRun 断言）；tsc 187 未增

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `tests/reqboard/landing-failure-loud.test.ts`

### 下一步

开工最后一张卡 t-1f9170（迁移兼容与收口：零迁移可读 + 回滚演练 + 全量基线）

---
