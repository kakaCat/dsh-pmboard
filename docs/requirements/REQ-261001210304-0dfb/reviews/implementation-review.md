# REQ-261001210304-0dfb 实施评审报告（自评审 · 提请人工复核）

> 评审人：本窗口 agent（自评审）。**结论仅供人工参考，验收由人裁决**。
> 评审方式：逐卡对账 + 对照 `design/` 五份文档核验 + 静态复核（grep）+ 复跑用例。
> 逐卡复核的完整记录在任务卡文档：`tasks/t-8e8fdc.md`、`t-9b6948.md`、`t-21de17.md`、`t-2406b6.md`、`t-5f7644.md`（各含研发/复核子卡记录）。

## 1. 计划 vs 实际：逐卡对账

| 卡 | 计划改动 | 实际 | 偏差 |
|----|----------|------|------|
| t1 记忆表（契约先行） | 新增 `dag/view-state.ts` + 单测 | 同左（12 用例） | 无 |
| t2 挂载接缝回填 | `views/dag-view.ts` 增 `opts.stateKey`、工具条同步、滚动恢复、dispose 写回；`dag-mount.ts` 透传 | 同左 + 把写死的 initial 提为导出常量 `DEFAULT_DAG_STATE` | 无（常量提取是"缺省=现状行为"的实现手段） |
| t3 面板稳定化 | `panel-freshness.ts` / `node-panel.ts` / 新增 `panel-hydrate.ts`；迁移既有断言 | 同左；**未给 `renderNodePanel` 加可选 `now`**（见 §2 偏离 1） | 一处轻微偏离，已记录理由 |
| t4 接线 | 会话面板 + 需求详情两处传 `stateKey`；页签写记忆；切需求清理 | 同左；**复核期把补丁 effect 依赖补上 `buildNotice`/`data`**（见 §2 偏离 2） | 一处增强，已记录理由 |
| t5 探针与验证 | 探针翻转 + 六套用例 + tsc + 构建 + 运行日志 | 同左；探针额外加了 `wrap` 桩，把"滚动还原"也纳入断言 | **增**（让 A4 的自动化部分更接近真实） |

## 2. 两处偏离/取舍（必须让人看见）

1. **`renderNodePanel` 未新增可选 `now`**（`design/interfaces.md §3` 提到过）：
   相对时间已随 `relSlot()` 移出渲染，渲染层不再读时钟，加一个死参数只会扩大 API 面；
   可注入时钟的需求由补丁层满足（`hydrateRelTimes(root, now)` / `hydrateNodePanel(root, { now })`），
   由 A3-2 用例覆盖。**调用方契约零变化**。请人工确认这个简化可以接受。
2. **补丁 effect 的依赖数组在复核期补齐 `buildNotice` 与 `data`**：
   注入字符串还受这两者影响（版本提示条、需求标题）；若不进依赖，React 会重设 innerHTML 却不触发补丁，
   出现最长 ≤5 秒的「数据时间空白」窗口。补丁幂等，代价是每 15 秒多几次文本写入。

## 3. 需求条款覆盖自检

| 条款 | 落点 | 证据 |
|------|------|------|
| FR-1 记忆与回填 | `dag/view-state.ts` + `views/dag-view.ts`（回填/工具条/滚动/dispose 写回）+ 两处接线 | `tests/dag-view-state.test.ts` 12 passed（含 A1-2/A1-3）；探针 A 段保活 |
| FR-2 页签与滚动保活 | `views/dag-view.ts` 滚动恢复 + `panel-hydrate.ts` 页签恢复 + `conversation-progress.ts` 页签写记忆 | A3-3 用例；探针 A-3（top=180 left=12） |
| FR-3 HTML 刷新稳定性 | `panel-freshness.ts` + `node-panel.ts` + `panel-hydrate.ts` | A2-1/A2-2 用例；探针 B 段（两轮 `__html` 相同） |
| FR-4 作用域与清理 | 键 `canvasId::需求id`；切需求清理；需求详情独立键 | A5 两条用例；`grep` 命中 `clearDagViewState` / 两处 `stateKey` |
| FR-5 守卫与回归 | 新增 2 个测试文件 + 迁移 1 个（累计 24 条断言） | `tests/test-evidence.md` §1/§4/§5 |

## 4. 设计约束自检（「不做」四条是否守住）

| 约束（requirement.md 边界） | 是否守住 | 依据 |
|-----------------------------|----------|------|
| 不改 `src/client/dag/*` 渲染与布局算法 | ✅ | `git status` 中 `dag/` 下仅新增 `view-state.ts`；`dag-layout / card-renderer / edge-renderer / critical-path / interaction` 零改动 |
| 不改刷新策略与数据通道 | ✅ | `panel-refresh.ts` / `use-panel-refresh.ts` / SSE 订阅零改动；5 秒兜底与三块可见性口径原样 |
| 不做跨页面重载持久化 | ✅ | 记忆表纯内存；无 `localStorage` / 无台账写入（`grep` 可复核） |
| 不对计划外调用方做破坏性改动 | ✅ | `opts` 可选，`tests/dag-view.test.ts` 29 条既有用例全绿；`tryMountDagCanvas` 旧签名调用方式不变 |

## 5. 风险与遗留

| 项 | 状态 |
|----|------|
| React「`__html` 相同则不动 DOM」的行为假设 | 已由 A2 用例把"字符串稳定性"钉死；即使该假设在某个 React 版本上不成立，FR-1/FR-2 的恢复路径仍保证 A1/A3/A4 通过（降级为"每轮恢复一次"，不丢用户选择） |
| 恢复滚动时容器尺寸/夹取 | 恢复动作排在 `paint()`（同步设 canvas 宽高）之后；被夹取时 `ResizeObserver` 下一帧会重排。真实浏览器观感列为 A4 人工项 |
| 记忆表容量 | 上限 16 + FIFO 淘汰；切需求清上一键；`_resetDagViewState` 仅测试用 |
| E2E 未自动化 | 如实标注：A4 走人工 5 步（`evidence/run-log.md` §6），`requirement.md` 未设 E2E 测试策略表 |
| 仓库既有失败 | 全量 98 failed 为存量问题（与本需求无关），本次未新增 |

## 6. 自评审结论

五个功能点全部有落点且有用例/探针证据；两处偏离均为**减法或稳健性增强**，不改任何对外契约；
"不做"四条全部守住。**建议人工按 `verification.md` §1 的 A1–A7 逐条打勾**，并现场走一遍 A4（浏览器手测）。
