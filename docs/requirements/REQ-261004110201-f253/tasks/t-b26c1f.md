# t-b26c1f 定契约：路由解析 + 三个配置 + 可选字段·研发

> 需求：REQ-261004110201-f253 PM 工作流业务设计：模型路由 + 阶段遥测 + 确认聚合深化 + 优先级与 WIP 上限

## 在做什么
定契约：路由解析 + 三个配置 + 可选字段·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T03:09:34.852Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

契约定死了：路由表「怎么算合法、怎么命中」由纯函数说了算，三个配置缺省时是现状、配错时装配期就响，三个新字段全部可选不动存储版本——后面几张卡可以照着这张契约写实现了

### 完成项

- 新增 domain/task/StageRouting.ts：validateStageRouting（未知阶段/非法难度/空值/未知字段/多 @ 全部抛错并点名）+ resolveStageModel（stageKind@difficulty 优先于 stageKind，未命中返回 undefined）
- plugin-config.ts 增三个可选配置 stageRouting / maxInFlightRequirements / zeroOutputAlertThreshold，并配三个 accessor：stageRoutingSetting / maxInFlightRequirementsSetting / zeroOutputAlertThresholdSetting——缺省分别是 {} / 0 / 2（= 现状），非法则抛 REQBOARD_STAGE_ROUTING_INVALID / REQBOARD_MAX_INFLIGHT_INVALID / REQBOARD_ZERO_OUTPUT_THRESHOLD_INVALID
- protocol.ts 增三个可选键：ExecutionRecord.outputCount / zeroOutput、RequirementRecord.priority（均无必填、不改存储版本、不动既有字段）
- 新增 tests/stage-model-routing.test.ts 契约段 12 用例全绿：含难度枚举与 shared ALL_PROMPT_DIFFICULTIES 逐值一致（真实枚举锁死）、STAGE_KINDS 全量可作路由键、三个 accessor 缺省与非法语义、协议新键在缺省记录上 hasOwnProperty === false
- npx tsc --noEmit 归属本卡文件零错；layer-boundary 三红为基线既有（违规文件均为既有 gate/diag/rtm 等，非本卡引入）

### 改动文件

- `src/domain/task/StageRouting.ts`
- `src/plugin-config.ts`
- `src/shared/protocol.ts`
- `tests/stage-model-routing.test.ts`
- `docs/requirements/REQ-261004110201-f253/tasks/t-b26c1f.md`

### 下一步

联调段（t-f5efe1）：核对契约消费面与分层约束

---
