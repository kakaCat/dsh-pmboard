# t-30abd6 零变更核验 + 全量回归 + 回滚路径演练（兼容卡）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
零变更核验 + 全量回归 + 回滚路径演练（兼容卡）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run 失败集合与基线逐一对齐（49/98）且通过数 2991→3001；npx tsc --noEmit 197=197（后续解锁修复后 194）；回滚演练实测：破坏锚点 4 红 → 还原 10 绿；pnpm build exit 0 且 dist 含改动。

## 实施方案（implementation）
① tests/arg-guidance.test.ts 的 TC-5 零变更用例：断言 reqboard_task_report 入参字段名/必填集合与返回体 schema 键集合与 data-model.md §3 表一致。② 全量回归：开工基线 49 文件 / 98 用例失败、tsc 197 错误（见 notes/baseline-2026-10-02.md），改动后比对。③ 回滚演练：破坏锚点 → 用例红 → 还原。④ 基线数字写进完工记录。

## 上游产出摘要（dependsSummary）
- 同类长文本工具接入同一约定 + 遍历覆盖用例
- 实施片段加「汇报自检」并按 C-16/C-17 重生成校验

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T04:09:30.687Z，窗口 session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612）

这张卡做完，这次改动有可复核的底账：失败数与基线逐一对齐，回滚路径也演练过

### 完成项

- 全量失败 49 文件 / 98 用例 = 基线，通过 2991→3001
- tsc 197 = 基线（解锁修复后 194，零新增）
- 回滚演练：破坏锚点 4 红 → 还原 10 绿
- pnpm build exit 0，dist 已含改动

### 改动文件

- `tests/arg-guidance.test.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

交验收：把命令与结果写进验收材料

---
