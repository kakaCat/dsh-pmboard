# t-6e1a6c 探针与机器自检（回归 + 构建 + 知识层生成物 + 尺寸门禁）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
探针与机器自检（回归 + 构建 + 知识层生成物 + 尺寸门禁）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
`npx tsx scripts/open-window-inherit-probe.mts` 退出码 0 且输出六读数、三对相等；`pnpm kb:check` 退出码 0；`npx vitest run tests/size-budget.test.ts` 全绿；`docs/requirements/REQ-261005151245-54ae/evidence/checks.md` 含 build / typecheck / test / kb:check 四条命令与输出摘要。

## 实施方案（implementation）
新增 `scripts/open-window-inherit-probe.mts`（假宿主服务跑通三入口链，打印 source_title / child_title / source_preset / child_preset / source_model / child_model 六读数并断言三对相等，另打印三段附加耗时；退出码 0 或 1）；跑并记录 `pnpm build`、`pnpm typecheck`、`pnpm test`（对照基线 106）、`npx tsx scripts/kb-build.mts --write` 后 `pnpm kb:check`、`npx vitest run tests/size-budget.test.ts`；命令与输出摘要写进 `docs/requirements/REQ-261005151245-54ae/evidence/checks.md`。

## 上游产出摘要（dependsSummary）
- 外壳接线（工具 schema / 一行摘要 / 迁移开窗路由）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:42:40.819Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，交付面有一份可复核的机器证据；门禁里不属于本需求的那些红，也都点了名。

### 完成项

- 探针落盘并跑通（exit 0、六读数、三对相等）
- 构建 / 类型 / 全量 / 知识层 / 尺寸五条命令全部跑过并留证
- evidence/checks.md 含四条命令与输出摘要 + 失败归属表
- 如实披露：kb:check 与 size-budget 的红为既存，本需求贡献为零（探针已登记）；size-budget 中两个已超限文件被本需求加行，已点名

### 改动文件

- `scripts/open-window-inherit-probe.mts`
- `docs/requirements/REQ-261005151245-54ae/evidence/checks.md`

---
