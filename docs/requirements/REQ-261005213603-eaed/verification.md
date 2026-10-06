# REQ-261005213603-eaed 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：看板运行圈判据扩为「会话回合 ∪ 新鲜推进锁」：后台跑子卡链的 run 也点亮圆圈。改动全在 client（5 源文件 + 3 用例文件 + 3 处文档取代标注），host/台账/协议零改动，视觉零变化（仅 title/aria 分成因）。证据：TC-1～TC-22 共 114 项全绿；typecheck 0；client 构建 [verify-client] OK；pnpm test 68 failed = 基线 68（失败文件集合逐文件 diff 为空）；两次逆向验证证明用例可证伪；真实载荷端到端四条通过；回滚演练可逆无残留；测试覆盖度 20/20 任务。已知限制：残锁最多误亮 15min（与 host 同阈值）、浏览器探针并行抖动（单跑通过）、UI 卡原型锚点门禁缺口按人裁定 fullstack 绕行并建议另立需求、6 步人工 E2E 需人在浏览器执行。

## 1. 验收列表

### v1-1 · 定义判据契约与客户端类型声明

**验收内容**：【定义判据契约与客户端类型声明】验收

**操作步骤**：
1. ① npx vitest run tests/client-session-running.test.ts 退出码 0，且含真值表断言：缺键 / null / 字符串 / NaN / Infinity → false
2. 恰好 now-15min → false
3. 未来时间 → true
4. 显式 staleMs=1000 生效
5. 成因优先级 session > run
6. 都不成立 → undefined
7. requirementBusy 与 requirementRunningMark 在四组输入下结论恒一致。② pnpm typecheck 退出码 0。③ grep -n "advanceLockStaleMs" src/client/session-running.ts 命中，且同文件内不存在 15 * 60_000 一类 stale 字面量（第二处口径 = 缺陷）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-2 · 把新判据接进渲染单点与两处视图

**验收内容**：【把新判据接进渲染单点与两处视图】验收

**操作步骤**：
1. ① npx vitest run tests/client-view.test.ts 退出码 0，且含断言：锁新鲜（now-60s）→ 卡面出现 data-running="true" 且 aria-label="后台 run 进行中"（TC-11）
2. 会话在跑且锁也新鲜 → data-running 计数恰 1 且 aria-label="会话进行中"（TC-12）
3. now-15min → 不含 data-running（TC-13）
4. 需求无 advanceLockAt 且省略 running 参数时 buildBoard 输出与空集版本逐字节相等（TC-14）
5. 同页 A 持锁 B 不持锁 → 只有 A 出圈（TC-15）
6. 列表行同款且标题列不含 data-running（TC-16/TC-17）
7. BOARD_CSS 仍含 .dsh-pm-running 与 @keyframes dsh-pm-running-spin（TC-18）。② pnpm build:client 输出 [verify-client] OK。③ pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-3 · 补判据真值表与实时增隐测试

**验收内容**：【补判据真值表与实时增隐测试】验收

**操作步骤**：
1. ① npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts 退出码 0，且 TC-1～TC-22 每条断言都有对应用例（逐条点名可见）。② 逆向验证：把 session-running.ts 里 (now - lock) < staleMs 改成 <= 后重跑，TC-4 与 TC-13 必红（判据真的在判）。③ pnpm test 全量失败集合与改动前基线相比不新增。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-4 · 在旧红线处标注取代关系

**验收内容**：【在旧红线处标注取代关系】验收

**操作步骤**：
1. ① grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md docs/requirements/REQ-261004210128-283d/design/data-model.md 两处均命中（TC-23/TC-24）。② grep -n "executions\[\].outcome" docs/architecture/client-running-indicator.md 仍命中（TC-25：执行记录判据未被解禁）。③ git diff --stat 显示改动仅新增标注行（283d 两份文档的既有结论段落零改动）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-5 · 核验兼容、回滚与交付基线

**验收内容**：【核验兼容、回滚与交付基线】验收

**操作步骤**：
1. ① 无 advanceLockAt 载荷下渲染输出与改动前逐字节一致（diff 为空）且 buildBoard(state, 1) 不含 data-running。② 回滚演练：回退两文件改动后 pnpm build:client 输出 [verify-client] OK、退出码 0。③ 交付基线三项：pnpm typecheck 退出码 0
2. pnpm build:client 退出码 0
3. pnpm test 失败集合不新增（逐项给出改动前/后计数）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：本需求已豁免原型（理由：本需求零可视变化——运行圈复用既有 renderRunningDot，DOM/class/样式/位置一字不动，只改判据与 title/aria 文案，没有「长什么样」可画）

**操作步骤**：
1. 本需求已豁免原型（理由：本需求零可视变化——运行圈复用既有 renderRunningDot，DOM/class/样式/位置一字不动，只改判据与 title/aria 文案，没有「长什么样」可画）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 3 files passed / 114 tests passed（28 + 69 + 17）
- pnpm typecheck → 退出码 0
- pnpm build:client → [verify-client] OK bundle=630218 bytes
- pnpm test → 68 failed / 5645 passed；基线 68 failed / 5622 passed（失败数持平、失败文件集合逐文件 diff 为空）
- 逆向验证两次：忽略推进锁红 10 项；阈值运算符改 <= 红 TC-4/TC-9/TC-13；复原后 114 项全绿
- 真实 /state 载荷端到端：无锁 0 圈 / 注入新鲜锁 1 圈 / 过期回 0 / 整键删除逐字节一致
- 回滚演练：回退 5 处源码 hunk + 3 测试文件后 build OK、typecheck 0、三文件 91 项全绿；恢复后重建 114 项全绿
- 覆盖度标注：docs/requirements/REQ-261005213603-eaed/test-cases.md 的 covers 覆盖 20/20 任务（100%）
- docs/requirements/REQ-261005213603-eaed/tests/test-evidence.md
- docs/requirements/REQ-261005213603-eaed/reviews/self-review.md
- docs/requirements/REQ-261005213603-eaed/verification.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定义判据契约与客户端类型声明 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-2 | 把新判据接进渲染单点与两处视图 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-3 | 补判据真值表与实时增隐测试 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-4 | 在旧红线处标注取代关系 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-5 | 核验兼容、回滚与交付基线 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
| v1-9 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 09:14 |
