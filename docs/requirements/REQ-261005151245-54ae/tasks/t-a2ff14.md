# t-a2ff14 用例接线（openWindow 与 handoffOwner 新建窗口）·测试

> 需求：REQ-261005151245-54ae 开窗补齐继承：新窗口写入标题并继承源窗口模式与 LLM 模型

## 在做什么
用例接线（openWindow 与 handoffOwner 新建窗口）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T07:40:38.715Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这两条路的测试跑通了：开窗与交接的继承与回执都有人盯着。

### 完成项

- vitest run tests/open-window-inherit.test.ts → 57 passed（含 T-01~T-14 与兼容组）
- vitest run tests/handoff-owner.test.ts → 25 passed（含新建窗口回执 / 指定窗口不含两条）
- 六个受影响套件合计 112 passed；tsc --noEmit 0 错误

---
