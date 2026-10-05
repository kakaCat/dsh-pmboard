# t-2d4f3e 定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS）·研发

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T02:59:50.789Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

研发子卡完成：归档/取消需求第一次有了与进行中需求同源的卡片投影，以及一条默认折叠的「已归档」条渲染器（尚未接线到看板，接线是 t2）。

### 完成项

- 抽 toCard 单一构造点；toReqCards 经它派生（语义不变）
- 新增 toTerminalCards（archived ∪ canceled，updatedAt 降序）
- 新增 renderArchivedBar + ARCHIVED_CHIPS_MAX（折叠/超限/转义/空态）
- base.ts 归档条样式复活并补 4 条规则
- tests/archived-entry.test.ts 建立 A1–A6 全表；t1 四判据绿

### 改动文件

- `src/client/views/board.ts`
- `src/client/styles/base.ts`
- `tests/archived-entry.test.ts`

### 下一步

复核子卡：检查契约与设计文档一致（签名、DOM 钩子、CSS 选择器作用域）

---
