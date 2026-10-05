# t-f8b5ae 记住你看到哪：位置记忆模块（不落盘、不跟别人串）·联调

> 需求：REQ-261004184822-9881 看板泳道自动刷新导致浏览位置丢失

## 在做什么
记住你看到哪：位置记忆模块（不落盘、不跟别人串）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T10:59:33.292Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

联调结论：新增模块与既有客户端构建、看板挂载与入口链路互不干扰，构建校验通过、既有用例零回归。

### 完成项

- pnpm build:client → [verify-client] OK（bundle 408631 bytes，关键符号齐全，CSS 分片完整）
- npx vitest run tests/board-attach.test.ts → 9 passed（挂载与释放生命周期无回归）
- npx vitest run tests/board-entry.test.ts tests/board-focus.test.ts → 21 passed（看板入口与定位通道无回归）
- 新模块未被其它模块引用，构建产物与现有看板行为逐字不变（本卡只新增文件）

### 改动文件

- `src/client/board-scroll.ts`
- `tests/board-lane-scroll.test.ts`

### 下一步

子卡复核：按设计契约逐条核对实现

---
