# t-8c2a5e 新增粒度判定纯函数与阈值常量·研发

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
新增粒度判定纯函数与阈值常量·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/plan-granularity.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T05:21:35.618Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

t1 研发段完成：粒度判定纯函数与阈值常量落地，词法/软门单测 11 绿，tsc 错误数 1 = 基线 1

### 完成项

- 新建 Granularity.ts：countInterfaceDeclarations（HTTP 大写动词+路径 / tool: 前缀 / 去重）+ granularityWarningsOf（files 超阈值 / UI 卡多锚点）
- limits.ts +maxInterfacesPerCard=1、+footprintFilesSoftMax=5（待标定注释）
- 新建 tests/plan-granularity.test.ts：词法 7 例 + 软门 4 例，11 绿

### 改动文件

- `src/domain/task/Granularity.ts`
- `src/domain/limits.ts`
- `tests/plan-granularity.test.ts`

### 下一步

复核段：对照 design/interfaces.md §接口声明词法核对实现一致性

---
