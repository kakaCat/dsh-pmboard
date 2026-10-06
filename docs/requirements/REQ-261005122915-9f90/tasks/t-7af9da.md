# t-7af9da 定义占位卡判据单点（isReworkPlaceholder / liveRealCards）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定义占位卡判据单点（isReworkPlaceholder / liveRealCards）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/rework-placeholder.test.ts 全绿（含三条断言：占位卡不进 liveRealCards / canceled 不进 / 真卡进）；pnpm typecheck 退出码 0。

## 实施方案（implementation）
新增 src/domain/task/ReworkPlaceholder.ts：导出 isReworkPlaceholder(t)（判据 reworkOf 非空）与 liveRealCards(tasks)（status !== 'canceled' 且非占位），零外部依赖（层边界只许向内）。新增 tests/rework-placeholder.test.ts：断言占位卡与 canceled 卡不进 liveRealCards、普通真卡进。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:48:58.175Z，窗口 session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2）

t1 完成：新增 domain 占位卡判据单点（isReworkPlaceholder / liveRealCards）+ 8 条单测

### 完成项

- 新增 src/domain/task/ReworkPlaceholder.ts：isReworkPlaceholder（判据只看 reworkOf，标题前缀不参与）+ liveRealCards（未取消且非占位）
- 新增 tests/rework-placeholder.test.ts：8 条断言（占位卡/canceled 卡不进、真卡与 done 卡进、空串与缺键非占位、纯函数不改入参、只有占位卡时结果为空）
- npx vitest run tests/rework-placeholder.test.ts → 8 passed
- pnpm typecheck → 本次改动零新增类型错（仅剩仓库既有红：receive-mark/skills-provenance/SkillAssets/SkillWriter）

### 改动文件

- `src/domain/task/ReworkPlaceholder.ts`
- `tests/rework-placeholder.test.ts`

### 下一步

无（下游 t2/t3 已消费本判据）

---
