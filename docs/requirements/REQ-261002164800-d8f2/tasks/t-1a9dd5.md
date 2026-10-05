# t-1a9dd5 取数单点：refsForLanding 合并显式与文档覆盖表·复核

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
取数单点：refsForLanding 合并显式与文档覆盖表·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T09:07:11.741Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

复核：设计逐条对齐，三处偏离如实登记（grep 口径、回执键名、形参放宽），无隐瞒

### 完成项

- 对照 design/architecture.md 三条不变量：取数单点、门禁单点本卡达成（写入单点属 t5）
- 对照 design/interfaces.md：refsForLanding 入参出参、unrefedKeys、RefSource 三态 —— 一致
- 对照 design/data-model.md：显式优先、文档表仅在缺失时补齐、doc 里的旁支 key 不进结果 —— 一致
- 偏离 1（如实登记）：验收写的 grep refsByKey 只命中两文件未逐字达成 —— 另有三处是把这份 map 传给 landPlanTasks 的消费点，以及一处纯判定函数的形参名；组装点确实只有 plan-refs.ts
- 偏离 2（如实登记）：decompose 回执用 unrefed_cards 与 refs_warning 命名，而非复用 warning —— 因该回执已有两处 warning 条件键，再加会静默覆盖
- 偏离 3（如实登记）：planRefsFromDoc 形参由 RequirementRecord 放宽为 { id: string }（只用 id），非破坏性

### 下一步

交测试子卡：跑本卡用例与全量基线

---
