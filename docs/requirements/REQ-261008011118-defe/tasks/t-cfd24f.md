# t-cfd24f 删除 run 快照的三处死字段与其死代码·回归测试

> 需求：REQ-261008011118-defe 修复 reqboard 体检第五批中危 bug（M1 死字段/M3 批内节流/M4 两段写/M5 并发双跑）

## 在做什么
删除 run 快照的三处死字段与其死代码·回归测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 无新增失败（与基线比对，贴汇总输出）

---
## 汇报 1（2026-10-07T17:37:27.225Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

回归：BUG-1 邻域测试集 19 文件 / 227 用例全绿，无新增红

### 完成项

- 回归读数：npx vitest run tests/unit tests/tools-status.test.ts tests/status-lossless.test.ts tests/status-pending-confirm.test.ts tests/status-rtm-integration.test.ts tests/query-trunk.test.ts tests/run-status-tool.test.ts tests/output-contract.test.ts tests/error-code-matrix.test.ts → Test Files 19 passed / Tests 227 passed（无新增失败）
- 邻域选择依据：BUG-1 是「删死字段 + 删死代码」，风险面在 (a) run 快照读侧家族（status/run-status/query-trunk）、(b) 契约面（output-contract/error-code-matrix）、(c) 全量单测目录 tests/unit（含新增改动的 query-run-status/migration-v8/repository-extensions）
- 类型门同批复跑：npx tsc --noEmit → exit 0
- 全量 pnpm test 留到 t5 收口卡一次性采集（避免与 t2/t3/t4 的实施改动交错，读数才干净）

### 下一步

父卡 t-f33d47 收尾：四张子卡全 done 后写父卡汇报并推进到 done

---
