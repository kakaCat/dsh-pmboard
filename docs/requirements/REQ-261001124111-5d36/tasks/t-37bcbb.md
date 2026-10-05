# t-37bcbb 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·联调

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx vitest run tests/panel-build-frame.test.ts tests/panel-refresh-wiring.test.ts` → `Tests  15 passed`；再跑 `grep -n "panel: deps.panelPolicy" src/http/routers/stages.ts` → 有命中（宿主发帧带策略）。

## 汇报 1（2026-10-01T05:18:29.830Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

t3 联调：刷新策略从宿主配置到面板调度器的全链路核对一致。

### 完成项

- 链路逐段核对一致：宿主配置 panelSettings → routes 透传 → RouterCtx.panelPolicy → 帧内 panel → 客户端 parsePanelPolicy → 调度器 intervalMs/staleAfterMs
- 请求样例与期望响应：SSE 连接即收 event: build + data {"stamp":"…","panel":{"refreshMs":5000,"staleAfterMs":30000}}（由 panel-build-frame 用例实测）
- refreshMs=0 全链语义有用例覆盖（策略解析 + 接线断言）

---
