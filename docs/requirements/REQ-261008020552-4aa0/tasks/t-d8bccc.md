# t-d8bccc 收编 archive_amend 为 task_amend(op=archive)（U1）·联调

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
收编 archive_amend 为 task_amend(op=archive)（U1）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T18:43:36.606Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U1 联调完成：装配面/契约面全绿；readme-tool-face 门禁要求计数三处同改（README×3 + package.json），已同步 21→20

### 完成项

- 契约面四件 + toolviews-contract + tools-render-coverage + tools-schema + render-summaries + zero-arg-binding 全绿（86 测试）
- readme-tool-face 暴露计数耦合：README 三处 + package.json description 的「21 个」同步改「20 个」（原计划 U5 做的计数按门禁要求随卡走）
- 请求样例与期望响应一致：e2e 的 op=archive 调用走真实壳层，返回键集 + op 回显断言在场

### 改动文件

- `README.md`
- `package.json`

### 下一步

复核子卡：逐条对照 design §3 契约与行为不变式复核 diff

---
