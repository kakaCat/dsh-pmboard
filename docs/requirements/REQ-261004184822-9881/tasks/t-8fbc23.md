# t-8fbc23 列直通到底：列高铺满可视区、列内自己滚·测试

> 需求：REQ-261004184822-9881 看板泳道自动刷新导致浏览位置丢失

## 在做什么
列直通到底：列高铺满可视区、列内自己滚·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T11:05:38.281Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

测试读数：样式改动没有引入任何新失败（全量 98 不变）、类型错误 153 低于基线，卡内三条锚点全过。

### 完成项

- pnpm test → 98 failed / 4416 passed（文档基线 106 failed；本卡改动前后失败数同为 98，未新增失败）
- tests/board-lane-scroll.test.ts 15 passed（含 TC-6 四条静态断言）
- tests/client-styles-ownership.test.ts 6 passed（样式归属与分片完整性）
- npx tsc --noEmit → 153 个错误（基线 223，低于基线；无一行来自本次改动文件）
- grep -c 的 100vh 列高写法于 src/client/styles/base.ts → 0（卡内验收锚点逐条满足）

### 改动文件

- `src/client/styles/base.ts`
- `tests/board-lane-scroll.test.ts`

### 下一步

父卡收尾后接 t4：四门禁 + GUI 手工证据

---
