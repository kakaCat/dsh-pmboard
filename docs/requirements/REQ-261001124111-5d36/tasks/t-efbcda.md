# t-efbcda 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·测试

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx vitest run tests/panel-refresh-wiring.test.ts` → `Tests  12 passed`；再跑 `pnpm build:client 2>&1 | tail -1` → 含 `[verify-client] OK`。

## 汇报 1（2026-10-01T05:18:29.975Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

t3 测试阶段（拆分后复跑）：接线用例、构建、尺寸门禁、类型检查四项全过。

### 完成项

- 接线用例 12 passed（含 refreshMs=0 语义、切换清空顺序、np-reload 委托）
- pnpm build:client verify OK（bundle=330378，关键符号齐全）
- 尺寸门禁本次文件命中 0；本次改动文件类型错误 0

---
