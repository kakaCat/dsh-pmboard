# 测试证据（REQ-261005213603-eaed）

> 全部命令于 2026-10-05 在本工作区（`/Users/mac/Documents/ai/dsh/dsh-pmboard`）实跑，输出为原文摘要。
> 交付态 = 五张卡全部 done 之后；基线 = 本需求改动前同一命令的输出。

## 一、本需求用例（三个文件）

```
$ npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts
 ✓ tests/client-session-running.test.ts  (28 tests)    ← 基线 17，本次 +11
 ✓ tests/client-view.test.ts             (69 tests)    ← 基线 61，本次 +8
 ✓ tests/board-attach.test.ts            (17 tests)    ← 基线 13，本次 +4
 Test Files  3 passed (3)        Tests  114 passed (114)
```

TC ↔ 文件 ↔ 断言落点：

| 用例 | 文件 | 断言要点 |
|------|------|----------|
| TC-1～TC-6 | `tests/client-session-running.test.ts` | 新鲜 / 缺键 / 非有限值 / 恰好阈值 / 未来时间 / 显式 staleMs |
| TC-7～TC-10 | 同上 | 成因优先级（会话优先）、仅锁成 run、都不成立 undefined、两导出恒一致 |
| TC-11～TC-14 | `tests/client-view.test.ts` | 锁新鲜出圈且文案为 run、双成因恰一个圈、过期不出、省略参数逐字节一致 |
| TC-15～TC-18 | 同上 | A/B 需求不串、列表 ID 单元格内出圈且标题列不出、位置契约、样式分片在场 |
| TC-19～TC-22 | `tests/board-attach.test.ts` | 锁写入后一帧刷新出圈、锁清除/过期后圈灭、无关会话抖动不额外重绘、dispose 后迟到帧不重绘不抛 |

## 二、可证伪性（两次逆向验证，跑完当场复原）

| 逆向改动 | 期望 | 实测 |
|---|---|---|
| `(now - lock) < staleMs` → `<=` | TC-4 / TC-13 必红 | 红 3 项：TC-4、TC-9、TC-13 |
| `requirementRunningMark` 忽略推进锁 | 依赖新判据的用例必红 | 红 10 项：TC-8/10/11/15/16/17/18/19/20/21 |

复原后三个文件 114 项全绿——用例确实绑在本次新能力上，不是绿灯摆设。

## 三、规范条目（C-15 / C-12 / C-14）

```
$ pnpm typecheck          → 退出码 0（零输出 = 零错误）
$ pnpm build:client       → [verify-client] OK  bundle=630218 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
$ pnpm test               → Test Files 37 failed | 448 passed | 3 skipped (488)
                            Tests 68 failed | 5645 passed | 22 skipped (5735)
```

基线对比（基线取改动前同一命令输出）：

| 口径 | 基线 | 交付态 | 结论 |
|---|---|---|---|
| 失败用例数 | 68 | 68 | 零新增 |
| 失败文件集合 | 37 个 | 37 个 | `comm -13` 逐文件 diff 为空 |
| 通过用例数 | 5622 | 5645 | +23（= 本次新增用例数） |

基线取法：逐文件只回退本需求 hunk（不 `git stash` 整份文件），保留工作区里别的窗口未提交改动。

## 四、真实载荷端到端（联调段，用宿主活接口）

```
GET http://127.0.0.1:19387/dashboard/api/reqboard/state?scope=active&limit=200
 → 需求 45 条 / 任务 1873 张 / 持 advanceLockAt 的需求 0 条
```

| 场景 | 期望 | 实测 |
|---|---|---|
| 原样载荷 | 出圈数 = 持锁需求数（0） | 0 ✓ |
| 给真实需求注入新鲜锁（now-60s） | 该卡出圈且文案为「后台 run 进行中」，全页恰 1 | 1 ✓ |
| 同一需求改成恰好过期（now-15min） | 回到 0 | 0 ✓ |
| 整键删除 `advanceLockAt`（旧服务端形态） | 0 且两次渲染逐字节一致 | 0 ✓ / 一致 ✓ |

探针脚本为临时产物（`.tmp-probe/`），跑完即删，不进产物清单。

## 五、回滚演练（可逆性与无残留）

```
回退本需求 5 处源码 hunk + 3 个测试文件后：
  pnpm build:client → [verify-client] OK（bundle 629148）
  pnpm typecheck    → 退出码 0
  三个用例文件      → 91 passed（17 + 61 + 13 = 基线计数）
恢复（5 份源码与备份逐字节一致）并重建：
  pnpm build:client → [verify-client] OK（bundle 回到 630218）
  三个用例文件      → 114 passed
```

无残留证据：改动代码零落盘（`grep` 无 `localStorage` / `sessionStorage` / `writeFile` / `indexedDB`），
不写台账、不改 schema、不需要数据回填。

## 六、未自动化的部分（如实报）

`design/test-cases.md` 的 6 步人工 E2E（跑一次自动链 → 不刷新页面看圈亮 → run 结束 ≤20s 圈灭）
需人在浏览器执行；agent 无浏览器操作能力，本文件不声称已执行。
