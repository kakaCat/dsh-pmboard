---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 测试用例设计（REQ-261007125552-32cb）

> 命令口径：单文件 `npx vitest run tests/<file>`；全量 `pnpm test` 后比对基线；类型 `npx tsc --noEmit`。
> 新增测试文件不得改变既有基线结果。任务卡 id 在拆分阶段落库后回填 `covers:`。

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

### TC-1 design 提交缺接口清单节被拦 <!-- serves: FR-1 -->

covers: t-04635a, t-8f5cce, t-fb8d1c, t-a1b795

- **前置**：新立项（createdAt 晚于规则生效时点）feature 需求，design/ 五份齐但 interfaces.md 无「接口清单」节。
- **动作**：调 `reqboard_submit(kind=design)`。
- **断言**：拒，code = `REQBOARD_DESIGN_CONTENT_GATE`，报错点名 interfaces.md 缺清单节且含模板指引；节内写「不适用：<理由>」的另一夹具 → 放行。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "清单节门"`

### TC-2 清单节门不追溯存量 <!-- serves: FR-1, FR-6 -->

covers: t-04635a

- **前置**：createdAt 早于生效时点的 feature 需求，design 无清单节。
- **动作**：调 `reqboard_submit(kind=design)`。
- **断言**：放行（整维跳过），不报清单节缺失。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "存量豁免"`

### TC-3 对照表缺条目硬拒 <!-- serves: FR-2 -->

covers: t-5e3737, t-47dfda, t-adca1e, t-fe0e98

- **前置**：interfaces.md 接口清单 3 条（IF-1/2/3）；decomposition.md 对照表只覆盖 IF-1、IF-2；tasks[] 3 张卡。
- **动作**：调 `reqboard_submit(kind=plan)`。
- **断言**：拒，code = `plan_interface_map_missing`，报错点名 `IF-3`；对照行写 tasks[] 之外的 key → 同样拒、点名悬空 key。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "对照表"`

### TC-4 对照表门降级路径 <!-- serves: FR-2, FR-6 -->

covers: t-5e3737

- **前置**：存量需求（或 design 无清单节且声明豁免）+ 无对照表的旧形态计划。
- **动作**：提交计划 → 批准 → 落库。
- **断言**：落库成功；返回体 `granularity_warnings` 含降级原因（「interfaces.md 无接口清单节」）；**不静默**。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "降级"`

### TC-5 一卡多接口被拦 <!-- serves: FR-4 -->

covers: t-5e3737, t-cbb1b8, t-8c2a5e, t-da1879, t-9c3608

- **动作**：构造 implementation 含 `` `POST /api/a` `` 与 `` `GET /api/b` `` 两处声明的卡提交计划；另构造只含 1 处声明的卡、以及散文提到「接口」但无声明式写法的卡。
- **断言**：多接口卡被拒（code = `plan_card_multi_interface`，报错列出识别到的 2 个接口与拆法建议）；单接口卡过；散文卡过（不误报）。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "接口数门"`

### TC-6 豁免理由放行但不静默 <!-- serves: FR-4 -->

covers: t-9b7245, t-b8958d, t-29ef80, t-f64801, t-5e3737

- **动作**：同一多接口卡带 `granularity_exempt: "契约卡：一次定 3 个接口的契约，实现另拆"` 提交；再带空串提交。
- **断言**：带理由 → 放行且返回体 `granularity_warnings` 含该理由；空串 → 仍拒（空串 ≠ 豁免）。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "豁免"`

### TC-7 词法边界（去重与大小写） <!-- serves: FR-4 -->

covers: t-cbb1b8, t-8c2a5e

- **动作**：同一接口声明在 implementation 出现两次（正文+示例）；小写 `post /api/a`；无路径的裸动词 `POST`。
- **断言**：重复声明去重后计 1；小写不计；裸动词不计。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "词法"`

### TC-8 形态下限软门 <!-- serves: FR-5 -->

covers: t-cbb1b8, t-5e3737

- **动作**：footprint.files=6 的卡、UI 卡 prototypeRefs 两条，分别提交。
- **断言**：均**不拒**；返回体 `granularity_warnings` 逐条点名（files 超阈值 / 一卡多锚点）；`LIMITS.footprintFilesSoftMax` 改动时断言值跟随（阈值单一源回归）。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "软门"`

### TC-9 RTM 一对多接收 <!-- serves: FR-6 -->

covers: t-a99b12, t-b9df55, t-e9cb83, t-f6d563

- **动作**：一条 FR 被 3 张接口卡（各带 `requirement_refs:["FR-1"]`）接收，走完整落库。
- **断言**：RTM `covers_frs` 显示 FR-1 ← 3 卡；条款接收状态 = received；覆盖率 100%；落库卡上 refs 逐卡在位（不是只有文档表有）。
- **命令**：`npx vitest run tests/decompose-rtm-integration.test.ts`（新增用例并入或新文件 `tests/rtm-one-to-many.test.ts`）

### TC-10 三条入口同款拦截 <!-- serves: FR-2, FR-4 -->

covers: t-5e3737, t-47dfda

- **动作**：同一份「对照表缺条目」计划分别走 ① submitPlanArtifact ② decompose(tasks) ③ 看板批准直落（approved-plan-landing）。
- **断言**：三条路径同一错误码、同一点名内容（分派单点回归——防某条路径漏接线）。
- **命令**：`npx vitest run tests/plan-granularity.test.ts -t "三入口"`

## 提示词与模板回归 `serves: FR-1, FR-3`

### TC-11 提示词档含粒度规则 <!-- serves: FR-3 -->

covers: t-7b131b, t-e798d7, t-4c4e32

- **断言**：`grep -n "接口级" src/domain/prompt/fragments/decomposing/heavy.md` 命中；`grep -n "组件级" src/domain/prompt/fragments/decomposing/feature.md` 命中；`pnpm prompts:check` 绿（生成物与源一致）。
- **命令**：`pnpm prompts:check && npx vitest run tests/stage-prompts.test.ts`

### TC-12 模板与探针同口径 <!-- serves: FR-1, FR-2 -->

covers: t-7b131b, t-5e3737

- **断言**：`templates/design/interfaces.md` 含「接口清单」节、`templates/decomposing/decomposition.md` 含两段对照表节；`scripts/template-gate-probe.mts` 对新表头的判据与门禁词法一致（同一份常量/同源登记）。
- **命令**：`npx tsx scripts/template-gate-probe.mts`（按探针既有用法）+ `npx vitest run tests/plan-granularity.test.ts -t "模板"`

## 整体回归 `serves: FR-6`

- 覆盖：`covers: t-1fb094, t-3024d9`（链尾总验收卡与其校验子卡）
- `pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线；
- 既有门禁（覆盖门 / 超容量门 / 文档所见=批准所见）测试全绿——新门不得改变旧门行为。
