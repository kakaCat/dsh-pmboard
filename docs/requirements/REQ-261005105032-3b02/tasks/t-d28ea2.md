# t-d28ea2 加 RTM 触发点 submit:prototype 与健康检查适用性判据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加 RTM 触发点 submit:prototype 与健康检查适用性判据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/rtm-trigger-prototype.test.ts tests/rtm-health-legacy.test.ts 全绿：调 syncRTMYaml('submit:prototype', {paths:['prototypes/detail.html']}) 后 brainstorming YAML 被刷新且返回 ok、paths 在留痕中可见；RTM 写盘失败只返回 warning、不抛；存量标本（createdAt < prototypeRulesSince）缺节 → exempted: legacy 且不判不健康；新需求标本（createdAt >= prototypeRulesSince 且 sides 含 frontend）缺节 → 不健康并点名该需求；expectedRTMFiles() 仍返回 7 项。pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 src/application/internal/rtm-yaml.ts：RTMTrigger 增 'submit:prototype'（与既有 6 个触发点同构），载荷 { paths: string[] }（本次登记的原型路径），刷新 rtm-brainstorming.yml 与 rtm-lifecycle.yml；生成器仍以台账为事实源，载荷只用于增量刷新与留痕、不当唯一来源；RTM 失败只记 warning 并结构化返回，不打断登记主流程。改 src/application/internal/rtm-health.ts：expectedRTMFiles() 不变（仍 7 份）；新增适用性判据——只有 sides 含 frontend 且 createdAt >= prototypeRulesSince（插件配置常量，缺省 = 规则上线日）的需求，缺 prototypes 节才判不健康并点名；createdAt < prototypeRulesSince 的一律标 exempted: legacy 并如实报告，不判不健康。依据 design-brief §5 与 §10 #19/#48。

## 上游产出摘要（dependsSummary）
- 扩展 RTM 类型并生成 prototypes/decisions 两节

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T05:50:17.271Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，健康检查学会分辨「该有原型的新需求」和「上线前的老需求」——前者缺原型会被点名，后者如实豁免而不是被追溯牵连。

### 完成项

- 登记原型会顺手刷新追溯（头脑风暴与生命周期两份）
- 台账为事实源：载荷里的幽灵路径不进追溯文件
- 写盘失败只告警不抛，不打断登记主流程
- 健康检查新增适用性判据：只对端侧含前端且晚于规则生效日的需求判不健康并点名该需求
- 存量一律如实标为历史豁免，不判不健康；判不了的情形不误报
- 触发留痕可读（落盘 + 导出读取口）
- 13 例全绿 + 相邻追溯 39 例全绿

### 改动文件

- `src/application/internal/rtm-yaml.ts`
- `src/application/internal/rtm-health.ts`
- `tests/rtm-trigger-prototype.test.ts`
- `tests/rtm-health-legacy.test.ts`

### 下一步

触发点集合的宿主壳收编进公共类型（零行为变化的后续项，已记入执行裁决清单第 6 节）。

---
## 汇报 2（2026-10-05T05:54:16.224Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

补充段：触发点集合从两处收敛为一处，并把「不许再长出第二份」写成了会失败的源码级断言。

### 完成项

- 按裁决把新触发点收编进公共联合类型与分派表，删除宿主侧临时壳（宿主不再自建第二份触发点集合）
- 行为零变化：刷新文件集合逐字同序、失败仍只告警不抛、留痕字段不变、既有触发点回归锁保留
- 新增单一真相锁用例：源码级断言宿主不得自建联合类型或分派，公共侧必须同时有联合成员与分派分支
- 19 例全绿（含新增的单一真相锁与既有两个文件）＋相邻追溯回归 25 例全绿＋typecheck 0

### 改动文件

- `vendor/reqboard/src/rtm/generator.ts`
- `src/application/internal/rtm-yaml.ts`
- `src/application/internal/rtm-health.ts`
- `tests/rtm-trigger-prototype.test.ts`

### 下一步

无（本卡已收尾）；「两处触发点集合」欠债已由本段清除。

---
