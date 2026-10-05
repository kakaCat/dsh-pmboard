# t-45ecd7 board-focus 订阅通道 + 看板挂载定向·研发

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
board-focus 订阅通道 + 看板挂载定向·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T03:44:06.669Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

研发段做完：看板已经开在屏上时再点定位链接，现在能当场切到那条需求——以前这条路是「点了完全没反应，意图滞留到下次进看板」。

### 完成项

- src/client/board-focus.ts：新增 subscribeBoardFocus（挂载时订阅、退订幂等）；requestBoardFocus 语义分叉——有订阅者则同步通知全部订阅者且 pending 保持清空（防双跳）、无订阅者保持原一次性语义；空白输入只清 pending 不通知；订阅者逐个 try/catch（一个抛错不影响其他与调用方）
- src/client/board-mount.ts：挂载段订阅定位通知（清阶段选中态 + 切详情 + 重绘，与既有 open-req 同款），dispose 退订
- tests/board-focus.test.ts：追加 6 条（通知且不留 pending、多订阅者与幂等退订、退订后回一次性语义、订阅者抛错隔离、空白不通知、clearBoardFocus 不惊动订阅者）；既有 5 条原样保留
- tests/board-attach.test.ts：追加 TC-8（挂载完成后再登记定位 → 当场切到该需求详情且不留 pending）与 TC-9（dispose 退订后回到一次性语义）
- 自测：npx vitest run tests/board-focus.test.ts tests/board-attach.test.ts → 19/19 全绿（focus 11 + attach 8）；npx tsc --noEmit → 本卡文件零 error
- 反向演练（改完即撤，两文件 sha256 逐字节还原）：去掉 board-mount 订阅 → 1 红（正是 TC-8）；有订阅者时仍写 pending → 2 红

### 改动文件

- `src/client/board-focus.ts`
- `src/client/board-mount.ts`
- `tests/board-focus.test.ts`
- `tests/board-attach.test.ts`

### 下一步

交复核段：对照 design/interfaces.md §board-focus 契约变更 与 data-model.md 不变量 I-7 逐条核对。

---
