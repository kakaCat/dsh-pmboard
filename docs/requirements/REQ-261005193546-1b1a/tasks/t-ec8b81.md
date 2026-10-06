# t-ec8b81 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·研发

> 需求：REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡：让视图与统计都不再算上退出赛道的卡片

## 在做什么
客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T17:13:20.362Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段完成：看板客户端四个展示面统一到活卡，分层剪边落进 topoLevels，client 产物已重建。

### 完成项

- 四个 client 文件收编：board/toCard、stage-panel.topoLevels、node-panel、subtask-view
- topoLevels 剪边落进函数内部（dangling 边丢弃，不再当 lv=0 计入 max）
- client 产物已重建：build:client 通过，lib/client.js md5 已更新，构建新于 src
- 新增 tests/canceled-hidden-view.test.ts 17 例（含原型对照与正对照）
- 唯一越界：stage-panel.test.ts 一条断言原依赖幽灵前置，已改为真前置

### 改动文件

- `src/client/stage-panel.ts`
- `src/client/node-panel.ts`
- `src/client/views/board.ts`
- `src/client/render/subtask-view.ts`
- `tests/canceled-hidden-view.test.ts`
- `tests/stage-panel.test.ts`

### 下一步

进入联调段：面板与客户端邻域零回归

---
