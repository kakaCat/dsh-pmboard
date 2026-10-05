# t-ea81bd 失败与降级要响亮：无落点警告可见、文案只指可执行入口·研发

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
失败与降级要响亮：无落点警告可见、文案只指可执行入口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T09:25:00.848Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

这一步做完，落库出问题不再静默：不推进时有评论+停手原因+告警，卡缺引用时回执与看板各说一次

### 完成项

- confirm-settle：无落点卡除回执警告外，**同时写一条需求评论**（看板上看得见，不再只藏在一句话的返回体里）
- 失败分支的恢复指引改写为两条**真能执行**的入口（reqboard_decompose / 看板「拆分」按钮），并补一句「只是个别卡缺引用 → reqboard_task_refs」
- 落库未生效 → 不推进 + 系统评论 + advance.pausedReason + 告警（沿用并复核既有分支）
- 落库生效而收尾失败 → 照常推进并留痕（用例注入第一次推进写入失败来验证）
- 新增 tests/reqboard/landing-failure-loud.test.ts → 4 passed（含文案纪律静态扫描：src 内已无 REQBOARD_PLAN_REFS_MISSING 拒绝分支）

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/application/internal/approved-plan-landing.ts`
- `tests/reqboard/landing-failure-loud.test.ts`

### 下一步

交复核子卡：对照 FR-6 与 design 逐条核对

---
