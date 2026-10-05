# t-ceb311 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·复核

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T05:18:29.902Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

t3 复核：抓到并修复一条自作违规（尺寸门禁），其余无偏离；两个文件从超标拆回合规。

### 完成项

- 发现并修复自作违规：尺寸门禁 ≤400 行被打破（node-panel.ts 442、conversation-progress.ts 450；改前 359/386）
- 拆法（按职责）：新鲜度 DOM → panel-freshness.ts（97 行）；数据通道 → use-panel-refresh.ts（140 行 hook）；两文件降至 377/369 行
- 复验：size-budget 超标名单本次文件命中 0；拆分后全量回归 106 failed/2787 passed 与拆分前逐字相同
- 其余无偏离：组件内取数入口仅 1 处、切换清空在建调度器之前、SSE 断线仍有周期兜底、reqUpdatedAt 出现 0 次

### 改动文件

- `src/client/panel-freshness.ts`
- `src/client/use-panel-refresh.ts`
- `src/client/node-panel.ts`
- `src/client/conversation-progress.ts`
- `tests/panel-refresh-wiring.test.ts`

---
