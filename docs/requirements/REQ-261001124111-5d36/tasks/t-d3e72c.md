# t-d3e72c 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·研发

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx vitest run tests/panel-refresh-wiring.test.ts` → `Tests  12 passed`；再跑 `grep -n "usePanelRefresh" src/client/conversation-progress.ts` → 有命中（组件确实接了数据通道）。

## 汇报 1（2026-10-01T05:01:53.877Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

这一步做完，什么变了：面板的刷新不再押在单一通道上——打开就拉一次、之后每 5 秒自己兜底重取，SSE 事件只用来抢先一步；换需求时先把旧卡片清空再拉新的；宿主可以通过配置把轮询关掉（一键回退）。「插件已更新」的提示也在这里接到界面上。

### 完成项

- src/client/conversation-progress.ts：展开时建 createPanelRefresh（intervalMs/staleAfterMs 取宿主策略）并 start()，关闭时 stop()；reqIdForStage 变化时先 setStageOverview(null) 再重开（不串档）
- 原「按 req.updatedAt 重拉」Effect 删除（任务级变化不改 updatedAt）；SSE 降级为加速通道——事件只调 panelRef.current?.refresh('event')
- 新增 build 命名帧消费：setPolicy(parsePanelPolicy(frame.panel)) + stampMismatch 判定后 setBuildNotice（每个连接只提示一次）
- 新增 document 级委托 data-action="np-reload" → location.reload()（不自动刷新）
- 新鲜度按 NodePanelFreshness 契约显式挑字段传给 renderNodePanel，并传 buildNotice
- src/client/api.ts：subscribeEvents 增可选 onBuild，用 addEventListener('build') 收命名帧
- src/plugin-config.ts：新增 panel?: { refreshMs?; staleAfterMs? } 与 panelSettings()（缺省 5000/30000，refreshMs=0 = 关轮询）
- tests/panel-refresh-wiring.test.ts 12 例全绿（策略解析/戳判定/接线不变量）
- pnpm build:client 通过（verify OK）；pnpm build 通过（宿主 dist 重建）；改动文件 tsc 报错 0

### 改动文件

- `src/client/conversation-progress.ts`
- `src/client/api.ts`
- `src/client/panel-refresh.ts`
- `src/plugin-config.ts`
- `tests/panel-refresh-wiring.test.ts`

### 下一步

联调（t-37bcbb）：核对「组件策略 ← build 帧 ← 宿主配置」这条链两端字段一致；复核（t-ceb311）：确认删除旧 Effect 后没有留下"没有兜底"的路径（SSE 断线时纯轮询仍成立，由调度器保证）。

---
