# t-b6ca79 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -n "role" src/http/routers/tasks.ts 显示 transitionTask 调用带 role；pnpm vitest run tests/http-task-move-role.test.ts 通过：子卡非法转移被拒且字段零改动、存量卡老路径放行

## 实施方案（implementation）
① src/application/internal/task-transition.ts 新增导出 roleOfTask(task, tasks)：parentId 非空→subtask；有子卡→parent；否则 legacy（与 MoveTask.ts:232 roleOf 同口径）。② src/http/routers/tasks.ts handleTaskMove 的 mutate 回调内 transitionTask 调用加 role: roleOfTask(task, tasks)。③ 新建 tests/http-task-move-role.test.ts（harness 参照 tests/canceled-internal-collect.test.ts 对 routers/tasks 的直调）：子卡→integrating/testing/in_review 抛 invalid_transition 且字段零改动；存量卡 todo→in_progress→testing 放行；父卡合法边放行

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T12:00:29.409Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

FR-2 交付：看板推子卡进非法态被代码级拒绝

### 完成项

- H2-role 修复：新增 roleOfTask 单源（task-transition.ts）
- routers/tasks.ts handleTaskMove 传 role
- 回归：新建 tests/http-task-move-role.test.ts 4 条全绿
- 反证：移除 role 后 3 条失败

### 改动文件

- `src/application/internal/task-transition.ts`
- `src/http/routers/tasks.ts`
- `tests/http-task-move-role.test.ts`

### 下一步

无（待链尾总验收卡收口）

---
