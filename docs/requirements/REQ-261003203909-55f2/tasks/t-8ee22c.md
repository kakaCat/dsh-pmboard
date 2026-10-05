# t-8ee22c 颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/stage-colors.test.ts` → 全绿；`npx tsc --noEmit` 零新增错误；反向演练：摘除任一新段颜色项 → tsc 报错（输出贴卡汇报）

## 实施方案（implementation）
按 design/interfaces.md §5 登记表落颜色族；tests/stage-colors.test.ts 补四段断言

## 上游产出摘要（dependsSummary）
- 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:09:17.323Z，窗口 session-e48f706a-b51f-47a9-85c5-47b7e59bba48）

颜色登记收口：四段颜色族断言补齐，反向演练证明「摘登记项=编译错」真咬人（TS2741 输出在案），36/36 用例全绿

### 完成项

- 颜色登记代码随 t1 同落（Record 编译强制原子性，已在 t1 复核留痕）
- tests/card-types.integration.test.ts：覆盖数断言 16→20
- tests/integration/card-types.test.ts：+4 条新段映射断言（e2e/manual→test-family、capture→research-family、release→ops-family）
- 反向演练 R-2：摘除 manual 颜色项 → tsc 报 TS2741（Property 'manual' is missing），输出落 evidence/r2-reverse-drill.txt
- 三套件 36/36 全绿；tsc 我的文件零错误

### 改动文件

- `src/domain/card-types.ts`
- `tests/card-types.integration.test.ts`
- `tests/integration/card-types.test.ts`
- `docs/requirements/REQ-261003203909-55f2/evidence/r2-reverse-drill.txt`

### 下一步

t3 接口卡（submit schema + 计划校验 + plan-landing 解析落库）

---
