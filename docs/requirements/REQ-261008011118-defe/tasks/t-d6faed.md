# t-d6faed 给批量收尾加非子卡 done 上限 N=3·回归测试

> 需求：REQ-261008011118-defe 修复 reqboard 体检第五批中危 bug（M1 死字段/M3 批内节流/M4 两段写/M5 并发双跑）

## 在做什么
给批量收尾加非子卡 done 上限 N=3·回归测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 无新增失败（与基线比对，贴汇总输出）

---
## 汇报 1（2026-10-07T17:40:21.223Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

回归：BUG-2 邻域 10 文件 / 147 用例全绿，无新增红

### 完成项

- 回归读数：npx vitest run tests/task-move-batch.test.ts tests/done-throttle-guidance.test.ts tests/t12-queue-readonly-ordering.test.ts tests/legacy-compat-6749.test.ts tests/error-code-matrix.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/output-contract.test.ts tests/task-run-contract.test.ts tests/concurrency-limits.test.ts → Test Files 10 passed / Tests 147 passed（无新增失败）
- 邻域选择依据：BUG-2 改的是批量门禁与工具文案 ⇒ 必须覆盖 (a) 批量/节流语义、(b) 队列读写顺序契约（t12 打点）、(c) 旧回执键集兼容（legacy-compat-6749）、(d) 回执与错误码契约（output-contract/error-code 三件套）、(e) 并发上限不被批内计数改坏（concurrency-limits）
- 全量 pnpm test 留到 t5 收口卡一次性采集

### 下一步

父卡 t-20f5dc 收尾：四张子卡全 done 后写父卡汇报并推进到 done

---
