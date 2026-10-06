# 测试用例（REQ-261005213603-eaed）

> 本文件是**任务 ↔ 用例 ↔ 条款**的追溯标注口（RTM 测试覆盖度门禁只认 `covers:` / `validates:` 标注）。
> 实跑输出与断言原文见 `tests/test-evidence.md` 与 `design/test-cases.md`（设计侧 25 条编号口径）。
> 用 `## TC-N:` 标题分节，每节一行 `covers:` 列被它验证的任务 id、一行 `validates:` 列条款号。

## TC-1: 判据真值表（设计 TC-1～TC-10，`tests/client-session-running.test.ts`）

covers: t-ff7d59, t-719d80, t-11b442, t-630b98
validates: FR-1, FR-2, FR-5

- 断言要点：新鲜 / 缺键 / `null` / 字符串 / `NaN` / `Infinity` / 恰好阈值 / 未来时间 / 显式 `staleMs` /
  成因优先级（会话优先）/ 都不成立返回 `undefined` / `requirementBusy` 与 mark 恒一致。
- 实跑：`npx vitest run tests/client-session-running.test.ts` → 28 passed。

## TC-2: 渲染与位置契约（设计 TC-11～TC-18，`tests/client-view.test.ts`）

covers: t-787d69, t-93a02b, t-ff655e, t-4f7271, t-6b405f
validates: FR-1, FR-3, FR-4, FR-5

- 断言要点：锁新鲜出圈且文案为「后台 run 进行中」/ 双成因恰一个圈且报会话成因 / 恰好过期不出 /
  省略参数与空集版本逐字节一致 / A、B 需求不串 / 列表行 ID 单元格内出圈且标题列不出 /
  位置契约（紧跟 REQ id）/ 样式分片仍在。
- 实跑：`npx vitest run tests/client-view.test.ts` → 69 passed。

## TC-3: 实时增隐（设计 TC-19～TC-22，`tests/board-attach.test.ts`）

covers: t-66ef12, t-1d2f56, t-5415a6, t-dbd1e9
validates: FR-4, FR-5

- 断言要点：锁写入后投一帧 `/state` 变更即出圈 / 锁清除或过期后下一帧圈灭 /
  无关会话 `running` 抖动不额外重绘 / `dispose` 后迟到的状态帧不重绘也不抛错。
- 实跑：`npx vitest run tests/board-attach.test.ts` → 17 passed。
- 逆向验证（红-绿）：忽略推进锁 → 三个文件共 10 项变红；阈值运算符改 `<=` → TC-4/TC-9/TC-13 变红；
  复原后 114 项全绿。

## TC-4: 旧红线取代标注（设计 TC-23～TC-25，grep 探针）

covers: t-d8d6b7, t-5c2c94, t-dd8893
validates: FR-6

- 断言要点：`docs/architecture/client-running-indicator.md` 命中新需求号（3 处）与
  `283d/design/data-model.md`（2 处）；`executions[].outcome` 的禁用表述仍在（2 处）；
  三处文档 `git diff --numstat` 均为纯新增（历史原文保全）。
- 实跑：`grep -c` 三条命令，输出 3 / 2 / 2。

## TC-5: 兼容、回滚与交付基线（t5 卡证据）

covers: t-eea3c3, t-a50079, t-f3efb4, t-a7386b
validates: FR-2, FR-4, FR-5

- 断言要点：无 `advanceLockAt` 载荷逐字节一致（旧服务端）；回退 5 处源码 hunk + 3 个测试文件后
  构建仍 `[verify-client] OK`、typecheck 0、三文件 91 项全绿（可逆、无残留）；
  交付基线 typecheck 0 / build OK / `pnpm test` 68 failed = 基线 68。
- 实跑：见 `tests/test-evidence.md` 第三节与第五节。

## 覆盖度小结

| 任务 id | 覆盖它的用例节 |
|---|---|
| t-ff7d59, t-719d80, t-11b442, t-630b98 | TC-1 |
| t-787d69, t-93a02b, t-ff655e, t-4f7271, t-6b405f | TC-2 |
| t-66ef12, t-1d2f56, t-5415a6, t-dbd1e9 | TC-3 |
| t-d8d6b7, t-5c2c94, t-dd8893 | TC-4 |
| t-eea3c3, t-a50079, t-f3efb4, t-a7386b | TC-5 |

20 / 20 任务有对应测试节（100% ≥ 80% 门禁）。
