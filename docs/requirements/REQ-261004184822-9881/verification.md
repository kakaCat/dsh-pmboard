# REQ-261004184822-9881 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：看板泳道两处问题都已修好：① 刷新（手动 / 20 秒轮询 / SSE / 操作后）不再把横向滚动位置与列内位置打回起点；② 各状态列从列头直通看板底部，列内自己滚、列头固定。
做法：新增纯前端记忆模块 board-scroll.ts（单条内存快照、按列 data-lane 记位置、不落盘、与 DAG 画布记忆隔离），在唯一重绘点 render() 的 innerHTML 赋值前后各调一次；列高改为拉伸铺满（删掉写死的 100vh 减常数上限），不新增 DOM 层级。
自动读数：15 条用例全绿；构建与客户端校验 exit 0；类型错误 153 与开工前持平；全量 98 failed 与开工前持平（零新增失败）。
人工验收：人在刷新后的 GUI 上确认三条——列已直通到底、横滚到右列后刷新未被弹回、长列内翻后仍停在原处。
未覆盖的边界（如实列出，交由验收裁决）：窗口拉矮后的列高、列内滚动时列头是否始终可见、单独触发 SSE 的那一次刷新、浏览器刷新页面后回到最左。评审另披露两处自身缺陷（注释污染锚点、测试桩假绿）已当场修正。

## 1. 验收列表

### v1-1 · 记住你看到哪：位置记忆模块（不落盘、不跟别人串）

**验收内容**：【记住你看到哪：位置记忆模块（不落盘、不跟别人串）】验收

**操作步骤**：
1. npx vitest run tests/board-lane-scroll.test.ts 全绿（TC-1 往返 + 超上限裁剪
2. TC-2 A 列 180/B 列 0
3. TC-3 无泳道容器时 capture 不写零、restore 无副作用
4. TC-4 与 readDagViewState 互不影响）
5. grep -c "localStorage\|sessionStorage\|document.cookie" src/client/board-scroll.ts = 0
6. pnpm typecheck 错误数 ≤ HEAD 基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

### v1-2 · 刷新别把人弹回去：把它接在重绘那两行上

**验收内容**：【刷新别把人弹回去：把它接在重绘那两行上】验收

**操作步骤**：
1. npx vitest run tests/board-lane-scroll.test.ts 全绿（含 TC-5）
2. grep -c "BoardScroll" src/client/board-mount.ts ≥ 3（import + 两次调用）
3. npx vitest run tests/board-attach.test.ts 全绿（既有挂载/释放生命周期回归）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

### v1-3 · 列直通到底：列高铺满可视区、列内自己滚

**验收内容**：【列直通到底：列高铺满可视区、列内自己滚】验收

**操作步骤**：
1. npx vitest run tests/board-lane-scroll.test.ts 全绿（含 TC-6）
2. grep -c "max-height: calc(100vh" src/client/styles/base.ts = 0
3. pnpm build:client 输出 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

### v1-4 · 收口：四门禁 + GUI 手工证据

**验收内容**：【收口：四门禁 + GUI 手工证据】验收

**操作步骤**：
1. evidence/lane-scroll-gui.png 与 evidence/gates.txt 在场且 gates.txt 含命令原文与实测输出
2. pnpm build exit 0
3. pnpm test 失败数 ≤ 基线 106
4. pnpm typecheck ≤ 223
5. npx vitest run tests/board-lane-scroll.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）

**验收状态**：✓ 通过

---

## 2. 测试报告

- docs/requirements/REQ-261004184822-9881/tests/test-evidence.md（覆盖对照表 + 任务 covers 标注 19 条 + 失败与未跑项）
- docs/requirements/REQ-261004184822-9881/evidence/gates.txt（四门禁命令原文 + 实测输出 + 构建戳 17e9dba1f362）
- docs/requirements/REQ-261004184822-9881/evidence/lane-scroll-gui.md（GUI 三条人工验收答复原文 + 未覆盖项说明）
- docs/requirements/REQ-261004184822-9881/reviews/self-review.md（内部自评：5 项问题与处置）
- npx vitest run tests/board-lane-scroll.test.ts → 15 passed（TC-1~TC-6）
- pnpm build exit 0；pnpm build:client → [verify-client] OK（bundle 410557 bytes）
- pnpm typecheck → 153 个错误（开工前基线 153，改动文件零错误）
- pnpm test → 98 failed / 4416 passed（开工前 98 failed / 4405 passed，失败数持平未新增）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 记住你看到哪：位置记忆模块（不落盘、不跟别人串） | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
| v1-2 | 刷新别把人弹回去：把它接在重绘那两行上 | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
| v1-3 | 列直通到底：列高铺满可视区、列内自己滚 | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
| v1-4 | 收口：四门禁 + GUI 手工证据 | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
| v1-6 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-1c72e30b-075a-4375-a0e5-022885505cf8 | 2026-10-04 19:10 |
