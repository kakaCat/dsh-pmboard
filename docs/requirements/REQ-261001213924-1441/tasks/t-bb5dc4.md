# t-bb5dc4 回合收尾只认一个解析器·测试

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
回合收尾只认一个解析器·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T01:27:56.032Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

测试段：三种形态结论一致。

### 完成项

- npx vitest run tests/dive-round-driver.test.ts → 23 passed（新增 3 条）

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/application/internal/interruption.ts`
- `tests/dive-round-driver.test.ts`

---
