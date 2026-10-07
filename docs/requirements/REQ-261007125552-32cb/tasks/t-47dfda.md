# t-47dfda 粒度门禁 wiring 与三入口挂载·研发

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
粒度门禁 wiring 与三入口挂载·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/plan-granularity.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T05:55:06.345Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

t3 研发段完成：粒度门禁判定单点 + 三入口挂载 + schema/错误码登记全落地，受影响面回归无新增失败（6 条红全部经 stash 隔离证实为既有工作区债）。

### 完成项

- 新建 plan-granularity.ts：assertGranularityGates 三维判定（对照表门/接口数门/形态软门）+ 降级与豁免披露
- 三入口挂载：SubmitArtifact（覆盖门后）/ Decompose（mutate 前）/ approved-plan-landing（覆盖门同序），两处返回体 +granularity_warnings
- GateFailure 联合 +3 码；TRANSPORT_CODE_BY_INTERNAL +3 映射；SubmitTool/DecomposeTool schema 补 granularity_exempt 与 granularity_warnings
- 错误码清单刷新+分级：本需求 3 码 + 既有欠账 2 码（原型门），error-code-inventory 11/11 转绿
- TC-3/4/5/6/8/10 落地：39+ 例全绿；decompose-tools 5 条与 plan-mode 1 条失败经 stash 隔离证实为既有工作区改动引入

### 改动文件

- `src/application/internal/plan-granularity.ts`
- `src/application/use-cases/SubmitArtifact.ts`
- `src/application/use-cases/Decompose.ts`
- `src/application/internal/approved-plan-landing.ts`
- `src/application/internal/artifact-gates.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/DecomposeTool/DecomposeTool.ts`
- `tests/plan-granularity.test.ts`
- `tests/fixtures/error-code-inventory.json`

### 下一步

复核段：对照 backend.md §FR-2/FR-4/FR-5 判定流程与三入口挂载表核对

---
