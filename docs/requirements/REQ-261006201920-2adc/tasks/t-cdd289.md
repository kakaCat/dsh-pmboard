# t-cdd289 子卡落库回填接线（懒展开）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
子卡落库回填接线（懒展开）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/lazy-expand-backfill.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts 退出码 0；② 对全部 STAGE_ACCEPTANCE 阶段各展开一遍，子卡 acceptance 与 implementation 中 /<[^>]{2,40}>/ 命中数为 0；③ 父卡点名 tests/x.test.ts ⇒ 子卡标准含该路径；父卡未点名 ⇒ 含 npx vitest run tests/ 兜底且无尖括号；④ 存量卡快照前后逐字节相等；⑤ 反向演练 RV-2 两次输出留档（注释掉回填调用 ⇒ 变红，还原 ⇒ 绿）

## 实施方案（implementation）
改 src/application/internal/lazy-expand.ts 的 makeChild：先生成子卡 id（ids.task()），再以 {requirementId: parent.requirementId, taskId: 子卡 id, parentAcceptance: parent.acceptance} 调 fillStageAcceptance；回填结果同时用于 acceptance 与 implementation 里嵌入的那段验收描述（两处必须同源，不许一处回填一处原样）；回填抛错即中止落库，不留半成品。expandSubtasks 与 regenerateChain 共用 makeChild，故补链路径自动同口径。新增 tests/lazy-expand-backfill.test.ts（TC-3 / TC-4 / TC-6）；回归 tests/lazy-expand.test.ts 与 tests/regenerate-chain.test.ts。验证：npx vitest run tests/lazy-expand-backfill.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts；反向演练 RV-2：注释掉回填调用 ⇒ 「残留为 0」断言变红，还原后绿，两次输出留档。

## 上游产出摘要（dependsSummary）
- 域层契约：占位符判据与声明式回填器

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T12:51:54.892Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

t2 完成：子卡落库回填已接线并四段验收通过，新增 9 例、反向演练 RV-2 红绿两次留档。

### 完成项

- 子卡落库即无占位符：makeChild 在唯一构造点回填（父卡真实测试文件 + 需求 id + 本卡 id，取不到落声明的兜底）
- 两处同源：acceptance 与 implementation 嵌入段用同一份文本
- 补链路径同口径：expandSubtasks 与 regenerateChain 共用 makeChild
- 存量卡不追溯：历史卡里的占位符原样保留（用例断言逐字节不变）
- 目标命令全绿：3 files / 35 tests passed（含新增 9 例）
- 反向演练 RV-2：关掉回填 ⇒ 5 failed exit 1；还原 sha256 逐字节相同、复跑 35 passed exit 0
- 四段子卡链全部 done：研发 / 联调（签名 4/4、行为 5/5）/ 复核（设计 9/9 无偏离）/ 测试（集合差零新增）

### 改动文件

- `src/application/internal/lazy-expand.ts`
- `tests/lazy-expand-backfill.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv2-backfill-off.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv2-restored-green.txt`

### 下一步

批 2 第二张卡 t3（领域裁决判据）继续：域层已落，待补三个用例文件

---
