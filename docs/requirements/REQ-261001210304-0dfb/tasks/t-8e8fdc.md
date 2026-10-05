# t-8e8fdc 建立 DAG 视图状态记忆表（契约先行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
建立 DAG 视图状态记忆表（契约先行）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/dag-view-state.test.ts 全绿，其中 A1-1（合并写、拷贝隔离、非法滚动值按 0、容量 16 FIFO 淘汰、clearByPrefix）与 A5（np-dag-canvas::REQ-A 写 {dir:horizontal, focus:true} 后读 np-dag-canvas::REQ-B === undefined）两条用例通过；npx tsc --noEmit -p tsconfig.json 对本卡新增文件无新增错误。

## 实施方案（implementation）
① 新增 src/client/dag/view-state.ts（纯函数、零 DOM、零 IO，照 panel-refresh.ts 的纯度纪律）：export interface DagViewSnapshot { dir?: LayoutDir; crit?: boolean; focus?: boolean; pinned?: string | null; tab?: 'flow' | 'list'; scrollTop?: number; scrollLeft?: number }（dir 复用 src/client/dag/dag-layout.ts 的 LayoutDir，不新造枚举）；模块内 const store = new Map<string, DagViewSnapshot>() 与 MAX_ENTRIES = 16；readDagViewState(key) 返回浅拷贝（miss → undefined），命中时按键重插刷新插入序；writeDagViewState(key, patch) 合并写，scrollTop/scrollLeft 非有限数或负数一律写 0，pinned 为 null 时照写（显式无钉住）；clearDagViewState(key)；clearDagViewStateByPrefix(prefix)；dagViewStateSize()；_resetDagViewState() 仅测试用；超容量按插入序淘汰最旧。② 新增 tests/dag-view-state.test.ts，头部注释写 serves: FR-1, FR-4, FR-5（本仓测试文件惯例，前 20 行内）：A1-1 合并写/拷贝隔离（改返回值不影响表内）/非法滚动值按 0/容量 16 FIFO/前缀清理；A5 键隔离（np-dag-canvas::REQ-A 写横向 + 只看主线 → 读 np-dag-canvas::REQ-B 为 undefined）。验证：npx vitest run tests/dag-view-state.test.ts；npx tsc --noEmit -p tsconfig.json（本次文件零新增错误）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T13:41:21.626Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

这一步做完，DAG 的视图选择（方向/关键路径/只看主线/钉住/页签/滚动）第一次有了「按画布+需求」的内存归属：有了它，刷新导致的重建才有东西可以回填；键含需求 id 保证切换需求不会把上一个需求的视图带过来。

### 完成项

- 新增记忆表模块 src/client/dag/view-state.ts（DagViewSnapshot + read/write/clear/clearByPrefix/size/_reset，容量 16 FIFO，纯函数零 DOM）
- 新增单测 tests/dag-view-state.test.ts：A1-1（合并写/拷贝隔离/滚动值收敛/容量淘汰/前缀清）与 A5（键含需求 id，切需求不串档）
- 自测：npx vitest run tests/dag-view-state.test.ts → 9 passed；npx tsc --noEmit → 本卡文件零新增错误
- 子卡链收尾：研发 t-f14885、复核 t-dde296 均已完成并各有完工记录

### 改动文件

- `src/client/dag/view-state.ts`
- `tests/dag-view-state.test.ts`

---
