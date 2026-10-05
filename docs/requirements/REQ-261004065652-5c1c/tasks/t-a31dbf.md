# t-a31dbf 定契约：失败分类器 + 三个判定纯函数 + 类型扩展·研发

> 需求：REQ-261004065652-5c1c Dive 死循环根治：投影同源 + 失败熔断 + 中断即闭锁

## 在做什么
定契约：失败分类器 + 三个判定纯函数 + 类型扩展·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T23:10:08.851Z，窗口 session-2680cf17-b887-4352-bfdd-65ca72b53558）

t1 研发段完工：四份契约模块（失败分类器 / 全局额度闩 / 人工门判据 / 预算闸）落地，配 48 条新用例；类型闸门与基线持平。

### 完成项

- 新增 upstream-failure.ts：classifyTurnEnd 五条判定顺序 + reasonClassOf + 200 字截断
- 新增 provider-latch.ts：TTL 5 小时、trip 幂等不续期、clear 只认人/系统
- 新增 human-gate.ts：验收单/计划/产物三类门；过程产物（task_detail 等）不算门
- 新增 chain-budget.ts：WIP 上限 3 + cacheRead 5 亿粗闸；不杀在跑链
- RequirementFacts 增 tokenUsage 三标量投影（缺失即无消耗，不伪造 0）
- 新增四份用例共 48 条，全绿（4 passed / 48 tests）
- tsc 全仓 144 与开工基线持平，改动文件零类型错误
- 偏离卡文 1 处：未扩 DrivableShape——设计改走注入端口，理由见架构设计 §FR-5/FR-11

### 改动文件

- `src/application/internal/upstream-failure.ts`
- `src/application/internal/provider-latch.ts`
- `src/application/internal/human-gate.ts`
- `src/application/internal/chain-budget.ts`
- `src/domain/requirement/RequirementSummary.ts`
- `tests/upstream-failure.test.ts`
- `tests/provider-latch.test.ts`
- `tests/human-gate.test.ts`
- `tests/chain-budget.test.ts`

### 下一步

复核段（t-fd132a）：逐条核对设计与实现的差异（含上面那处偏离）

---
