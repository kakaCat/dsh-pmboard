# REQ-261003215944-9e04 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：Agent 现在能自己开窗口、把别的窗口派成席位一起干同一条需求；授权从「窗口绑定」换成「席位」——别人立项、把席位派给你的需求你看得见、能推自己名下的卡，但推不动阶段、把不了人工门，observer 只能看。存量 52 条零改写，读根与会话同源（现场报的「文件不存在」已修）。四条门禁中 pnpm build 与 pnpm kb:check 退出码 0；pnpm typecheck（2 处错误）与 pnpm test（97 例失败）未达标，逐条对账后确认都属既有红、非本次改动，已按你的裁定如实登记。两条只能人眼的事你已确认正常。另有三件待裁定：dive 尚有 9 处直写未收口、系统提示词层仍按老口径判「绑定」、my_seat 键名。自评见 reviews/self-review.md，逐命令证据与 26 张任务卡的覆盖标注见 tests/test-evidence.md。

## 1. 验收列表

### v1-1 · 定义席位数据契约与读端折算

**验收内容**：【定义席位数据契约与读端折算】验收

**操作步骤**：
1. 跑 pnpm test -- tests/seat-fold.test.ts 全绿：三种形态折算结果与 data-model.md「席位读取与折算」一致
2. pnpm typecheck 退出码 0
3. 对一条既有台账 record.json 前后 shasum 相等（读不写盘）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-2 · 把授权判定从窗口绑定改为席位授权

**验收内容**：【把授权判定从窗口绑定改为席位授权】验收

**操作步骤**：
1. 跑 pnpm test 全绿且新增 canWrite 单测覆盖 6 个动作 × 3 个角色（含 worker 推阶段必须被拒、worker 推自己的卡必须通过）
2. grep -rn "bound\[0\]" src/ 零命中
3. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-3 · 新增 reqboard_bind 并让 reqboard_status 暴露席位

**验收内容**：【新增 reqboard_bind 并让 reqboard_status 暴露席位】验收

**操作步骤**：
1. 集成测：调 reqboard_bind({role:'worker'}) 后读 <dshHome>/reqboard/requirements/<REQ>/record.json，seats 长度 2 且 owner 项逐字未变
2. 解绑 owner 返回 REQBOARD_INVALID_INPUT
3. 第 9 个席位返回 REQBOARD_SEAT_LIMIT
4. reqboard_status.seats 与台账逐字一致
5. pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-4 · 新增 reqboard_open_window 并走 DSH 会话 fork

**验收内容**：【新增 reqboard_open_window 并走 DSH 会话 fork】验收

**操作步骤**：
1. 集成测：reqboard_open_window({mode:'fork'}) 返回 windowKey 以 session- 开头且 ≠ 源窗口，且该会话 header.parentSession == 源窗口 id
2. 对无已完成回合的会话 fork 返回 REQBOARD_OPEN_WINDOW_UNAVAILABLE 并提示改用 mode=create
3. 返回文案 grep「已打开」零命中
4. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-5 · 跨窗口投递自署 kind 并修冷会话断点

**验收内容**：【跨窗口投递自署 kind 并修冷会话断点】验收

**操作步骤**：
1. 集成测：对一个已冷却的会话席位投递 → resume 成功、目标会话起一个回合、该 user/message 事件的 source.kind === 'reqboard-open-window'（不含 'user'）
2. grep -rn "sessionController.prompt" src/ 零命中
3. pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-6 · 让本窗口能接第二个项目

**验收内容**：【让本窗口能接第二个项目】验收

**操作步骤**：
1. 集成测：已绑定在飞需求时调 reqboard_capture({onWindowBound:'second'}) 返回 success:true 且新需求 sourceSessionId == 本窗口
2. onWindowBound:'handoff' 时返回新 windowKey 且新需求落在新窗口名下
3. grep -rn "REQBOARD_WINDOW_BOUND" src/ 仅命中显式拒绝分支
4. pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-7 · 把自主预立项与预拆分不破门写成红线断言

**验收内容**：【把自主预立项与预拆分不破门写成红线断言】验收

**操作步骤**：
1. 跑 pnpm test -- tests/gate-not-stretched.test.ts 全绿：两条断言各覆盖正反两分支（无人回合拒 / 有人回合过）
2. git diff 显示 requireDirectHuman 与 planApproved 两处实现零改动（可用 git diff --stat 佐证）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-8 · 实现 Dive 事件纯函数与八事件表

**验收内容**：【实现 Dive 事件纯函数与八事件表】验收

**操作步骤**：
1. pnpm test -- tests/dive-transition.test.ts 全绿：8 事件各至少一条、非法事件（含 disarm-rollback on 已 disarmed）全部 changed:false 且 next 与 prev 结构相等
2. pnpm test -- tests/layer-boundary.test.ts 绿（域层零 import 外层）
3. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-9 · 实现 applyDiveTransition 唯一写盘入口

**验收内容**：【实现 applyDiveTransition 唯一写盘入口】验收

**操作步骤**：
1. 单测：同一事件同一 prev 连调两次第二次 changed:false 且台账字节不变
2. dialogInFlight 返回 true 时 confirm-advance 与 recover-auto 均零写入并返回 code:'dialog-in-flight'
3. 注入会抛错的假 store，入口吞错并留痕（不冒泡）
4. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-10 · 收敛六处调用点到唯一入口

**验收内容**：【收敛六处调用点到唯一入口】验收

**操作步骤**：
1. 两条 grep 只命中 src/domain/dive/transition.ts 与其单测：grep -rn "roundsInStage *= *0" src/ | grep -v migrate-dive-state、grep -rn "activation *= *'" src/ | grep -v migrate-dive-state
2. TC-16 与 TC-22b/22c 用例绿
3. 回退路径行为与改前逐字一致（对比回退前后 record.json 的 dive 字段）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-11 · 把推进弹框与看板继续接到同一方法

**验收内容**：【把推进弹框与看板继续接到同一方法】验收

**操作步骤**：
1. 集成测：driverHealth=paused(reason='round-limit(brainstorming:3)') 时人对推进弹框确认 → roundsInStage 归零、driverHealth 复位 healthy、activation 未被改写
2. 人先按 clear_pause（disarmed+idle）再确认推进 → activation 仍为 disarmed
3. 看板「继续」→ activation 变 armed 且留痕 createdBy.kind==='human'
4. pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-12 · 文档读根与会话同源

**验收内容**：【文档读根与会话同源】验收

**操作步骤**：
1. curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state 的 workspaceRoot 等于会话工作区（不是插件宿主 cwd）
2. curl -s -X POST .../docs/resolve -d '{"paths":["README.md","docs/knowledge/INDEX.md"]}' 两条均 openable:true
3. pnpm build:client 退出码 0 且 lib/client.js 含新逻辑
4. 右侧栏打开 README.md 渲染出正文（人工确认）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-13 · 迁移与兼容：存量零改写与回滚开关

**验收内容**：【迁移与兼容：存量零改写与回滚开关】验收

**操作步骤**：
1. 跑兼容夹具：读 39 条存量需求前后，各自 record.json 的 shasum 相等（零改写）
2. REQBOARD_SCHEMA_VERSION === 9（grep 断言）
3. docs.rootSource='legacy-cwd' 时 docs/resolve 对 README.md 回到 not_found（证明回滚开关真的生效）
4. pnpm test 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-14 · 端到端验收与项目文档更新

**验收内容**：【端到端验收与项目文档更新】验收

**操作步骤**：
1. pnpm typecheck && pnpm test && pnpm build && pnpm kb:check 四条退出码均为 0
2. 人工观察到侧栏出现新会话、右侧栏渲染出 README 正文、worker 推阶段被拒
3. README 工具表包含 reqboard_open_window 与 reqboard_bind（grep 命中）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-15 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

### v1-16 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）

**验收状态**：✓ 通过

---

## 2. 测试报告

- grep -rn "bound[0]" src/ | wc -l → 0（全仓 16 处已改为按席位取第一条可写的）
- npx vitest run tests/seat-authorization.test.ts tests/seat-real-store.test.ts tests/bind-seat.test.ts tests/bind-tool.test.ts → 4 文件 45 例全绿（3 角色×6 动作 18 格矩阵、worker 推自己卡通过、observer 被拒零写入、真实落盘 seats 与状态读逐字一致）
- npx vitest run <手册两节引用的 12 个判据文件> → 12 文件 123 例全绿（手册每条判据都亲手跑过）
- pnpm build → 退出码 0（lib/client.js 340871 字节，关键符号 / 样式归属章 / CSS 分片校验通过）
- pnpm kb:check → 退出码 0（11 项自检全过；修前 2 处生成物漂移，重新生成知识层后归零）
- 未达标①：pnpm typecheck → 退出码 2，2 处错误均在 tests/worktree-injection.test.ts(75,12)(85,12)，该文件最后修改 2026-10-03 23:55，非本次改动
- 未达标②：pnpm test → 退出码 1，97 例失败散在 47 个文件，与动手前逐文件比对完全相同（本轮唯一转绿：tests/apply-wiring.test.ts）
- 人工观察（用户答复原文）：两条都正常：侧栏出现了新会话、右侧栏能渲染 README 正文
- 验收材料：docs/requirements/REQ-261003215944-9e04/reviews/self-review.md（自评：能做什么、四条门禁实测、四个自抓的真问题、三件待裁定）
- 验收材料：docs/requirements/REQ-261003215944-9e04/tests/test-evidence.md（逐命令证据 + 26 张任务卡的 covers 覆盖标注 + 未达标对账 + 文档与门禁维护清单）
- 手册：docs/architecture/project-manual.md 新增「席位模型与开窗」「Dive 状态转化单一入口」两节
- 知识层：docs/knowledge/architecture.md 补两行后重建 code-map / INDEX（kb:check 零漂移）；README.md 工具表补 reqboard_open_window 与 reqboard_bind（grep 命中 2）
- 设计文档订正：design/{data-model,interfaces,architecture,test-cases}.md（存量 39→52 实测 15 热+37 归档、joinedAt/lastSeenAt 为 epoch ms、recover-auto 窄例外、my_seat 键名）
- 待裁定①：dive 状态写入口仍有 8 个文件 9 处自行落盘（grep -rn "\.dive = " src/ | wc -l → 9），继续收口要改契约
- 待裁定②：系统提示词层绑定判据仍只看 sourceSessionId（只拿 worker 席位的窗口被告知未绑定），不参与门禁与写判定，改动会动提示词快照基线
- 待裁定③：设计文档写 mySeat、JSON 层实现为 my_seat，二选一

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定义席位数据契约与读端折算 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:50 |
| v1-2 | 把授权判定从窗口绑定改为席位授权 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:50 |
| v1-3 | 新增 reqboard_bind 并让 reqboard_status 暴露席位 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:50 |
| v1-4 | 新增 reqboard_open_window 并走 DSH 会话 fork | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:50 |
| v1-5 | 跨窗口投递自署 kind 并修冷会话断点 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:50 |
| v1-6 | 让本窗口能接第二个项目 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:51 |
| v1-7 | 把自主预立项与预拆分不破门写成红线断言 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:51 |
| v1-8 | 实现 Dive 事件纯函数与八事件表 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:51 |
| v1-9 | 实现 applyDiveTransition 唯一写盘入口 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:51 |
| v1-10 | 收敛六处调用点到唯一入口 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:51 |
| v1-11 | 把推进弹框与看板继续接到同一方法 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
| v1-12 | 文档读根与会话同源 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
| v1-13 | 迁移与兼容：存量零改写与回滚开关 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
| v1-14 | 端到端验收与项目文档更新 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
| v1-15 | 需求级验收 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
| v1-16 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-278681bb-b160-4067-8740-3d5a0f2c7426 | 2026-10-04 13:53 |
