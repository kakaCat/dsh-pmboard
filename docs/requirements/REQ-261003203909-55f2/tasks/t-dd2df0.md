# t-dd2df0 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）·研发

> 需求：REQ-261003203909-55f2 dev/integrate/review/test 这个不满足所有内容，需要补充，你调研看看需要补充什么，你可以看所有session的内容来判断

## 在做什么
契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts` → 全绿；TC-1/TC-2 矩阵用例（合法键→链/非法键→原因/stages+template→CONFLICT/五组优先级）全过；TC-3 五表（KINDS/LABELS/ACCEPTANCE/EVIDENCE_KIND/PHASE_COLOR）同 key 集合断言过——第六表 STAGE_SCOPE_RULE 当前是 5 键偏表且含非 stageKind 键，其集合断言随 t4（类型强制改造）落地，t4 验收含该项；`npx tsc --noEmit` 零新增错误

---
## 汇报 1（2026-10-03T15:57:21.271Z，窗口 session-e48f706a-b51f-47a9-85c5-47b7e59bba48）

子卡阶段模板契约落库：四段（e2e/manual/release/capture）与两模板键（change-only/acceptance）登记完毕，template 引用校验与计划 stages 解析纯函数就位，目标用例 24/24 全绿、tsc 149=149 零新增、七套关联用例失败数与基线持平（7 个均为存量）

### 完成项

- stageKind 枚举 16→20：e2e/manual/release/capture 四段全登记（标签/验收模板/证据族）
- 模板表 +2 键：change-only=[dev,review]、acceptance=[verify]（acceptance 为「必含 review」不变量的显式豁免，理由入注释）
- 新增 validateTemplateRef 与 resolvePlanStages 纯函数（优先级 stages>template>兜底，同给即冲突拒绝）
- STAGE_TO_PHASE_COLOR +4 项随 t1 同落（Record 类型强制，拆开会编译错）
- 用例 14 条新增/更新：TC-1 合法非法键矩阵、TC-2 五组优先级、TC-3 五表同 key 集合、TC-4 四段验收模板锚点
- 既有不变量 1.1b 改为显式豁免清单（review-only/acceptance），缺 review 的模板会被点名

### 改动文件

- `src/domain/task/SubtaskTemplate.ts`
- `src/domain/card-types.ts`
- `tests/domain/subtask-template.test.ts`

### 下一步

t1 复核段（t-b30ccb）：对照 design/data-model.md 逐条核对契约落点；第六表 STAGE_SCOPE_RULE 的集合断言归 t4 落地

---
