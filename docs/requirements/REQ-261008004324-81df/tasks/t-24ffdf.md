# t-24ffdf 落定逐文件定性台账与另案点名清单

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
落定逐文件定性台账与另案点名清单

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
台账文件存在且 grep -c '^| tests/' docs/requirements/REQ-261008004324-81df/qualitative-ledger.md ≥ 37；另案清单 7 行齐且每行有生产侧依据；任一行留空即不算过。

## 实施方案（implementation）
按 design/fix-design.md 的「定性协议」把 37 个文件的定性落成台账 docs/requirements/REQ-261008004324-81df/qualitative-ledger.md：五列（文件 / 桶 / 首条读数 / 定性 / 依据）每文件一行，依据必须是命令读数、需求 id 或 文件:行 之一；另案清单 7 行逐条带生产侧依据。只写文档，不改任何代码或测试。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:08:32.649Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

37 个红测试文件的定性台账落盘，谁该改测试、谁该改生产一眼可查。

### 完成项

- 落盘 docs/requirements/REQ-261008004324-81df/qualitative-ledger.md（台账 + 另案清单 + 定向纪律三节）
- 台账 37 行齐（A 类 25 / C 类 6 / B 类 5），每行五列且依据非空——机械核对：台账数据行 37、空列 0
- 另案点名清单 7 行逐条带生产侧根因（文件:行 指向）
- 计入两条次要技术债：session-driver.ts:491 的 warn/info 不符、gate-prompt.ts:220-223 零投递且零日志
- 定向纪律成文：真缺陷 11 条用例禁止改断言转绿，留作另案证据

### 改动文件

- `docs/requirements/REQ-261008004324-81df/qualitative-ledger.md`

### 下一步

各修复卡按台账定向动手；t13 收口时用本台账核对剩余红的归属。

---
