# t-1d9c8a 挂起确认机制扩写：storage-action + 一次性 consume·研发

> 需求：REQ-261004103330-005f 看板运行设置：节点执行次数上限 + 数据库开关（含 SQLite 适配实现）

## 在做什么
挂起确认机制扩写：storage-action + 一次性 consume·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T09:11:02.420Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

研发段完成：切库的「人工确认」有了代码级门槛——一张票据只能被消费一次，且畸形确认不会被误当成已确认。这一步做完，后续路由卡可以真正拒绝「没经人确认就改后端」的调用。

### 完成项

- 扩写挂起确认机制：宿主级动作走独立新表，既有 artifact/plan 原表原码路一字未动
- 新增一次性 consume：同步实现，检查与置位之间零 await，因此并发重放只可能成功一次
- 落章形状校验做成 fail-closed：畸形一律留在未落章，consume 必拒
- 新增 8 条用例，含并发重放、过期、未落章、未知票与既有路径回归

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `tests/reqboard/pending-confirm-consume.test.ts`

### 下一步

联调段：核验既有调用方与新方法的接线

---
