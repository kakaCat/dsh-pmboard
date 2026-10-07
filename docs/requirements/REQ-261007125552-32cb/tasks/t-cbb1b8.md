# t-cbb1b8 新增粒度判定纯函数与阈值常量

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新增粒度判定纯函数与阈值常量

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/plan-granularity.test.ts -t "词法"` 全绿：重复声明去重计 1、小写动词不计、裸动词不计（TC-7）；`npx tsc --noEmit` 错误数 ≤ 开工前基线

## 实施方案（implementation）
新建 src/domain/task/Granularity.ts：① countInterfaceDeclarations(implementation: string): string[]——按 design/interfaces.md §接口声明词法提取（HTTP 大写动词+空格+/路径；tool:/工具：前缀；去重计数；小写动词、散文「接口」字样、裸动词不认）；② granularityWarningsOf(card)：footprint.files > LIMITS.footprintFilesSoftMax 与 side=frontend 且 prototypeRefs.length>1 两条警告文案。修改 src/domain/limits.ts：LIMITS +maxInterfacesPerCard: 1、+footprintFilesSoftMax: 5（注释标注待标定假设值，与 roundDetailUnits 同口径）。验证：对应单测全绿。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T05:28:27.781Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

t1 完成：粒度判定纯函数与阈值常量落地，子卡链（研发/复核/测试）全绿，验收命令达标。

### 完成项

- Granularity.ts：countInterfaceDeclarations + granularityWarningsOf（词法契约与 design/interfaces.md 一致）
- limits.ts：maxInterfacesPerCard=1、footprintFilesSoftMax=5（待标定注释）
- tests/plan-granularity.test.ts 建立：15 例全绿（词法 7 + 软门 4 + 透传 4）
- tsc 基线持平（1=1）；全量测试基线差集核对为非本次引入

### 改动文件

- `src/domain/task/Granularity.ts`
- `src/domain/limits.ts`
- `tests/plan-granularity.test.ts`

### 下一步

t2 子卡链收尾（透传实现已完成）；t3 wiring 挂载

---
