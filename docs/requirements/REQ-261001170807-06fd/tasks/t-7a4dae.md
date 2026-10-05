# t-7a4dae 复现：把两个缺陷写成红的用例

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
复现：把两个缺陷写成红的用例

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/e2e-close-chain.test.ts tests/subtask-template-acceptance.test.ts → 修复前必须失败（证据留档 evidence/repro-red.txt），失败点为 REQBOARD_BULK_CLOSE 与"acceptance 无可执行命令"

## 实施方案（implementation）
新建 tests/e2e-close-chain.test.ts：用假时钟走"落库 1 父 + 4 子 → 关 4 子 → 关父"，断言父卡一次成功（修复前必红，返回 REQBOARD_BULK_CLOSE）；另在 tests/subtask-template-acceptance.test.ts 断言各阶段 acceptance 含 npx/pnpm 命令（修复前必红）。运行并把红输出留档 evidence/repro-red.txt。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T09:24:18.985Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

复现完成：两个缺陷都先写成了红的用例——父子链收尾被 60s 节流拒绝（A1）、子卡模板验收标准无可执行锚点；红/绿两态输出留档。

### 完成项

- tests/e2e-close-chain.test.ts：A1 修复前红（命中本卡子卡）
- tests/subtask-template-acceptance.test.ts：修复前红（16 阶段无命令锚点）
- 红输出留档 evidence/repro-red.txt

### 改动文件

- `tests/e2e-close-chain.test.ts`
- `tests/subtask-template-acceptance.test.ts`
- `docs/requirements/REQ-261001170807-06fd/evidence/repro-red.txt`

### 下一步

t2/t3 修复卡

---
