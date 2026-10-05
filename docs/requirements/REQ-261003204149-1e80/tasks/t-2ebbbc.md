# t-2ebbbc 输出契约防线：回退回执加入动态校验

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
输出契约防线：回退回执加入动态校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/output-contract.test.ts -t 回退 绿；判别力：临时从 schema 删掉 tasks_reworked 声明 → 该用例必红且消息含 未在 output.schema 声明。

## 实施方案（implementation）
在 tests/output-contract.test.ts 的动态 describe 中加回退成功路径用例，复用既有递归校验 assertConformsToSchema 断言 rollback 四键均被声明。

## 上游产出摘要（dependsSummary）
- 回退用例集：TC-1…TC-16 + 双通道对拍

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T13:28:36.234Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

回退回执有了自动化拦网：以后谁改回执字段却忘了同步契约声明，用例会立刻红并指名道姓——当天两次「成功调用变报错」的事故形状，从此被拦住。

### 完成项

- 回退回执加入 output-contract 动态防线：递归校验走进 rollback 内层
- 覆盖两件事：四键齐备 + 每键都被 schema 声明
- 判别力自证：删掉 tasks_reworked 声明 → 必红且消息精确指向该字段
- 与静态扫描形成互补（静态只看顶层键，看不见嵌套对象）
- 全量与 tsc 均与基线一致

### 改动文件

- `tests/output-contract.test.ts`

### 下一步

投递最后一张：兼容与回归收口

---
