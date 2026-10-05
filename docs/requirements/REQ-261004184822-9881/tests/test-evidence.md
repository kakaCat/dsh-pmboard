# 测试证据（REQ-261004184822-9881 · 2026-10-04）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0；类型检查 tsc（`pnpm typecheck`）
- **无 commit 可指**：本工作区在本需求开始前就带有大量未提交的在途改动，故一律采用
  「改动前后基线对比」——这是本仓唯一可复现的「零新增失败」口径（与 C-14 一致）。
- 前端产物：`pnpm build` 后构建戳 `sha256(lib/client.cjs)` 前 12 位 = `17e9dba1f362`；
  人工验收前该版本已由人 `Cmd+R` 刷新进浏览器。

## 跑了什么

```
npx vitest run tests/board-lane-scroll.test.ts          # 本需求定向
npx vitest run tests/board-attach.test.ts tests/board-entry.test.ts tests/board-focus.test.ts tests/dag-view-state.test.ts tests/client-styles-ownership.test.ts
pnpm test                                               # 全量回归
pnpm build && pnpm build:client                          # host + client（含 [verify-client] 校验）
pnpm typecheck                                          # 类型
```

## 结果摘要

| 命令 | 改动前基线 | 改动后 | 判定 |
|---|---|---|---|
| 定向 `tests/board-lane-scroll.test.ts` | 文件不存在 | `Test Files 1 passed (1)`；`Tests 15 passed (15)` | ✅ 全绿 |
| 看板与 DAG 相关回归（4 套） | — | `Tests 42 passed (42)` | ✅ 全绿 |
| 样式归属 `tests/client-styles-ownership.test.ts` | — | `Tests 6 passed (6)` | ✅ 全绿 |
| 全量 `pnpm test` | `98 failed \| 4405 passed \| 20 skipped` | `98 failed \| 4416 passed \| 20 skipped` | ✅ 失败数持平、**零新增**；通过数 +11（本次 11 条新用例全绿） |
| `pnpm typecheck` | 153 条（含其它窗口存量改动） | 153 条 | ✅ 持平；`grep` 确认无一行来自本次改动的 4 个文件 |
| `pnpm build` / `pnpm build:client` | — | exit 0；`[verify-client] OK`（bundle 410557 bytes，关键符号齐全、样式归属章在场、CSS 分片完整） | ✅ |

> 文档里写的旧基线（106 failed / 2807 passed、类型 223）比当前工作区更旧；本需求采用
> **开工前实测 98 / 153** 作为直接基线，两者都低于文档基线，判定不变。

## 覆盖与对照

| 需求条款 | 用例 | 结果 |
|---|---|---|
| FR-1 横向位置跨重绘保持 | TC-1×3（往返 / 超上限收敛 / NaN→0）、TC-5×1（轮询重绘后仍在原列） | ✅ |
| FR-1 列内纵向位置保持 | TC-2×2（按 data-lane 隔离 / 键上限） | ✅ |
| FR-2 非泳道视图不覆盖记忆 | TC-3×2（列表与详情不写零 / 无记忆不抛错） | ✅ |
| FR-2 与 DAG 记忆隔离 + 不落盘 | TC-4×2（两套记忆互不影响 / 源码不出现浏览器存储） | ✅ |
| FR-3 视图互切与详情往返 | TC-5×1（切列表再切回泳道仍为 260） | ✅ |
| FR-4 列高铺满可视区 | TC-6×4（行 stretch / 列无写死上限 / 列内仍可滚 / 全表无 100vh 减常数）；人工确认「已直通到底」 | ✅ |
| 整体验收第 3 条（SSE 那一刷） | 与手动/轮询同一 `render()` 路径，TC-5 用真 `attachBoard` 断言；**未单独人工触发** | ⚠️ 部分 |
| 整体验收第 5 条（列头固定） | 结构上由 `.dsh-pm-lane-head { flex: none }` + 列内滚动保证；**未被眼睛确认** | ⚠️ 部分 |
| 整体验收第 8 条（刷新页面回最左） | TC-4 源码断言（不落盘）；**未人工复核** | ⚠️ 部分 |
| FR-4 边界（矮窗口） | 规则上有 `min-height: 0` 链保证；**未人工复核** | ⚠️ 部分 |

## 人工验收（TC-7）

- 记录：`evidence/lane-scroll-gui.md`（替代原计划的 PNG 截图，原因写在文件头）
- 逐条：① 列已直通到底、下方不再留白 ✅；② 横滚到右列后刷新未被弹回 ✅；③ 长列内翻后仍停在原处 ✅

## 失败与未跑项（如实列出）

1. **未跑**：真实浏览器里的自动化 E2E（本仓无 jsdom / 无 Playwright；GUI 层只做人工确认）。
2. **未人工覆盖**：矮窗口列高、列头可见性、SSE 单次触发、刷新回最左（见上表 ⚠️ 行）。
3. **既有失败**：全量 98 failed 是工作区存量问题（如 `tests/worktree-injection.test.ts` 类型错、
   `tests/application/repository.test.ts` 的 id 格式断言等），与本需求无关；本次未新增失败。

## 任务覆盖（covers 标注）

> 本需求的父卡与其子链都要能指到测试或人工验收，逐条登记如下。

- covers: t-19e1e2 —— 位置记忆模块父卡：TC-1 / TC-2 / TC-3 / TC-4（`tests/board-lane-scroll.test.ts`）
- covers: t-dc4752 —— 重绘接线父卡：TC-5 两条（同文件）
- covers: t-fd11e7 —— 列高铺满父卡：TC-6 四条（同文件）+ GUI 人工确认「已直通到底」
- covers: t-fb2cff —— 收口父卡：`evidence/gates.txt` 四门禁读数 + `evidence/lane-scroll-gui.md` 人工验收
- covers: t-128aa9 —— 模块研发：TC-1 / TC-2 / TC-4
- covers: t-f8b5ae —— 模块联调：`pnpm build:client` 校验 + 看板回归 4 套
- covers: t-7036ab —— 模块复核：`reviews/self-review.md` 维度清单（一致性 / 编号可追溯）
- covers: t-957862 —— 模块测试：全量失败数与基线比对（98 = 98）
- covers: t-e16560 —— 接线研发：TC-5 两条
- covers: t-b5a80f —— 接线联调：产物含新模块（bundle 独有选择器可查）+ 看板回归
- covers: t-50008b —— 接线复核：调用顺序与空态早返回核对（`board-mount.ts` 渲染段）
- covers: t-eba69f —— 接线测试：15 passed + 类型 153 ≤ 基线
- covers: t-168366 —— 样式研发：TC-6 四条
- covers: t-65afb7 —— 样式联调：`tests/client-styles-ownership.test.ts` 6 passed + `[verify-client] OK`
- covers: t-c95411 —— 样式复核：三条样式与设计逐条核对、未新增选择器
- covers: t-8fbc23 —— 样式测试：卡内锚点（grep 100vh 写法 = 0）全过
- covers: t-d34ccf —— 收口研发：`evidence/gates.txt` + `evidence/lane-scroll-gui.md` 落盘
- covers: t-16251a —— 收口复核：需求整体验收 8 条逐条对证据，4 项未覆盖已披露
- covers: t-69a514 —— 收口测试：15 条用例逐条读数 + 四门禁汇总
