# REQ-261004111917-f473 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：插件产出的需求详情深链（/dashboard#pmboard?req=REQ-…）在当前 GUI 点得通了——宿主补 /dashboard 兼容入口把请求送回应用根并**保留片段**，客户端读片段后切到看板并定位该需求；看板已在屏时也能当场定位（新增订阅通道），不可见实例不再吃掉意图、抛错留诊断。board_link 的字段名与字符串契约一字未改，只把工具里那句说明改成现状口径（不再写「可在会话中点击跳转」）。

证据面：5 张卡全部走完研发→独立复核→测试三段；63 条新用例全绿、10 组反向演练按预期变红且文件逐字节还原；受控基线对照证明**新增失败 0**（带改动 97 vs 停用改动 98），tsc 144 与基线一致；产物已重建（dist 含兼容入口与新文案、lib 含深链与订阅逻辑、build:client 门禁 OK），并用宿主真实 webserver 起真端口在线级证明「/dashboard 走命名路由而非兜底 404」。

待人工：真机四步需在**重载插件**（或重启宿主）后执行——正在运行的进程仍是启动时加载的旧 dist，重载前 curl 仍是 404（已如实记账）。另如实报一处未覆盖：迁移未就绪的降级态下 /dashboard 仍 404（超出已确认设计覆盖面，建议另立小卡）。

## 1. 验收列表

### v1-1 · 宿主兼容入口：/dashboard 不再 404

**验收内容**：【宿主兼容入口：/dashboard 不再 404】验收

**操作步骤**：
1. npx vitest run tests/legacy-board-route.test.ts → 全绿，逐条含：GET→200 且 content-type 含 text/html、cache-control=no-store、body 含 location.replace 且同带 location.search 与 location.hash
2. POST→405 且 allow: GET, HEAD
3. 连续两次 GET 的 body 逐字节相同
4. body 不含 'REQ-' 与 'requirements' 字样。（可证伪：把 location.search/hash 从表达式里删掉 → 用例必红）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-2 · 客户端深链消费：清 hash → 定位 → 切面板

**验收内容**：【客户端深链消费：清 hash → 定位 → 切面板】验收

**操作步骤**：
1. npx vitest run tests/deep-link.test.ts → 全绿，逐条含：解析六态表（design/interfaces.md §解析规则 逐行）
2. 调用序列 clearHash→requestFocus→selectPanel
3. selectPanel 前 2 次抛第 3 次成功 → 'focused' 且 selectPanel 恰 3 次、clearFocus 0 次
4. 恒抛(maxAttempts=3) → 'failed' 且 clearFocus 1 次且 peekBoardFocus() 为 undefined
5. '#other' → clearHash/requestFocus/clearFocus/selectPanel 调用次数全 0。（可证伪：删 clearHash → 序列断言红
6. 把 requestFocus 挪到 selectPanel 之后 → 顺序断言红）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-3 · board-focus 订阅通道 + 看板挂载定向

**验收内容**：【board-focus 订阅通道 + 看板挂载定向】验收

**操作步骤**：
1. npx vitest run tests/board-focus.test.ts tests/board-attach.test.ts → 全绿，逐条含：既有 5 条 focus 用例仍绿
2. 有订阅者时 requestBoardFocus 通知且 peekBoardFocus() 为 undefined
3. 订阅者抛错不影响其他订阅者
4. 挂载完成（非重新挂载）后调 requestBoardFocus('REQ-a') → el.innerHTML 含 data-detail-req="REQ-a"
5. dispose() 后 requestBoardFocus 回到一次性语义（peekBoardFocus() 得值）。（可证伪：去掉 board-mount 订阅 → TC-8 必红）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-4 · 兼容口径回归 + 工具 schema 文案

**验收内容**：【兼容口径回归 + 工具 schema 文案】验收

**操作步骤**：
1. npx vitest run tests/tool-schema-board-link.test.ts → 全绿：三处描述含「并定位」且不含「可在会话中点击跳转」
2. 三处 board_link 值仍为 '/dashboard#pmboard?req=' + id 形态（逐字断言）。（可证伪：改任一处产出值 → 用例必红）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-5 · 构建 + 端到端联调 + 全量回归

**验收内容**：【构建 + 端到端联调 + 全量回归】验收

**操作步骤**：
1. pnpm build 退出码 0 且 dist/index.mjs 与 lib/client.js 均有新产物（C-11）
2. grep -c 'location.replace' dist/index.mjs ≥ 1
3. pnpm build:client 输出 [verify-client] OK
4. npx vitest run tests/reqboard tests/application tests/http tests/deep-link.test.ts tests/legacy-board-route.test.ts tests/board-focus.test.ts tests/board-attach.test.ts 失败数 ≤ 开工基线（贴汇总输出）
5. npx tsc --noEmit 归属本需求文件零新增 error TS
6. 真机四步逐条给命令 + 输出摘要（②③ 人工点击附证据路径）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471

**验收状态**：✓ 通过

---

## 2. 测试报告

- 【线级联调】宿主真实 webserver 起临时端口(0)+两条 exact 路由+模拟静态兜底，真发 HTTP：GET /dashboard → 200 text/html no-store；GET /dashboard/ → 200；同进程 GET /nope → fallback 404（对照有效）；HEAD → 200 空体；POST → 405 + allow: GET, HEAD。输出与解读见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-1（脚本 /tmp/ws-probe.mts）— covers: t-149471
- 【产物取证】pnpm build 退出码 0；dist/index.mjs grep location.replace=1、新文案=3、旧文案=0；lib/client.js grep 深链诊断=1、订阅诊断=1；pnpm build:client → [verify-client] OK bundle=340871 bytes。详见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-2 — covers: t-149471
- 【全量回归 + 受控基线】pnpm test → 47 failed 文件 / 97 failed 用例 / 3742 passed / 3859 总；受控对照（临时停用本次生产改动、其余不动、跑完逐字节还原）：98 failed → 新增失败 0。逐卡时点失败数恒为 97。见 docs/requirements/REQ-261004111917-f473/tests/README.md — covers: t-086497, t-6742c5, t-5859d0, t-57b5fe
- 【作用域回归】卡面指定命令 → 2 failed / 474 passed；两处存量红：apply-wiring 工具名清单期望 18 实收 23、RandomIdFactory 6 位 hex 形状（均改动前即红）。见 docs/requirements/REQ-261004111917-f473/tests/README.md — covers: t-149471
- 【类型检查】npx tsc --noEmit → 144 条 error TS，与开工基线一致；本需求全部文件零新增 error — covers: t-149471
- 【用例总览】63 条全绿：legacy-board-route 11、deep-link 21、board-focus 14、board-attach 9、tool-schema-board-link 8。清单与覆盖见 docs/requirements/REQ-261004111917-f473/tests/README.md — covers: t-20c87f, t-f94b67, t-45ecd7, t-a55776
- 【反向演练 10 组】t1×2 / t2×3 / t3×3 / t4×2，全部按预期变红，每组后文件 sha256 逐字节还原。表见 docs/requirements/REQ-261004111917-f473/tests/README.md — covers: t-20c87f, t-f94b67, t-45ecd7, t-a55776
- 【独立复核 4 轮】报告落盘 docs/requirements/REQ-261004111917-f473/reviews/（t1-host-route-review.md、t2-deep-link-review.md、t3-board-focus-review.md、t4-schema-text-review.md）；共 20 条偏离/风险全部处置或记账 — covers: t-8b5bf8, t-61de2a, t-45a0dc, t-40fa7a
- 【待人工·真机四步】① curl -i http://127.0.0.1:19387/dashboard 期望 200 + body 含 location.replace；② 点会话里 board_link → 看板停在该需求详情；③ 看板已在屏时从节点面板「项目看板 ↗」触发 → 当场切换（不能靠「再点一次深链」构造）；④ hash 改 #pmboard?req=abc 刷新 → 开面板不定位、控制台一条诊断。表见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-4 — covers: t-149471
- 【运行态如实记录】未重载插件前 curl /dashboard 仍是 404（进程跑启动时加载的旧 dist）——真机四步须在重载插件后执行。见 docs/requirements/REQ-261004111917-f473/evidence/README.md 的 E-3 — covers: t-149471
- 【已知未覆盖·如实报】迁移未就绪（not-ready）分支未注册兼容入口 → 该降级态下 /dashboard 仍 404；超出已确认设计的覆盖面，建议另立小卡（t1 复核 R5 已记账）— covers: t-2cd503
- 【文档口径两处已收口】① #pmboard?req= 空值判 malformed（与 interfaces 解析规则表 / test-cases TC-3 / use-cases UC-4 一致）；② 空白输入按 interfaces 实现（清 pending、不通知）。已确认的设计文档未改写（改写会作废人工确认）— covers: t-bac32d, t-5f475a
- 【预存在债·非本需求】tests/host-panel.test.ts 缺 react-dom 无法加载；apply-wiring 工具名清单未随其它需求新增工具更新；design 文档行号漂移（interfaces.md 写 202/189，实际 221/197）— covers: t-b5f41f
- 【任务覆盖对照表】17 张任务卡逐卡给出承接它的测试与证据，见 docs/requirements/REQ-261004111917-f473/tests/README.md §5

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 宿主兼容入口：/dashboard 不再 404 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-2 | 客户端深链消费：清 hash → 定位 → 切面板 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-3 | board-focus 订阅通道 + 看板挂载定向 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-4 | 兼容口径回归 + 工具 schema 文案 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-5 | 构建 + 端到端联调 + 全量回归 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-168fa441-ba3a-45f8-9240-cfa416e2a4ec | 2026-10-04 12:04 |
