---
serves: [FR-1, FR-2, FR-3]
---

# 接口设计（REQ-261004184822-9881 泳道滚动位置记忆）

> 无对外 HTTP / 工具接口改动；本份登记的是前端模块的内部契约（FR-1~FR-3 的落点）。

## 模块接口 board-scroll.ts <!-- serves: FR-1, FR-2, FR-3 -->

```typescript
/** 读旧 DOM → 写记忆。只读 DOM，不改结构、不发请求、不抛错。 */
export function captureBoardScroll(root: ParentNode | undefined): void

/** 读记忆 → 写新 DOM。只在找得到泳道容器时回填；不改结构、不抛错。 */
export function restoreBoardScroll(root: ParentNode | undefined): void

/** 只读诊断（测试观测当前快照；返回浅拷贝，改它不影响内部） */
export function readBoardScroll(): LaneScrollSnapshot | undefined

/** 测试专用：清空快照（生产代码不得调用） */
export function _resetBoardScroll(): void
```

### 参数与调用契约 <!-- serves: FR-1, FR-2 -->

| 函数 | 参数 | 必填 | 说明 |
|---|---|---|---|
| `captureBoardScroll` | `root` | 是 | 承载看板的容器（`viewEl`）；`undefined` = 静默返回。**必须在 `innerHTML` 赋值之前调用** |
| `restoreBoardScroll` | `root` | 是 | 同一容器；**必须在新 DOM 写入之后、同一任务内调用** |

| 情形 | capture 行为 | restore 行为 |
|---|---|---|
| DOM 有 `.dsh-pm-lanes` | 记录横向位置 + 每列 `.dsh-pm-lane-cards` 位置 | 回填两者；某列不存在 → 跳过该列 |
| DOM 无 `.dsh-pm-lanes`（列表视图 / 需求详情 / 空态 / 出错页） | **静默返回，且不覆盖记忆** | 静默返回 |
| `root === undefined`（挂载期卸载） | 静默返回 | 静默返回 |

### 异常情况 <!-- serves: FR-1 -->

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| （无） | 任何取不到值 / 取不到容器的情形 | 不抛错、无错误返回；最坏情形 = 退回"位置归零"的今天——是功能降级，不是故障 |

**刻意不定义错误码**：这是浏览器内的尽力而为回填，失败不该打断渲染管线（`render()` 抛错会让整块看板白屏，代价远大于"位置没记住"）。

## 调用点契约（board-mount.ts） <!-- serves: FR-1, FR-3 -->

```typescript
const render = (): void => {
  if (viewEl === undefined) return
  if (state === undefined) { viewEl.innerHTML = buildEmpty(); return } // 空态：不进记忆
  captureBoardScroll(viewEl)          // ① 读旧 DOM
  switch (mode.kind) { /* 各分支写 innerHTML：buildBoard / buildReqDetail / buildTaskDetail / buildTasksPage */ }
  restoreBoardScroll(viewEl)          // ② 写新 DOM
}
```

- **顺序是硬契约**：capture 早于 `innerHTML` 赋值、restore 晚于它；夹在中间调用等于没记。
- **唯一调用点**：看板重绘集中在 `render()`；`fetchAll()` 的出错分支（`viewEl.innerHTML = buildError(...)`）不取也不回填——出错页没有泳道，记忆自然保留（FR-2）。

## 与既有接口的关系 <!-- serves: FR-2 -->

| 既有接口 | 变化 |
|---|---|
| `attachBoard(container, options)` / `BoardAttachment.refresh()` | 签名不变；`render()` 内部多两次调用，外部无感知 |
| `dag/view-state.ts` 的 `readDagViewState` / `writeDagViewState` | 不调用、不修改、不复用其表（FR-2 隔离） |
| 台账 / HTTP API | 零改动（本次不新增端点、不改返回体） |
