# t-5a2b9e 接线看板两个视图：泳道挂归档条、列表终态分组复活·测试

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
接线看板两个视图：泳道挂归档条、列表终态分组复活·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T03:01:18.610Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

测试结论：本卡修的两条判据（A1-2 泳道可见归档条、A4 列表终态分组）已在实例里跑绿，既有 55 条回归无新增失败；归档需求"点得进去"这条主链路现在有测试锁住。

### 完成项

- npx vitest run tests/client-view.test.ts tests/token-card.test.ts → 2 files passed / 55 tests passed（含修订后的泳道断言）
- npx vitest run tests/archived-entry.test.ts → 本卡判据 A1-1/A1-2/A1-3/A1-4/A2/A4/A6 共 11 例全绿
- 同文件仍有 4 例红（A3×2 属 t3、A5×2 属 t4）——本卡未宣称整文件全绿，这是计划里刻意的分卡归属，不是回归
- 证据留档：docs/requirements/REQ-261002105242-a3fb/evidence/pre-fix-red.txt（修前 11 failed / 3 passed 的逐例清单）

### 改动文件

- `tests/archived-entry.test.ts`
- `tests/client-view.test.ts`

### 下一步

t3（终态只读）与 t4（僵尸入口清理）接力，届时该文件应 14/14 全绿

---
