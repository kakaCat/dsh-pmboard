# t-2e4d0e 定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
pnpm typecheck 退出码 0；npx vitest run tests/artifact-spec.test.ts tests/artifact-labels.test.ts 全绿且含断言：kindForRelPath('prototypes/detail.html')==='prototype'；kindForRelPath('prototype/detail.html')==='prototype'；kindForRelPath('prototypes/INDEX.md')==='prototype'；kindForRelPath('prototypes/detail.html.bak')==='notes'；stageForKind('prototype')==='brainstorming'；KIND_LABELS.prototype==='原型'。git diff package.json 为空（零新增运行时依赖）。

## 实施方案（implementation）
改 src/domain/artifact/ArtifactSpec.ts：ArtifactKind 联合与 ALL_ARTIFACT_KINDS 各加 'prototype'；NAME_TO_KIND 在既有 7 条之后追加三条（/^prototypes\/.+\.html$/、/^prototype\/.+\.html$/、/^prototypes\/INDEX\.md$/ → prototype；首条权威路径、次条旧路径兼容、末条 INDEX 自身，均不得再回落 notes）；stageForKind 为 'prototype' 加显式 case 返回 'brainstorming'（禁止 default 误归阶段）。改 src/shared/artifact-labels.ts：KIND_LABELS.prototype = '原型' 且 Record<ArtifactKind, DocPanelKind> 穷尽（否则 artifact-labels 中文名护栏用例拦）。改 src/shared/protocol.ts：DocPanelKind 增 'prototype'；DocPanelEntry 增可选 prototypeRole?: 'authoritative'|'superseded' 与 supersededBy?: string（缺省不注入，旧形状不变）；SUBMIT_KINDS 增 'prototype'。注意：VerificationItemSource 的真源在 src/domain/workflow/AcceptanceSheetSpec.ts、protocol.ts 只 re-export，本卡不动它（由 t18 改）。依据 design-brief §1 与 §10 #1/#3/#30/#33。验证：pnpm typecheck。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
