# t-c1ce4f 挂载接缝按记忆回填并同步工具条与滚动·复核

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
挂载接缝按记忆回填并同步工具条与滚动·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T13:43:18.458Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

t2 复核完毕：回填顺序（先写回后读取）、工具条对齐、滚动恢复与兼容缺省均与 interfaces.md §1 契约一致，41 条用例复跑全绿，无偏离。

### 完成项

- 对照 design/interfaces.md §1 行为契约逐条核对：opts 缺省=现状行为（用 DEFAULT_DAG_STATE、不读写记忆表）/ 记忆为空→缺省 initial / 记忆有值→逐字段回填 + 工具条 is-on 对齐 + paint 后恢复滚动 / 同名二次挂载先 dispose 再挂 / 不抛异常 —— 实现与契约一致，无偏离
- 核对顺序硬要求：disposeDagCanvas(370) 先于 readDagViewState(373)，即「先写回旧实例状态、再按记忆起画」，A1-2 用例正是这条的回归锚点
- 核对回填后的交互不回退：工具条点击处理仍按按钮自身 toggle is-on（与 syncToolbar 同口径），ResizeObserver 触发 paint 不会重置方向/开关（它们住在 viewer.state() 里）
- 复跑 npx vitest run tests/dag-view-state.test.ts tests/dag-view.test.ts → 41 passed；tsc 对改动文件零新增错误
- 复核结论：无偏离。已记录一处已知次优（设计文件风险表内已申报）：若浏览器在元素脱离文档后把 scrollTop 归零，则「innerHTML 重建」路径的滚动恢复退化为 0——FR-3 消掉该路径后不再触发，另由 A4 手测兜底

---
