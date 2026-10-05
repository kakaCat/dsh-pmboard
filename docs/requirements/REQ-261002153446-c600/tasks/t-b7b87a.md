# t-b7b87a 兼容与回归：旧客户端语义、幂等、类型与客户端构建

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
兼容与回归：旧客户端语义、幂等、类型与客户端构建

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts 全绿（0 failed）；npm run typecheck 无新增错误；pnpm build:client 输出含 [verify-client] OK；docs/requirements/REQ-261002153446-c600/tests/test-evidence.md 存在且含命令与输出摘要

## 实施方案（implementation）
① tests/session-jump.test.ts 补 TC-4（未归档 sid 的时间线不含 unarchive，顺序与既有断言一致）；② 跑 npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts 全绿；③ npm run typecheck 与 HEAD 基线比对（不得新增错误）；④ pnpm build:client 必须输出 [verify-client] OK（规范 C-12）；⑤ 证据写进 docs/requirements/REQ-261002153446-c600/tests/test-evidence.md

## 上游产出摘要（dependsSummary）
- 点之前就看得见会发生什么：chip 与失败提示的文案

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T07:41:57.691Z，窗口 session-4c565f55-a7af-4e7f-8b37-5033c0c2a255）

这一步做完：这次改动可以放心用——旧客户端（不支持取消归档）不会被打坏而是照旧给明确提示，恢复动作失败也不会假装跳转；单测、全量比对、类型与客户端构建四道都过，证据留档可复核

### 完成项

- 目标用例 29 passed / 0 failed（含 TC-4 未归档零副作用）
- 客户端面 4 文件 95 passed（无回归）
- 全量 97 failed / 3030 passed，低于基线 106，且失败零命中本次改动文件
- typecheck 187 错误（低于基线 223），改动文件零错误
- build:client [verify-client] OK
- 证据 docs/requirements/REQ-261002153446-c600/tests/test-evidence.md

### 改动文件

- `docs/requirements/REQ-261002153446-c600/tests/test-evidence.md`
- `tests/session-jump.test.ts`

### 下一步

需求进入验收（accepting）

---
