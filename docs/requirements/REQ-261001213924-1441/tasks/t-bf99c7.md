# t-bf99c7 回合计数改「本阶段」：阶段推进就归零·复核

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
回合计数改「本阶段」：阶段推进就归零·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T00:55:38.707Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

复核段：改动只在状态迁移的一处副作用，未触碰上限判定本身。

### 完成项

- 未改 roundLimitFor / terminalBlock（那属 t3）
- tsc 过滤 token-usage 无输出

### 改动文件

- `src/application/internal/token-usage.ts`
- `tests/dive-round-driver.test.ts`

---
