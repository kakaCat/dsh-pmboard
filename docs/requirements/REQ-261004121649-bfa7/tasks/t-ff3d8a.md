# t-ff3d8a 老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) 造一条无 `rollback` 元信息的旧卡（只有 `reworkOf`）→ 清理入口能匹配并取消，且回执里 `matchedBy: "reworkOf+title-prefix"`（**如实说明匹配方式**）；2) 造一条既无 `reworkOf` 也无前缀的卡 → 不取消、回执里列入 `skipped` 并说明原因；3) `npx tsc --noEmit` 错误数 ≤ 基线。

## 实施方案（implementation）
清理入口对「无 `lastMaterialized` 记录」的需求走兜底路径：按 `reworkOf` + 标题前缀匹配候选，**逐条**在回执里给出 matchedBy/skipped 及原因；不做模糊删除。文档：把这条口径写进 design/data-model.md 对应的兼容节（已写，实施时核对一致）。

## 上游产出摘要（dependsSummary）
- 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T08:55:30.543Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

老数据也能被清掉，而且清的时候告诉你它是猜的。这一步做完，什么变了——没有「这次物化了哪些卡」记录的旧需求，按「有 reworkOf 且标题带 [重做]」兜底匹配，回执如实承认这是猜的并逐条给出跳过原因；同时修掉一个死结：旧记录没有回退序号，原先把序号当硬门会把这些需求永远挡在清场之外。

### 完成项

- 旧数据兜底可用：无物化清单时按「reworkOf 非空 + 标题带 [重做] 前缀」匹配，回执如实给 matchedBy 与逐条跳过原因
- 修掉一处会让兜底永远走不到的死结：存量记录的 rollback 没有 seq，原序号校验会一律拒绝；已改为「记过序号才校验」
- 回执诚实性可核对：matchedBy / skipped / note 三项都在响应体里，兜底时明说可能多算或少算
- 实测存量形状并入档：全仓 22 条需求 20 条无 rollback、2 条为旧形状；0fbf 56 张重做卡中仅 17 张两条件齐备，另 39 张无 reworkOf 且早已 canceled
- 设计文档同步：data-model §三 写清两个条件同时成立、序号校验边界与三条实测数字
- 自测：tests/rollback-cleanup.test.ts 12 passed；全量 96 failed / 4015 passed（失败数与基线逐字相等）

### 改动文件

- `src/application/internal/rollback-cleanup.ts`
- `src/application/use-cases/RollbackCleanup.ts`
- `tests/rollback-cleanup.test.ts`
- `docs/requirements/REQ-261004121649-bfa7/design/data-model.md`

### 下一步

关闭父卡（本汇报即为凭证）

---
