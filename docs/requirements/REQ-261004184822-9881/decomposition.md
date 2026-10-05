---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [frontend]
---

# 拆分计划（REQ-261004184822-9881 看板泳道：刷新不丢位置 + 列高铺满）

## 目标 + 做法（一段人能读懂的）

**目标**：看板泳道被自动刷新重绘后，用户横滚到的列与在某列里翻到的位置都还在（不再弹回最左）；同时各状态列纵向铺满看板可视高度，列内自己滚、列头固定。

**做法**：先把「位置记忆」独立成一个纯模块（单条内存快照，按 `data-lane` 记列内位置，不落盘、与 DAG 记忆隔离）并用桩 DOM 单测钉死 → 再在**唯一的重绘点** `render()` 里于 `innerHTML` 赋值前后各调一次（接线用例走真 `attachBoard`）→ 最后把列高从「内容高 + 写死 `100vh` 减常数」改成「拉伸铺满」（静态断言锁住，不新增 DOM 层级）→ 收口卡跑全套门禁并留 GUI 证据。

**为什么是三张实现卡 + 一张收口**：契约（模块）→ 接线（调用点）→ 样式（几何）各归各卡，卡不跨层；三张卡都要往同一个测试文件追加用例，故按文件级串行（不是功能依赖）。

## 改动盘点

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/client/board-scroll.ts` | 泳道滚动位置记忆：`captureBoardScroll` / `restoreBoardScroll` / `readBoardScroll` / `_resetBoardScroll`；单条快照 + sanitize + 列键上限 |
| 修改 | `src/client/board-mount.ts` | `render()` 里 `innerHTML` 赋值前后各调一次（`captureBoardScroll` / `restoreBoardScroll`） |
| 修改 | `src/client/styles/base.ts` | §泳道：`.dsh-pm-lanes` 改 `align-items: stretch` + `min-height: 0`；`.dsh-pm-lane` 删 `max-height: calc(100vh - 200px)`、加 `min-height: 0`；`.dsh-pm-lane-cards` 的 `min-height` 24px → 0 |
| 新增 | `tests/board-lane-scroll.test.ts` | 桩 DOM 往返 / 列隔离 / 不覆盖记忆 / 隔离与不落盘 / `attachBoard` 接线 / 列高样式静态断言 |
| 新增 | `evidence/lane-scroll-gui.png`、`evidence/gates.txt` | 收口卡的 GUI 手工证据与四门禁读数 |

**不改**：刷新触发机制与周期、取数路径（`api.fetchState`）、看板 DOM 结构与事件委派、台账 / HTTP API；`dag/view-state.ts` 一行不改（FR-2 隔离）。

## 任务表

| key | 标题（业务语言） | phase | side | depends_on | 需求条款 |
|---|---|---|---|---|---|
| t1 | 记住你看到哪：位置记忆模块（不落盘、不跟别人串） | implement | frontend | — | FR-1, FR-2 |
| t2 | 刷新别把人弹回去：把它接在重绘那两行上 | implement | frontend | t1 | FR-1, FR-3 |
| t3 | 列直通到底：列高铺满可视区、列内自己滚 | implement | frontend | t2 | FR-4 |
| t4 | 收口：四门禁 + GUI 手工证据 | test | frontend | t1, t2, t3 | FR-1, FR-2, FR-3, FR-4 |

### 依赖图

```
t1 ──▶ t2 ──▶ t3 ──┐
                    ├──▶ t4（收口）
t1 ─────────────────┘
```

> t2、t3 都以 t1 产出的测试文件为落点，故三者串行（**文件级串行**，不是功能依赖——CSS 不依赖接线）。

### 容量核算

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 = 16 DU。

| key | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 3 | 5 | 1800 | 6.40 | 通过 |
| t2 | 3 | 4 | 1400 | 5.70 | 通过 |
| t3 | 3 | 3 | 1200 | 5.10 | 通过 |
| t4 | 3 | 4 | 1600 | 5.80 | 通过 |

无超容量卡 → 不需要 `⚠️超容量(建议N批)` 标记。

## 每卡验收（可证伪）

### t1 · 位置记忆模块

- **implementation**：新增 `src/client/board-scroll.ts`——导出 `captureBoardScroll(root)`（读 `.dsh-pm-lanes` 的 `scrollLeft` + 每列 `.dsh-pm-lane[data-lane]` 内 `.dsh-pm-lane-cards` 的 `scrollTop`，**找不到泳道容器即静默返回、不覆盖记忆**）、`restoreBoardScroll(root)`（只在找得到容器 / 该列时回填，不创建节点）、`readBoardScroll()`（浅拷贝，诊断用）、`_resetBoardScroll()`（测试用）；单条快照 + sanitize（负数 / `NaN` / `Infinity` / `undefined` → 0，口径照 [`src/client/dag/view-state.ts`](../../../../src/client/dag/view-state.ts) 但不复用它）；列键上限 16。新增 `tests/board-lane-scroll.test.ts`：桩 DOM（duck-typed `querySelector` / `querySelectorAll`）覆盖 TC-1 / TC-2 / TC-3 / TC-4；文件头 20 行内含 `serves: FR-1, FR-2`。
- **acceptance**：`npx vitest run tests/board-lane-scroll.test.ts` 全绿（TC-1 往返 + 超上限裁剪；TC-2 A 列 180 / B 列 0；TC-3 无泳道容器时 capture 不写零、restore 无副作用；TC-4 与 `readDagViewState` 互不影响）；`grep -c "localStorage\|sessionStorage\|document.cookie" src/client/board-scroll.ts` = 0；`pnpm typecheck` 错误数 ≤ HEAD 基线（先跑 `npx tsc --noEmit` 取数）。

### t2 · 重绘接线

- **implementation**：改 `src/client/board-mount.ts` 的 `render()`：在 `switch (mode.kind)` **之前**调 `captureBoardScroll(viewEl)`、**之后**调 `restoreBoardScroll(viewEl)`（`viewEl === undefined` 与 `state === undefined` 的空态分支不进记忆）；在 `tests/board-lane-scroll.test.ts` 追加 TC-5：桩容器（`innerHTML` setter 重建泳道桩并把 `scrollLeft` 归 0）+ `fetch` 桩 + 假 EventSource + 假计时器，走真 `attachBoard` 断言「首拉渲染后置 260 → 推进 20 秒轮询 → 仍为 260」，并模拟 `switch-view` 切列表再切回泳道仍为 260。
- **acceptance**：`npx vitest run tests/board-lane-scroll.test.ts` 全绿（含 TC-5）；`grep -c "BoardScroll" src/client/board-mount.ts` ≥ 3（import + 两次调用）；`npx vitest run tests/board-attach.test.ts` 全绿（既有挂载 / 释放生命周期回归）。

### t3 · 列高铺满

- **implementation**：改 [`src/client/styles/base.ts`](../../../../src/client/styles/base.ts) §泳道三条规则：`.dsh-pm-lanes` 的 `align-items: flex-start` → `stretch` 并补 `min-height: 0`；`.dsh-pm-lane` 删 `max-height: calc(100vh - 200px)` 并补 `min-height: 0`；`.dsh-pm-lane-cards` 的 `min-height: 24px` → `0`（`overflow-y: auto` 保留）。**不新增 DOM 层级 / class**。在 `tests/board-lane-scroll.test.ts` 追加 TC-6：读该样式源码文本，取三个规则块断言「`.dsh-pm-lanes` 含 `align-items: stretch`」「`.dsh-pm-lane` 块不含 `max-height: calc(100vh`」「`.dsh-pm-lane-cards` 块仍含 `overflow-y: auto`」。
- **acceptance**：`npx vitest run tests/board-lane-scroll.test.ts` 全绿（含 TC-6）；`grep -c "max-height: calc(100vh" src/client/styles/base.ts` = 0；`pnpm build:client` 输出 `[verify-client] OK`。

### t4 · 收口与交付证据

- **implementation**：按 design/test-cases.md 的 TC-7 在 GUI（`http://127.0.0.1:19387` → 看板 → 泳道）跑手工验收：横滚到 accepting 列后三连刷（手动「刷新」/ 等一轮 20 秒轮询 / 另一窗口改一条需求触发 SSE）、某长列内翻到底再刷新、把窗口拉矮一半；截图落 `evidence/lane-scroll-gui.png`（含刷新前后同列对照）。四门禁读数（build / build:client / typecheck / test 失败数与基线比对）落 `evidence/gates.txt`。
- **acceptance**：`evidence/lane-scroll-gui.png`、`evidence/gates.txt` 在场且 gates.txt 含命令原文与实测输出；`pnpm build` exit 0；`pnpm test` 失败数 ≤ 基线 106；`pnpm typecheck` ≤ 223；`npx vitest run tests/board-lane-scroll.test.ts` 全绿。

## 交付总口径（全部卡完成后）

1. 打开看板泳道：各列底边直通看板底部（空列同高），列内滚动看得到最后一张卡、列头不消失，不出现双层纵向滚动条。
2. 横滚到最右列后，三种刷新各触发一次 → 每次都仍在原列；在某长列内翻到中部再刷新 → 仍停在原位置。
3. 泳道 → 列表 → 泳道、泳道 → 需求详情 → 返回 → 位置保持；浏览器刷新页面 → 回到最左（不落盘，符合 FR-2）。
4. `tests/board-lane-scroll.test.ts` 全绿；`pnpm build`（含 client 校验）、`pnpm typecheck`、`pnpm test` 均不高于基线。
