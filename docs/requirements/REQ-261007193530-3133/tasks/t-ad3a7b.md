# t-ad3a7b 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）·修复

> 需求：REQ-261007193530-3133 修复 reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

## 在做什么
修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）·修复

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/http-task-move-role.test.ts` → 转绿（贴命令与输出），且根因单独写明

---
## 汇报 1（2026-10-07T11:55:25.247Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

修复（FR-2）：新增 roleOfTask 单源助手，HTTP 面按角色传 role

### 完成项

- task-transition.ts 新增导出 roleOfTask(task, tasks)：subtask/parent/legacy 三态判定
- routers/tasks.ts handleTaskMove 的 transitionTask 调用补 role: roleOfTask(task, tasks)
- 与工具面 MoveTask.roleOf 同口径（单一事实源）

### 改动文件

- `src/application/internal/task-transition.ts`
- `src/http/routers/tasks.ts`

---
