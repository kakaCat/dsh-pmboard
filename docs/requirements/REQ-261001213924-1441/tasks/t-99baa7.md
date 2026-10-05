# t-99baa7 加心跳兜底与唤醒链诊断·联调

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
加心跳兜底与唤醒链诊断·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T01:03:23.297Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

联调段：把「停着」的两种结局都跑了一遍。

### 完成项

- tick() 的 woken 含该需求且 lastWakeAt 落账
- 连续 3 次叫不动 → health=paused、reason=wake-undeliverable、attempts=3、activation 仍 armed、台账留下"连续 3 次唤醒都没叫动"的诊断
- 暂停后不反复推（skipped）；recoverHealth 一叫回来，心跳立刻能再叫醒它

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-rearm.test.ts`

---
