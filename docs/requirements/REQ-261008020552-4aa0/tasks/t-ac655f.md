# t-ac655f submit tasks[] 子 schema 描述下沉 1717→≤860（U4）·研发

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
submit tasks[] 子 schema 描述下沉 1717→≤860（U4）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/submit-prompt-budget.test.ts tests/plan-granularity.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts tests/dual-field.test.ts tests/plan-footprint.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T19:38:47.645Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U4 研发完成：submit tasks[] 子树 1717→≤860 达标（实测 657+tasks 描述），细则之家八条门禁进场，plan 门禁矩阵 167 测试全绿

### 完成项

- SubmitTool.ts tasks[] 21 属性描述压缩：1535→657（+tasks 自身描述，子树 ≤860 达标）；三对双拼合并为「snake/camel 等价」；phase/side 枚举清单删（enum 结构承载）；stages/template 合法值指向非法值回执
- 回执追加（细则之家）：plan-deps-check 伪依赖回执追加 key=理由 写法与双拼说明；Footprint normalizeFootprint 追加三量口径语义（fmt 拼装）
- 消息卫生棘轮守住：拼接计数相对开工前零上升（application 533 持平、tools 74→66 降、domain/Footprint 21→20 降）
- 新增 tests/submit-tasks-schema-budget.test.ts 八条：体量 ≤860 + PROMPT ≤1300、六条细则之家（全部调真实函数取 message）、形状不变式（21 键集/双拼对/封闭形状/footprint 三键）
- 移除因压缩变成未用的 STAGE_KINDS/SUBTASK_TEMPLATES 导入；tsc 0 错

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/internal/plan-deps-check.ts`
- `src/domain/task/Footprint.ts`
- `tests/submit-tasks-schema-budget.test.ts（新建）`

### 下一步

联调子卡：plan 门禁矩阵 + 契约面复跑

---
