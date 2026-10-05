# t-5dd17a 会话面板与需求详情接线（key 作用域 + 清理）·复核

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
会话面板与需求详情接线（key 作用域 + 清理）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T13:50:20.942Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

t4 复核完毕：接线位置与依赖数组都正确，并在复核中当场补上了 buildNotice/data 两个依赖（消除最长 5 秒的「数据时间空白」窗口）；与设计契约一致，无其他偏离。

### 完成项

- Hooks 位置合法性：panelStateKey / useRef(prevReqIdRef) / 三个 effect 全部声明在 `if (data === null …) return null` 早退（第 299 行）之前——与既有 closePanel 的注释纪律一致，不会踩条件返回后调用 hook 的坑
- 补丁根节点范围：wrapRef.current 是外层 .dsh-pm-cprog（内含流程图与详情面板），hydrateNodePanel 按 [data-dsh-pm-fresh-slot] / [data-dsh-pm-rel] / .dsh-pm-np-tab / .dsh-pm-np-pane 四个钩子做子树查询，命中范围正确；面板未展开时不执行
- 依赖数组完整性（复核中发现并当场修正的一处）：补丁 effect 原 deps 为 [detailOpen, selectedStage, stageOverview, freshness, panelStateKey]，但注入字符串还受 buildNotice 与 data（需求标题等）影响——这两者变化时 React 会重设 innerHTML 而不触发补丁，会出现最长 ≤5 秒的「数据时间为空」窗口；已把 buildNotice 与 data 补进 deps（补丁幂等、代价是每 15 秒多几次文本写入）
- 幂等与副作用边界：hydrateFreshness / hydrateRelTimes / applyView 只改 textContent、属性、classList、hidden，不插删元素、不碰 canvas；与 tryMountDagCanvas 的 rAF 挂载互不干扰（补丁 effect 先跑，挂载只动 canvas 尺寸与绘制）
- 对照 design/interfaces.md §1/§3 与 use-cases UC-2/UC-4：两处 stateKey 形态、reqId 变化清理、页签写记忆与恢复入口全部落地，无偏离
- 复跑：panel-refresh-wiring / header-progress-responsive / compat-regression / client-view → 84 passed；先前七套 137 passed；tsc 零新增错误

---
