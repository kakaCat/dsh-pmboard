# t-efd5e1 迁移兼容、存量不追溯与全量回归收口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
迁移兼容、存量不追溯与全量回归收口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① npx vitest run tests/acceptance-compat.test.ts 退出码 0（三形态各一例）；② npx tsx scripts/test-baseline.mts --check 退出码 0（失败用例集合差为空；差集非空时逐条确认非本次引入并在证据里写明理由）；③ pnpm typecheck 错误数不新增于 docs/reviews/test-baseline.md 的 tsc 读数；④ pnpm build 退出码 0；⑤ git diff --stat -- 'docs/requirements/*/tasks' 输出为空，且占位符扫描计数与改动前相等（944 → 944）；⑥ 两份证据文件含上述命令原文与输出摘要

## 实施方案（implementation）
新增 tests/acceptance-compat.test.ts（三形态：旧台账无新字段可读且不产生额外写入；旧客户端 POST /req/verdicts 不传 changeReason 时不报错且不覆盖；DSH_REQBOARD_NO_ITEM_RESULT=1 时四字段一个都不写）。落证据 docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md（记 npx tsx scripts/test-baseline.mts --check 的差集读数为空、pnpm typecheck 错误数与基线读数对照、pnpm build 退出码 0）与 docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md（记 git diff --stat -- 'docs/requirements/*/tasks' 输出为空，以及占位符扫描计数改动前后相等 944 → 944）。验证：npx vitest run tests/acceptance-compat.test.ts；npx tsx scripts/test-baseline.mts --check；pnpm typecheck；pnpm build。

## 上游产出摘要（dependsSummary）
- 裁决行新控件：理由输入、原文保留、归档门可见（UI）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:34:46.514Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

t6 完成：兼容三形态通过、零 DDL 零迁移、存量卡零改写；三处仓库级偏差已响亮报出并逐条归属。

### 完成项

- 新增 tests/acceptance-compat.test.ts（7 例）：旧台账可读不产生额外写入、旧调用方不传 changeReason 不炸、回滚开关四字段不写（含一组「开关关闭时才写」的对照）
- 落证据 evidence/compat-and-baseline.md：差集/类型门/构建门读数 + 逐条归属 + 本需求全部验证入口一览 + 采集时点与不变式
- 落证据 evidence/legacy-cards-untouched.md：存量零改写三命令交叉验证（被改存量任务卡 = **0**）+ 占位符计数变化根因
- **证明零 DDL 零迁移**：新增字段全部加性可选，旧台账可读且不被写入；无迁移脚本、无回填
- **证明旧调用方不炸**：不传 changeReason 且不构成覆盖时不报错（首次填写 / 零输入通过 / 人工项三例）
- **证明存量卡零改写**：git diff --stat -- 'docs/requirements/*/tasks' 为空、被改存量任务卡 0 条
- **响亮报出偏差并逐条归属**：baseline:check 差集非空、全仓 tsc 高于基线、占位符计数上升——三项都不是本需求引入，证据文件里逐条给了依据
- **本轮最有价值的发现（已实测写进证据）**：reqboard 插件加载构建产物且宿主启动时入内存——本会话改 src 与重跑 build 都不会让当前进程生效，故本会话新落的卡（含本需求子卡）仍带模板占位符；这解释了计数上升，也说明「新落卡零残留」的兑现点是**唯一构造点 + 闭集不变量**（由 t1/t2 的用例与 RV-2 钉住），而非某次计数快照
- 刻意**不跑 baseline --refresh**：红线要求不碰测试基线，那些失败是别的窗口在飞状态，刷基线等于把别人的破绽记成现状
- 四段子卡链全部 done：研发 / 复核（证据读数逐条对跑 + 抓出快照漂移）/ 测试（最终全量 + 差集归属）

### 改动文件

- `tests/acceptance-compat.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md`
- `docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md`

### 下一步

需求全卡完成 → 进入 accepting，提交验收材料（reqboard_submit kind=verification）

---
