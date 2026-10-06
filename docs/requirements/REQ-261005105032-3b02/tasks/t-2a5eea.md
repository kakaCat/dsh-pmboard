# t-2a5eea 扩展 RTM 类型并生成 prototypes/decisions 两节

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
扩展 RTM 类型并生成 prototypes/decisions 两节

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/rtm-prototype-sections.test.ts 全绿：对标本跑生成后 rtm-brainstorming.yml 含非空 outputs.prototypes（每条带 authoritative 与 anchors）与 outputs.decisions 两节；metadata.rtm_version==='2.0' 而 metadata.version 仍是写入计数；rtm-decomposing.yml 的 task_coverage 每项含 covers_prototypes 与 covers_decisions 键；设计章节文本里的 'prototypes/x.html#FR-4' 经 strip 后不进 serves。pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 vendor/reqboard/src/rtm/types.ts：新增 Prototype（path/authoritative/superseded_by?/serves/anchors/geometry）与 Decision（id/source/verdict/serves/criterion）两个接口，锚点与几何量元素形状统一指向 StageArtifact.prototypeMeta（不另立第二套字段名）；metadata.rtm_version 目标值 "2.0"（与写入计数 metadata.version 不是同一个键）。改 vendor/reqboard/src/rtm/brainstorming-generator.ts：outputs 增 prototypes（每条=一个 Prototype，来源=台账 kind=prototype 产物 + prototypes/INDEX.md）与 decisions（每条=一个 Decision，来源=requirement 的 D-x 表）两节，既有 requirements 节形状不变。改 vendor/reqboard/src/rtm/design-generator.ts：设计章节 serves 允许引用 D-x；原型锚点走独立字段 protoRefs、不进 serves（抽 serves 前先 stripPrototypeAnchors）。改 vendor/reqboard/src/rtm/decomposing-generator.ts：task_coverage[] 增 covers_prototypes（来源 TaskRecord.prototypeRefs）与 covers_decisions（来源 decisionRefs）。依据 design-brief §5 与 §10 #18/#42/#48/#49。

## 上游产出摘要（dependsSummary）
- 扩编号白名单（D-\d+）与台账新可选字段契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
