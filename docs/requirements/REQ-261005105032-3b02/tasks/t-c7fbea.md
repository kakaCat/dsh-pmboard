# t-c7fbea 实现裁定记录门与会话留痕判据（decision-gates.ts）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
实现裁定记录门与会话留痕判据（decision-gates.ts）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/decision-gates.test.ts 全绿：有留痕且缺节 → decision_log_missing；条目缺原话来源或影响 FR 未命中真实 FR → decision_entry_invalid 且 gaps 同时列出 D-3 与 D-5；跳号 D-1,D-3 与重复 D-2,D-2 均拒；真空态且无留痕 → 放行；有留痕却只写真空态 → 仍拒；非 feature 需求返回 undefined；冷读路径用例标 @integration 且默认不跑。pnpm typecheck 退出码 0。

## 实施方案（implementation）
新建 src/application/internal/decision-gates.ts（≤400 行），导出 checkDecisionLogGate(docs, req) 与 hasDecisionTrace(sessionProbe, req, opts?)。门禁：找节名逐字 '## 讨论与裁定记录（D-x）'（仅 feature 需求要求该节，D-12）；缺节 → decision_log_missing；节内表格按五列 编号|原话来源|裁定|影响 FR|判据 逐行校验，任一列空或『影响 FR』未命中 extractClauseDefinitions 的真实条款 → decision_entry_invalid 且 gaps 逐条点名条目编号（不是修一条报一条）；编号 D-\d+ 连续且唯一（复用 checkClauseSequence 思路，独立命名空间；跳号与重复都拒）；整节只写「本节无裁定」视为真空态、不视为空节、放行。留痕：hasDecisionTrace 复用两条读法（快照事件优先、持久化冷读回落），只取 source.kind==='user'，只扫最近 200 条（opts.limit 可覆写），命中祈使词表 改成/不要/必须/加上/应该是/记得/注意/别/要 即视为存在留痕；该启发式只用于『要求本节非空』，不判条目内容、不承诺召回率可测（召回由 G2 人评审承担）；并断言不新增数据源。依据 design-brief §3 与 §10 #16/#20/#23/#24。

## 上游产出摘要（dependsSummary）
- 登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约
- 扩编号白名单（D-\d+）与台账新可选字段契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
