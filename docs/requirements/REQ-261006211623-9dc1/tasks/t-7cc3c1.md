# t-7cc3c1 红标色值按无障碍定稿并重建客户端

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
红标色值按无障碍定稿并重建客户端

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
grep -n "991b1b" src/client/styles/node-panel.ts src/client/styles/subtask.ts src/client/styles/report.ts → 命中 3 处；pnpm build:client → [verify-client] OK（关键符号齐全 / 样式归属章在场 / CSS 分片完整）；npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts → 全绿（含 in_progress 未声明仍标红、done 未声明不标）；与 prototypes/dag-chain-missing.html#FR-6 的判据说明逐条对照，差异写进任务汇报

## 实施方案（implementation）
按 design/frontend.md §六 的定稿色值改三处样式规则：src/client/styles/node-panel.ts 的 .dsh-pm-np-chain-missing、src/client/styles/subtask.ts 的 .dsh-pm-chain-missing、src/client/styles/report.ts 作用域内的汇总条一格；由琥珀 #a86a00 on rgba(240,160,32,.16)（≈3.9:1 不达标）改为 #991b1b on rgba(220,38,38,.10)（≈6:1）。改完重建客户端产物并跑三条客户端测试，最后与权威原型 prototypes/dag-chain-missing.html#FR-6 逐条对照（红标 = 圆点 + 「链未生成」文字，不只靠颜色）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T14:16:25.436Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

t4 收尾：红标色值无障碍定稿并重建客户端，原型对照与证据已入库

### 完成项

- 本卡是唯一改代码的卡：三处色值按原型定稿为 #991b1b on rgba(220,38,38,.10) 并加描边，角标补 aria-hidden 圆点
- 客户端已重建：pnpm build:client → [verify-client] OK（bundle 729071 bytes）
- 客户端四文件 107 passed；与权威原型六项对照一致；对比度独立复算 7.12:1（改前琥珀 3.94:1 不达标）
- 证据文件：docs/requirements/REQ-261006211623-9dc1/tests/t4-chain-missing-color-evidence.md（含原型逐条对照、对比度复算、归属说明、全量读数 §6）
- 全量严格口径未满足项（69 vs 68、tsc 1 vs 0）已归属并发窗口在制改动

### 改动文件

- `src/client/styles/node-panel.ts`
- `src/client/styles/subtask.ts`
- `src/client/styles/report.ts`
- `src/client/node-panel.ts`
- `docs/requirements/REQ-261006211623-9dc1/tests/t4-chain-missing-color-evidence.md`

### 下一步

链尾卡 t5：三条总门 + 基线集合差归因 + dist 与宿主同代核对 + 复核材料对齐

---
