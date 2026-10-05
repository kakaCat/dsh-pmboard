# t-b0f77c 分叉判据纯函数（三档 + 读数缺席不猜）·复核

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
分叉判据纯函数（三档 + 读数缺席不猜）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T07:48:56.205Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

复核段：判据口径与设计逐条一致（比率定义、缺席不猜、projectedTokens 不参与判定），无偏离。

### 完成项

- 逐条核对 design/data-model.md §分叉判据的数据来源：比率 = 占用量 / 窗口大小，与实现一致
- 核对「缺席不猜」四种情形与 design/test-cases.md 一致
- projectedTokens 明确不参与判定（注释写明理由：非原子读数会让判据抖动）
- 层边界：判据模块零 node: / 零框架依赖

### 改动文件

- `src/application/internal/handoff-policy.ts`

### 下一步

测试段

---
