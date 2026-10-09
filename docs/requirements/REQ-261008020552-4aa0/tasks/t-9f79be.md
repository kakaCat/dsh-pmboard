# t-9f79be submit tasks[] 子 schema 描述下沉 1717→≤860（U4）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
submit tasks[] 子 schema 描述下沉 1717→≤860（U4）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① 体量脚本读数：tasks[] 子树描述递归和 ≤ 860（基线 1717）且 SUBMIT_PROMPT ≤ 1300 不破；② 门禁测试（扩展 submit-prompt-budget 或新增姐妹文件）绿：体量判据 + 细则之家逐条（dep_reasons 写法/granularity_exempt 条件/footprint 口径/skipIntegration 联动/prototypeRefs 条件/template 键清单各能在对应回执读到）；③ pnpm vitest run tests/submit-prompt-budget.test.ts tests/plan-granularity.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts tests/dual-field.test.ts tests/plan-footprint.test.ts 全绿

## 实施方案（implementation）
按 design §6 映射表施工：① SubmitTool.ts tasks[] 21 个属性描述压成一句话，三对双拼字段说明合并为「snake/camel 等价」；enum/结构承载的枚举清单从描述删除；② 各门禁回执只追加细则句：plan-deps-check.ts 伪依赖拒绝消息追加 dep_reasons 写法、plan-granularity.ts 软门 warnings 追加 footprint 口径、skipIntegration 联动句进 normalizePlanTasks/plan-landing 对应拒绝、prototypeRefs 条件句进原型锚点门禁、template 非法键拒绝回执列全部合法键；③ SUBMIT_PROMPT 不动、results[] 子树不动；④ 纪律：错误码/结构化字段/既有文案语序不变，既有逐字文案断言只允许为追加句放宽，逐条留痕。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T19:43:53.871Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U4 完工：submit tasks[] 子 schema 描述 1717→≤860 达标，六条细则之家门禁常驻，REQBOARD_TESTING_COVERAGE_GATE 等既有契约零影响

### 完成项

- 研发（t-ac655f）：tasks[] 子树 1717→≤860（实测 657+tasks 描述），门禁八条进场，棘轮零上升
- 联调（t-e67903）：门禁矩阵 + submit 面 + 契约 17 文件 254 测试全绿
- 复核（t-4718f1）：diff 只含描述压缩/未用导入/两处回执纯追加；footprint 之家位置 refined 已申报；无偏离
- 测试（t-d0f548）：判据①②③全绿；全量新增失败 0；tsc 0 错

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/internal/plan-deps-check.ts`
- `src/domain/task/Footprint.ts`
- `tests/submit-tasks-schema-budget.test.ts（新建）`

### 下一步

U5（t-0f675d）：同步面收尾（docs/知识层 LONG_TEXT 计数段等）+ 全量闸

---
