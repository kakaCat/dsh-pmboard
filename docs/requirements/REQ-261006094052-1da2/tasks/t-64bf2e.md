# t-64bf2e 抽出推进单点 applyConfirmedAdvance 并让首次确认路径复用·研发

> 需求：REQ-261006094052-1da2 确认门死锁：已落章未推进后 agent 无路可走

## 在做什么
抽出推进单点 applyConfirmedAdvance 并让首次确认路径复用·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T01:49:00.806Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

研发段完成：确认后的状态迁移抽成单点 applyConfirmedAdvance，首次确认路径改调它。

### 完成项

- 新增导出 applyConfirmedAdvance：闸门由调用方保证，函数只做迁移（迁移 + 自动推进评论 + 断点）
- applyConfirmDecision 的迁移块改为调用该单点，行为逐字不变
- npx tsc --noEmit 退出码 0

### 改动文件

- `src/application/internal/confirm-settle.ts`

### 下一步

复核子卡核对单点语义与主路径不变式

---
