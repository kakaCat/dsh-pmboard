# t-cf8f13 扩编号白名单（D-\d+）与台账新可选字段契约

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
扩编号白名单（D-\d+）与台账新可选字段契约

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/clause-numbering.test.ts tests/serve-extraction.test.ts 全绿且含断言：collectIds('D-1') 深等于 ['D-1']；collectIds('D-ARCH-2') 深等于 ['D-ARCH-2']；collectIds('D-1 D-ARCH-2') 同时含两项；collectIds('D-1abc') 为空数组；stripPrototypeAnchors('prototypes/x.html#FR-4') 输出含 '<proto-anchor>' 且对该输出再 collectIds 不含 'FR-4'。pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 src/application/internal/content-gates.ts：ID_PATTERN 交替里新增一支 D-\d+（与既有 D-[A-Z]+-\d+ 共存、互不冲突）；新增纯导出函数 stripPrototypeAnchors(text)，把 \S+#FR-\d+ 形态替换为固定 token <proto-anchor>，并在 extractServesFrom 与 serves 抽取入口前置调用（锚点不计 serves，堵假引用）。改 src/shared/protocol.ts：StageArtifact 增可选 prototypeMeta?: { anchors: {fr: string; selector: string}[]; geometry: {name: string; value: number; unit: 'px'|'count'|'ratio'; at: {width: number; state: 'inflight'|'terminal'}; source?: 'prototype'|'human'}[] }；TaskRecord 增可选 prototypeRefs?: string[] 与 decisionRefs?: string[]。三个新键一律加性变更、零迁移：旧记录缺键=未采集，不补齐、不改写、无迁移脚本，旧读取路径与旧形状不变。依据 design-brief §4 与 §10 #6/#36/#41/#49/#50。

## 上游产出摘要（dependsSummary）
- 定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
