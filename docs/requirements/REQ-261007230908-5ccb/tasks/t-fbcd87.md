# t-fbcd87 全量回归与验收材料汇总

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量回归与验收材料汇总

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm test 全绿；pnpm typecheck 0 错；pnpm build:client OK；验收材料含各卡判据输出摘要

## 实施方案（implementation）
跑 pnpm test / pnpm typecheck / pnpm build:client 与三条新门禁；汇总输出摘要进卡文档；不改产品代码

## 上游产出摘要（dependsSummary）
- 注册表一致性硬门 tests/error-code-registry.test.ts
- prompt 列码校验 tests/prompt-error-codes.test.ts
- client toolviews 映射改从注册表派生
- 双拼归一单源化 dual-field.ts + 4 处改写
- 收官对照表 closure-audit.md

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:00:31.406Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t8 全量回归：三条新门禁 24/24 绿、build:client OK、全量测试无新增失败；typecheck 2 处报错经查全属他窗在飞文件，本批零 TS 报错

### 完成项

- 三条新门禁全绿：注册表 11/11、prompt 校验 3/3、dual-field 10/10（24 项）
- 读数：注册表条目 133 = 扫描大写码 133；prompt 文案面 24 个码全部已注册
- pnpm build:client → 退出码 0，verify-client OK（778084 bytes，关键符号齐全、样式归属章在场、CSS 分片完整）
- pnpm test：37 失败文件 / 67 失败用例（本批后）；开工前同树基线 38 / 68 —— 无新增失败
- 失败名单零命中本批文件（error-code-registry / prompt-error-codes / dual-field / error-code-inventory / plan-granularity / prompt-baseline / tools-dispatch / toolviews-contract 全不在名单）
- 偏差声明（响亮报出）：pnpm typecheck 未能 0 错——2 处错误全在 src/application/internal/ask-timed.ts 与 tests/ask-timed.test.ts，根因是他窗在飞的 src/application/ports.ts 改动（ConfirmContext 未导出 / GateId 收窄）；本批新增与改动文件零 TS 报错（过滤验证）
- 本批成品面：6 份设计 + 4 个新代码/测试文件 + 4 个 prompt 文案 + 收官对照表，全部判据可跑可复核

### 下一步

汇总验收材料 → reqboard_submit(kind=verification)

---
## 汇报 2（2026-10-07T16:00:43.699Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t8 完成：全量回归与验收材料汇总就绪，异常项已如实披露

### 完成项

- 链尾总验收完成：三条新门禁 24/24 绿、build:client OK、全量测试无新增失败、收官表可核
- 五张前置卡（t1/t2/t3/t4/t5/t6/t7）全部 done，本卡为其汇总与异常披露
- 唯一异常：pnpm typecheck 2 文件 3 处报错，全部属他窗在飞 ports.ts 改动（ask-timed.ts / ask-timed.test.ts），本批文件零 TS 报错
- 验收材料要点清单已就绪，下一步提交 kind=verification

### 下一步

reqboard_submit(kind=verification) 提交验收材料

---
