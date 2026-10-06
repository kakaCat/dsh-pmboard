# t-dc06b3 加 RTM 覆盖度两维与校验器宽容度

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加 RTM 覆盖度两维与校验器宽容度

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/rtm-coverage-prototype.test.ts tests/rtm-validator-tolerance.test.ts 全绿：UI 卡 prototypeRefs 为空 → 覆盖度 < 100% 且 gaps 点名该卡编号；D-7 未被任何 FR/卡引用 → 点名 D-7 且该维覆盖度下降；缺 prototypes 与 decisions 节的旧 YAML → 读出 pending 且不产生错误；含未知 key 的旧 YAML → 忽略不报错；accepting 生成结果含『原型对照』条目。pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 vendor/reqboard/src/rtm/coverage-checker.ts 与 coverage-calculator.ts：新增两维——① UI 卡（feature/refactor 且 sides 含 frontend 的任务卡）必须有原型锚点（covers_prototypes 非空），缺则覆盖度 < 100% 并点名该卡；② 每条 D-x 必须被至少一条 FR 明细或一张卡的 requirementRefs/decisionRefs 引用，未被引用则点名该 D-x（只降覆盖度与点名，不拒阶段转移）。改 vendor/reqboard/src/rtm/validator.ts：编号白名单认原型锚点前缀（防把锚点判成 dangling）；缺 prototypes/decisions 节 = pending（未采集，不判损坏）；未知 key 忽略不报错（存量 66 条读取不报错）。改 vendor/reqboard/src/rtm/accepting-generator.ts：验收项含『原型对照』证据条目。依据 design-brief §5 与 §10 #19。

## 上游产出摘要（dependsSummary）
- 扩展 RTM 类型并生成 prototypes/decisions 两节

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
