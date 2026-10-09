# t-1bb2e9 收口：知识层与契约基线齐步并跑全量回归

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收口：知识层与契约基线齐步并跑全量回归

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① `pnpm kb:check` → 退出码 0；② `npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts tests/prompt-cost.test.ts tests/prompt-baseline.test.ts` → 全绿；③ `pnpm test` → 无新增红（与基线集合差为空，剩余红逐条有归属）；④ t1..t4 的验收命令在同一批复跑全绿。

## 实施方案（implementation）
① 重生成知识层并自检：`npx tsx scripts/kb-build.mts --write` 更新 `docs/knowledge/code-map.md` 与 `docs/knowledge/code-map.symbols.tsv`（BUG-1 删符号后必须刷新），随后 `pnpm kb:check` 必须退出码 0；② 用 `npx tsx tests/drill/refresh-error-code-inventory.mts` 复核 `tests/fixtures/error-code-inventory.json` 与注册表双向一致（t3/t4 的两个新码在此复核）；③ 核对 t2 的文案与行为一致（TaskMoveTool 文案 vs MoveTask 判定），若提示词字数基线因文案变化触发，按「本次引入必须刷新并写理由」的纪律处置，禁止改断言转绿；④ 跑全量回归（pnpm test），与开工前基线做集合差，无新增红；他窗在飞的红逐条点名归属，不代改不回滚。

## 上游产出摘要（dependsSummary）
- 删除 run 快照的三处死字段与其死代码
- 给批量收尾加非子卡 done 上限 N=3
- 子卡执行改先认领后执行并对并发派发说不

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T18:01:42.462Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

父卡收尾：BUG-5 完成——知识层零漂移、契约与提示词门 73 用例全绿、全量集合差逐条归属

### 完成项

- 三张子卡全 done（研发 → 复核 → 测试）；BUG-5 达成：四条修复触及的工具文案、错误码、类型与基线同批对齐，知识层零漂移
- 知识层：kb-build --write 后 K7「生成物与源码一致（零漂移）」+ K9「符号表 3394 = 源码口径 3394」双双 ✅（改前 2 处漂移）；错误码清单连跑第二次零写盘（幂等）
- 契约面：error-code 三件套 + output-contract + prompt 三件套 → 7 文件 / 73 用例全绿（含 error-code-matrix 的「零覆盖 ≤5」维持 5：两个新码都被各自用例覆盖，不是靠放宽阈值）
- 文案齐步：TaskMoveTool 文案与 MoveTask 判定同句同源常量；复核时发现并修掉 MoveTask 头注释第 26 行的修前口径（同批改，避免注释与行为分叉）；StatusTool/ExecuteTask 注释与实现一致
- 偏离说明（响亮记录）：pnpm kb:check 未达「退出码 0」，剩余 3 项失败全部**非本需求引入**且已附 HEAD 证据——K1 INDEX.md 超限（HEAD 版即 16624 字节 > 8000，且工作树被别窗加了 5 行索引）、K3 conventions.md 222 行 > 200（文件未修改、HEAD 即 222 行）、K14 kb-0064/0065 待刷新基线（条目 tracked 且未修改、基线文件不含它们）；按计划边界不代改不代刷
- 全量回归集合差：本次失败 23 / 基线 68；新增 7（全在 tests/kb-ensure.test.ts，单跑与其家族同跑均全绿 = 顺序相关，测试文件与被测模块均未被改动，与本需求零交集）/ 不再失败 52；tsc error TS 0

### 改动文件

- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`
- `src/application/use-cases/MoveTask.ts`

### 下一步

本卡收尾后需求应自动进验收；下一节点 = accepting（提交验收材料 reqboard_submit(kind=verification)）

---
