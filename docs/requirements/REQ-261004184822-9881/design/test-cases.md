---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 测试用例设计（REQ-261004184822-9881 泳道滚动位置保持 + 列高铺满）

> 本包 vitest 跑在 **node 环境（无 jsdom）**：用例照 [`tests/board-attach.test.ts`](../../../../tests/board-attach.test.ts) 的最小 DOM 桩法写，**不新增依赖**。

## 用例总览 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 编号 | 用例 | validates | 层级 | 实际文件 | 备注 |
|---|---|---|---|---|---|
| TC-1 | 横向位置 capture → restore 往返（含超上限裁剪） | FR-1 | 单测 | `tests/board-lane-scroll.test.ts` | 桩容器 |
| TC-2 | 列内纵向位置按 `data-lane` 隔离 | FR-1 | 单测 | `tests/board-lane-scroll.test.ts` | A 列 180 / B 列 0 |
| TC-3 | 无泳道容器时 capture **不覆盖**记忆、restore 无副作用 | FR-1, FR-2 | 单测 | `tests/board-lane-scroll.test.ts` | 详情页 / 列表往返 |
| TC-4 | 与 DAG 记忆隔离 + 不落盘（源码 grep 断言） | FR-2 | 单测 | `tests/board-lane-scroll.test.ts` | 静态 |
| TC-5 | 重绘接线：首拉 + 轮询触发重绘后位置被回填 | FR-1, FR-3 | 集成（桩 DOM + 假计时器） | `tests/board-lane-scroll.test.ts` | 走 `attachBoard` |
| TC-6 | 列高样式静态断言（不再依赖 `100vh` 魔术值） | FR-4 | 静态断言 | `tests/board-lane-scroll.test.ts` | 读 `styles/base.ts` 源码 |
| TC-7 | GUI 手工：三连刷 + 列内翻 + 拉矮窗口 | FR-1, FR-4 | E2E（人工） | （无自动化文件，证据为截图） | 验收材料 |

## TC-1 横向位置往返 <!-- serves: FR-1 -->

**测试目标**：capture 读到的横滚位置，restore 能原样写回；超上限时收敛。

**前置条件**：桩容器，`querySelector('.dsh-pm-lanes')` 返回一个 `{ scrollLeft }` 对象。

**测试步骤**：

1. 置 `lanes.scrollLeft = 260` → 调 `captureBoardScroll(root)`。
2. 模拟重绘：把 `lanes.scrollLeft` 归 0 → 调 `restoreBoardScroll(root)`。
3. 上限收敛：桩的 `scrollLeft` setter 在超过 500 时写 500 → 恢复 260 应得 260；恢复 900 应得 500。

**预期结果**：步骤 2 后 `lanes.scrollLeft === 260`；上限场景不报错、不出现 0。

**覆盖场景**：正常流程 / 边界值（超上限）/ 异常（NaN → 0）。

## TC-2 列内隔离 <!-- serves: FR-1 -->

**测试目标**：一列的纵向位置不会串到另一列。

**测试步骤**：

1. 桩 DOM 两列：`[data-lane="implementing"]`（cards `scrollTop = 180`）、`[data-lane="design"]`（cards `scrollTop = 0`）。
2. capture → 重绘（两列 scrollTop 归 0）→ restore。

**预期结果**：implementing 列回到 180、design 列仍为 0；`readBoardScroll()` 的 `lanes` 只含当前 DOM 出现过的列键。

## TC-3 无泳道容器不覆盖记忆 <!-- serves: FR-1, FR-2 -->

**测试目标**：列表视图 / 需求详情页重绘不把已记住的位置冲成 0。

**测试步骤**：

1. 泳道桩：`scrollLeft = 260` → capture。
2. 换成"无泳道"桩（`querySelector('.dsh-pm-lanes')` 返回 null）→ capture。
3. 换回泳道桩（`scrollLeft = 0`）→ restore。

**预期结果**：步骤 3 后仍为 260（步骤 2 没有写零）；步骤 2 的 restore 也不抛错。

## TC-4 与 DAG 记忆隔离 + 不落盘 <!-- serves: FR-2 -->

**测试目标**：两套记忆互不影响；本模块不碰浏览器存储。

**测试步骤**：

1. `captureBoardScroll(泳道桩)` 后 `readDagViewState('dag-canvas::REQ-1')` 仍为 `undefined`；写 DAG 记忆后 `readBoardScroll()` 的值不变。
2. 读 `src/client/board-scroll.ts` 源码：断言不含 `localStorage` / `sessionStorage` / `document.cookie`。

**预期结果**：两条断言均成立（不写盘、不串位）。

## TC-5 重绘接线（集成） <!-- serves: FR-1, FR-3 -->

**测试目标**：真实调用链（`attachBoard` → `fetchAll` → `render`）确实回填位置。

**前置条件**：桩容器（`innerHTML` setter 重建泳道桩，`scrollLeft` 归 0）、`fetch` 桩返回空状态、假 EventSource、假计时器。

**测试步骤**：

1. `attachBoard(container)` → 首拉渲染完成。
2. 置 `lanes.scrollLeft = 260`。
3. 推进假计时器 20 秒（轮询）→ 等一次微任务刷新。
4. 断言 `lanes.scrollLeft === 260`。
5. 模拟 `switch-view` 事件切到列表再切回泳道 → 断言仍为 260（FR-3）。

**预期结果**：两步断言均成立。

## TC-6 列高样式静态断言 <!-- serves: FR-4 -->

**测试目标**：列高不再由写死的视口减常数决定，泳道行拉伸到列。

**测试步骤**：读 `src/client/styles/base.ts` 源码文本，取 `.dsh-pm-lanes {` 与 `.dsh-pm-lane {` 两个规则块。

**预期结果**：

- `.dsh-pm-lanes` 块含 `align-items: stretch`（不再 `flex-start`）；
- `.dsh-pm-lane` 块**不含** `max-height: calc(100vh`；
- `.dsh-pm-lane-cards` 块仍含 `overflow-y: auto`（列内滚动能力未被弄丢）。

## TC-7 GUI 手工验收 <!-- serves: FR-1, FR-4 -->

**测试步骤**：

1. 进入看板泳道，横滚到最右（accepting 列）。
2. 依次触发：点「刷新」/ 等一轮 20 秒 / 在另一窗口改一条需求（SSE）。
3. 在某长列内往下翻到底，再触发一次刷新。
4. 把浏览器窗口拉矮一半。

**预期结果**：① 三次刷新后仍在 accepting 列；② 长列仍停在原位置、列头可见；③ 各列底边始终直通看板底部、不出现双滚动条；④ 拉矮后列高随之变矮、列内容仍能滚到底。证据：截图贴 `evidence/`。

## 测试覆盖度统计 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 需求条款 | 测试用例 | 覆盖状态 |
|---|---|---|
| FR-1 | TC-1、TC-2、TC-3、TC-5、TC-7 | ✅ 已覆盖 |
| FR-2 | TC-3、TC-4 | ✅ 已覆盖 |
| FR-3 | TC-5、TC-7 | ✅ 已覆盖 |
| FR-4 | TC-6、TC-7 | ✅ 已覆盖 |
