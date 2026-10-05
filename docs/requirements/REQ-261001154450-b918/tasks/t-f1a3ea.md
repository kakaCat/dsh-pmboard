# t-f1a3ea 计划引用通道与落库门禁·研发

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
计划引用通道与落库门禁·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/plan-refs.test.ts → 全绿；且对应源文件改动可在 git diff 中看到

## 汇报 1（2026-10-01T08:54:39.316Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

研发完成：计划任务表第一次能带「本卡承接哪几条需求」——此前 schema 用 additionalProperties:false 把这个字段直接拒收，FR 引用根本没有通道；同时补上从计划文档覆盖表读取的第二通道。

### 完成项

- 研发完成：计划任务表第一次能带「本卡承接哪几条需求」——此前 schema 用 additionalProperties:false 把这个字段直接拒收，FR 引用根本没有通道；同时补上从计划文档覆盖表读取的第二通道。

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/internal/content-gate-wiring.ts`
- `src/application/internal/confirm-settle.ts`
- `tests/plan-refs.test.ts`

---
