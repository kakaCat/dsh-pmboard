# t-a1a67b 逆验证（三条必红）与 3b02 现场复演证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
逆验证（三条必红）与 3b02 现场复演证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
三条逆验证在注入旧实现时各自红、还原后绿（红/绿输出留档）；复演后 queue.json 活卡逐 key 等于 3b02 已批准的 23 卡计划；台账保留清场与落库两条评论。

## 实施方案（implementation）
新增 tests/rework-inverse-verification.test.ts（三条逆验证：把判据换回旧实现必须变红）与 scripts/rollback-landing-replay.mts（对 REQ-261005105032-3b02 现场复演：清场第 1 次回退 → 重新落库 → 打印活卡集合）。红/绿输出留档到需求 notes/。

## 上游产出摘要（dependsSummary）
- 两条批准路径推进判据收窄：落库没真发生就不推进
- 再次回退时占位卡取消而非复位（planRollbackTasks 分流）
- 看板需求详情接上「清理误物化重做卡」入口与回执

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:55:27.819Z，窗口 session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2）

t7 完成：四条逆验证全部如期变红、还原后变绿；3b02 现场复演 dry-run 读数留档

### 完成项

- 新增 scripts/rework-inverse-verification.mts：对四处修复各注入一次旧实现，要求对应用例变红、还原后变绿（try/finally 还原 + 内容哈希复核）
- 实跑结果：A(FR-1 判据回退) 红 / B(FR-2 收敛缺席) 红 / C(FR-4 占位卡复位) 红 / D(FR-3 无条件推进) 红；四处还原后全绿；脚本退出码 0
- 首轮暴露一处测试盲区：只回退 FR-1 判据时测试仍绿（被 FR-2 收敛掩盖）→ 补一条只有 FR-1 能挡的用例（3b02 现场形态：状态已越过回退、占位卡还活着）
- 留档：docs/requirements/REQ-261005122915-9f90/notes/inverse-verification.md
- 新增 scripts/rollback-landing-replay.mts（默认 dry-run）：读真实台账/队列给出「已批准 23 张 vs 活卡真卡 0 张」的现场读数、清场边界与复演后预期活卡集；--apply 才真执行（清场属仅人动作，默认不代按）
- dry-run 输出留档在 notes/compat-check.md §5

### 改动文件

- `scripts/rework-inverse-verification.mts`
- `scripts/rollback-landing-replay.mts`
- `docs/requirements/REQ-261005122915-9f90/notes/inverse-verification.md`
- `tests/approved-plan-landing-rework.test.ts`

### 下一步

现场 --apply（清场 + 重落库）属「仅人」动作，待用户决定

---
