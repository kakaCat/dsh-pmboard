# t-8f5cce design 提交门聚合清单节校验·研发

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
design 提交门聚合清单节校验·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/plan-granularity.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T05:36:25.398Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

t4 研发段完成：清单节门聚合进 checkDesignContentGate，24/24 绿，邻近回归绿，tsc 持平。

### 完成项

- 新增 designSectionMissing 辅助函数（H2 节 + 表头判据 + 双豁免出口：design_exempt / 不适用行）
- checkDesignContentGate 聚合 +清单节维：feature→interfaces.md「接口清单」；sides 含 frontend→frontend.md「组件树」；docQualityRulesApply 门控
- TC-1 六例（缺节拒/无表拒/有表放/不适用放/design_exempt 放/frontend 组件树拒）+ TC-2 三例（存量/无 createdAt/非 feature）全绿
- 邻近回归 doc-quality-gate + design-completeness-gate 30/30 绿；tsc 基线持平

### 改动文件

- `src/application/internal/content-gate-wiring.ts`
- `tests/plan-granularity.test.ts`

### 下一步

复核段：对照 design/backend.md §FR-1 判定流程核对

---
