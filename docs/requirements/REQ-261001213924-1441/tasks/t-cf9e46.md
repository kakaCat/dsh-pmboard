# t-cf9e46 加心跳兜底与唤醒链诊断·复核

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
加心跳兜底与唤醒链诊断·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T01:03:23.627Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

复核段：确认心跳不会变成"每 60 秒推一把"的噪音源，也不会越权改人的意图。

### 完成项

- 只在停滞（>10 分钟无成功唤醒）时才唤醒，正常在跑的需求一律跳过
- 只写 driverHealth / lastWakeAt / comment，不碰 activation
- 失败与暂停理由都进台账，人可读

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-rearm.test.ts`

---
