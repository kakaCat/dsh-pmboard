# 拆分计划（REQ-261008020552-4aa0）

> 目标 + 做法：工具面 21→19（archive_amend / note_interruption 收编为 task_amend 的
> op=archive / op=interruption），task_move 模型可见文本 1265→≤630、submit tasks[]
> 子树描述 1717→≤860（细则下沉拒绝回执）。行为零变化为铁律；五张卡 = 五个独立可回滚
> 单元 U1~U5。本计划须**人批准**后才能落任务卡。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能条款 | 需求条款（FR-1～FR-5） |
| D-x | requirement.md「裁决记录」 | 需求/设计阶段裁定（D-1～D-3） |
| t-x | 本文档任务表 | 任务 |

**本需求不使用 IF/P/C/S/T/UC/M 编号**（不是遗漏，是设计已声明的边界）：
refactor 类、零对外接口变更（被删工具的入参/返回逐字平移到新 op）、零界面改动、
零台账 schema 迁移（design/migration.md §1）；「落点」列直接填 FR 编号 + 具体文件路径。

D-3 出处：design/architecture.md §4（旧工具名文案/留痕替换，经 design 确认门落章的
有意偏差），不进 tasks[] 的 decisionRefs（其原文不在 requirement.md），在卡内
implementation 里引用。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 收编 archive_amend 为 task_amend(op=archive)（U1） | FR-1 | FR-1 + src/tools/TaskAmendTool/、src/tools/registry.ts、src/index.ts、src/application/use-cases/AmendArchiveManifest.ts、src/application/dive/boundary-guard.ts；删 src/tools/ArchiveAmendTool/ | — | D-1 | implement | backend | — | M | ① grep -rn "reqboard_archive_amend\|ArchiveAmendTool\|defineArchiveAmendTool" src tests README.md 零命中；② `pnpm vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts` 全绿；③ `pnpm vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts` 全绿（ctx.tools 无 reqboard_archive_amend）；④ op=archive 返回体 = 原工具键集 + op 回显（测试断言） | （按分类兜底） |
| t2 | （落库后回填） | 收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2） | FR-2 | FR-2 + src/tools/TaskAmendTool/、src/tools/shared.ts、src/domain/stage/StageActions.ts、src/application/dive/boundary-guard.ts、src/application/use-cases/NoteInterruption.ts；删 src/tools/NoteInterruptionTool/ | — | D-2 | implement | backend | t1 | M | ① grep -rn "reqboard_note_interruption\|NoteInterruptionTool\|defineNoteInterruptionTool" src tests README.md 零命中；② `pnpm vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts` 全绿；③ 新增行为测试：挂起确认期间 op=interruption 可调成功、op=refs 仍被 REQBOARD_CONFIRM_PENDING 拦；④ 契约三件（tools-dispatch/apply-wiring/output-contract）绿，注册名单 19 | （按分类兜底） |
| t3 | （落库后回填） | task_move 描述结构减负 1265→≤630（U3） | FR-3 | FR-3 + src/tools/TaskMoveTool/TaskMoveTool.ts、tests/task-move-prompt-budget.test.ts（新建） | — | — | implement | backend | — | S | ① 体量脚本（defineTaskMoveTool(stub deps) 后 description.length + parameters 描述递归和）≤ 630（基线 1265）；② `pnpm vitest run tests/task-move-prompt-budget.test.ts` 绿（含细则之家三条断言）；③ `pnpm vitest run tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts tests/legacy-compat-6749.test.ts` 全绿 | （按分类兜底） |
| t4 | （落库后回填） | submit tasks[] 子 schema 描述下沉 1717→≤860（U4） | FR-4 | FR-4 + src/tools/SubmitTool/SubmitTool.ts、src/application/internal/plan-deps-check.ts、src/application/internal/plan-granularity.ts、tests/submit-prompt-budget.test.ts | — | — | implement | backend | — | M | ① 体量脚本读数：tasks[] 子树描述递归和 ≤ 860（基线 1717）且 SUBMIT_PROMPT ≤ 1300 不破；② 门禁测试绿：体量判据 + 细则之家逐条（dep_reasons 写法/granularity_exempt 条件/footprint 口径/skipIntegration 联动/prototypeRefs 条件/template 键清单各能在对应回执读到）；③ `pnpm vitest run tests/submit-prompt-budget.test.ts tests/plan-granularity.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts tests/dual-field.test.ts tests/plan-footprint.test.ts` 全绿 | （按分类兜底） |
| t5 | （落库后回填） | 同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19） | FR-5 | FR-5 + README.md、package.json、docs/architecture/tool-face-inventory.md、docs/architecture/project-manual.md、docs/knowledge/architecture.md、docs/knowledge/glossary.md | — | — | doc | backend | t1,t2,t3,t4 | S | ① `pnpm vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/apply-wiring.test.ts` 全绿（注册名单=19）；② grep "19 个" package.json README.md 均命中；③ `pnpm kb:check` 退出码 0；④ `pnpm test` 全绿；⑤ `pnpm baseline:check` 与 `pnpm typecheck` 退出码 0 | dev,review |

## 依赖说明

- t2→t1：同改 TaskAmendTool.ts / prompt.ts / summary.ts / registry.ts / index.ts
  （真实文件交集，串行防冲突）。
- t5→t1~t4：收尾读数依赖前序落地结果（工具面终态、文档口径、新门禁进场），
  纯时序约束（tasks[] 的 dep_reasons 已逐条声明）。
- t3、t4 互不依赖、也不依赖 t1/t2（文件面零交集，可并行）。

## 覆盖完整性规则（自查）

- FR-1→t1、FR-2→t2、FR-3→t3、FR-4→t4、FR-5→t5：五条 FR 全部有落点，无悬空。
- D-1→t1、D-2→t2（关联 D-x 列）；D-3 在 t1/t2 卡内 implementation 引用（出处设计文档）。
- 非目标 N1~N6（requirement.md）不产生任务卡。

## 验收口径（全批共用）

1. 各卡验收标准逐条跑（命令级判据见任务表）。
2. 体量复测：与基线同口径 tsx 脚本（defineXTool(stub deps) 递归求和）。
3. 全量闸（C-11~C-15）：pnpm test / baseline:check / typecheck / kb:check / build。
