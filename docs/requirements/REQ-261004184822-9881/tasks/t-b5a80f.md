# t-b5a80f 刷新别把人弹回去：把它接在重绘那两行上·联调

> 需求：REQ-261004184822-9881 看板泳道自动刷新导致浏览位置丢失

## 在做什么
刷新别把人弹回去：把它接在重绘那两行上·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T11:02:03.681Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

联调结论：新模块已随 client 产物发布（bundle 增量 1KB、独有选择器在产物中可查），看板与入口相关用例 32 条全绿。

### 完成项

- pnpm build:client → [verify-client] OK，bundle 409674 bytes（接线前 408631，增量即新模块）
- grep -c "dsh-pm-lane[data-lane]" lib/client.cjs → 1（该选择器只存在于 board-scroll.ts，证明模块真进产物，不是被摇掉）
- npx vitest run tests/board-lane-scroll.test.ts tests/board-attach.test.ts tests/board-entry.test.ts tests/board-focus.test.ts → 32 passed
- 接线只落在 render() 一处，未改动取数路径、事件委派与刷新周期

### 改动文件

- `src/client/board-mount.ts`
- `tests/board-lane-scroll.test.ts`

### 下一步

子卡复核：对照设计契约核对调用顺序与降级行为

---
