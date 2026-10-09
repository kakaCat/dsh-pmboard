# t-18eb2a 基线核对落账与类型检查收口·测试

> 需求：REQ-261008011831-3735 测试卫生收尾：活卡单点新红 + 基线落账

## 在做什么
基线核对落账与类型检查收口·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T18:17:00.609Z，窗口 session-646e8ead-d42e-4ed1-b531-993ff297ab7e）

测试段读数全部优于或等于开工前基线：失败 16 ≤ 68 且新增 0、tsc 0 ≤ 0，锚点与相邻回归命令全绿，证据已落盘。

### 完成项

- 复跑锚点命令：tests/live-tasks-single-source.test.ts → 17 passed；report-shell + report-firstscreen-gaps → 94 passed
- 复跑相邻回归：archive-* + kb-* → 29 文件 / 263 passed（授权外扩修复零回归）
- 复跑三份清单同源用例：baseline-triage + compat-req-261006201814 → 18 passed
- 基线口径：--check → 本次失败 16 条 ≤ 开工前基线 68 条，且新增失败 0；tsc --noEmit → 0 错误 ≤ 基线 0
- 证据汇总已落盘：docs/requirements/REQ-261008011831-3735/tests/evidence.md（8 行命令与读数）

### 改动文件

- `docs/requirements/REQ-261008011831-3735/tests/evidence.md`

### 下一步

父卡收尾并交验收材料

---
