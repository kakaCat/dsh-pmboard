# t-eea3c3 核验兼容、回滚与交付基线

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
核验兼容、回滚与交付基线

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
① 无 advanceLockAt 载荷下渲染输出与改动前逐字节一致（diff 为空）且 buildBoard(state, 1) 不含 data-running。② 回滚演练：回退两文件改动后 pnpm build:client 输出 [verify-client] OK、退出码 0。③ 交付基线三项：pnpm typecheck 退出码 0；pnpm build:client 退出码 0；pnpm test 失败集合不新增（逐项给出改动前/后计数）。

## 实施方案（implementation）
兼容核验：用不带 advanceLockAt 的载荷跑两视图渲染断言，确认与改动前输出逐字节一致（旧服务端降级路径）。回滚演练：临时回退 src/client/session-running.ts 与 src/client/views/board.ts 的本次改动，确认 pnpm build:client 仍 [verify-client] OK，且本次不落盘 / 不改 schema（无数据残留）。交付基线：pnpm typecheck、pnpm build:client（规范 C-15 / C-12）、pnpm test 与改动前基线比对（规范 C-14，基线取改动前同一命令输出）。

## 上游产出摘要（dependsSummary）
- 把新判据接进渲染单点与两处视图

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T15:39:05.749Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

t5 完成：兼容/回滚/基线三项核验全过，回滚演练可逆且无残留

### 完成项

- 兼容核验：无 advanceLockAt 载荷逐字节一致（TC-14 + 真实载荷整键删除复验）
- 回滚演练：回退 5 处源码 hunk + 3 个测试文件后，构建 OK、typecheck 0、三文件 91 项全绿
- 恢复与重建：备份逐字节一致（5/5），bundle 回到 630218，三文件 114 项全绿
- 无残留：改动代码零落盘、不回滚任何台账数据
- 交付基线三项：typecheck 0、build:client [verify-client] OK、pnpm test 68 failed = 基线 68
- 子卡链三段（研发 → 复核 → 测试）全部走完，各有独立汇报

### 改动文件

- `src/client/session-running.ts`
- `src/client/types.ts`
- `src/client/render/dom-utils.ts`
- `src/client/views/artifacts.ts`
- `src/client/views/board.ts`
- `tests/client-session-running.test.ts`
- `tests/client-view.test.ts`
- `tests/board-attach.test.ts`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/code-map.md`

### 下一步

五张卡全绿；准备验收材料（reqboard_submit(kind=verification)）

---
