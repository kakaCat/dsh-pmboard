# t-8e45ea 会话面板与需求详情接线（key 作用域 + 清理）·研发

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
会话面板与需求详情接线（key 作用域 + 清理）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-01T13:49:51.822Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

研发完成：把前两张卡装好的机器真正接上——会话节点面板与需求详情页现在都会把「用户在图上的选择」按需求记住并在重建后回填，页签点击与切换需求也各有了明确的写入与清理入口。

### 完成项

- src/client/conversation-progress.ts：新增记忆键 panelStateKey = PANEL_DAG_CANVAS_ID + '::' + reqIdForStage（早退前声明，hooks 位置合法）；新鲜度投影 panelFreshness 提到早退前（渲染层与补丁共用一份，删除下方重复块）；新增切换需求清理 effect（clearDagViewState 上一需求的键）；新增补丁 effect（wrapRef.current 为根，hydrateNodePanel 传 freshness + 记忆里的 tab，deps 含 freshness 以每轮刷新数据时间）；DAG 挂载改传 { stateKey }；页签点击委托在切换 class 后 writeDagViewState({ tab })
- src/client/board-mount.ts：需求详情挂载改为 tryMountDagCanvas(reqTasks, reqReady, 'dag-canvas', { stateKey: 'dag-canvas::' + req.id })
- 静态复核（本卡验收明确要求的 grep）：stateKey 两处命中（conversation-progress.ts:297 用 PANEL_DAG_CANVAS_ID + '::' + reqId；board-mount.ts:265 用 'dag-canvas::' + req.id）；conversation-progress.ts 内 hydrateNodePanel:203 / writeDagViewState:228 / clearDagViewState:190 / readDagViewState:202 各一处
- 自测：npx vitest run tests/panel-refresh-wiring.test.ts tests/client-view.test.ts tests/node-panel.test.ts tests/card-layer.test.ts tests/stage-colors.test.ts tests/panel-hydrate.test.ts tests/dag-view-state.test.ts → 137 passed；另跑 header-progress-responsive / compat-regression / panel-refresh / panel-freshness-render → 43 passed
- npx tsc --noEmit -p tsconfig.json：本次四个改动文件零新增错误

### 改动文件

- `src/client/conversation-progress.ts`
- `src/client/board-mount.ts`

---
