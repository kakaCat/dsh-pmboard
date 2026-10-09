# t-2f2bdf 扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check·测试

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T13:24:02.902Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

测试子卡完成：失败数 68 ≤ 开工前基线 69，typecheck 与 prompts:check 均 exit 0

### 完成项

- pnpm test：Tests 68 failed | 6947 passed | 22 skipped（7037）——开工前基线 69 failed | 6946 passed（7037），失败数 68 ≤ 69 ✔（差额为既有抖动用例 canceled-legacy-read，前几轮 A/B 已见其忽红忽绿；失败集合与新改动无交集）
- pnpm typecheck → exit 0 ✔（无类型错误）
- pnpm prompts:check → exit 0 ✔（三段含探针）
- 新增测试 4 条（tests/prompt-path-probe-tools-surface.test.ts）计入 6947 passed

### 下一步

父卡 t-540531 收尾并汇报

---
