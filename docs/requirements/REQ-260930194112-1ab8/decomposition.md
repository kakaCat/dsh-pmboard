# REQ-260930194112-1ab8 拆分计划 · 列表视图自适应修复

> 目标：用「滚动兜底 + 关键列不换行 + 次要列按宽度让位 + 操作列不可压缩」四件套，让列表视图在 640~1680px 全档位不再出现逐字换行与按钮重叠。
> 做法：**markup 契约（t1）→ CSS 行为（t2）→ 真实渲染探针（t3）→ 兼容/证据核对（t4）**，四卡串行；改动面 2 个源文件 + 2 个新增文件。

## 改动盘点

| 文件 | 动作 | 内容 | 服务 |
|------|------|------|------|
| `src/client/views/board.ts` | 修改 | `buildListView` 表格外包 `.dsh-pm-table-wrap`；`renderListCard` 给 4 个单元格加列类名 | FR-4, FR-5 |
| `src/client/styles/board.ts` | 修改 | 6 组自适应规则 + 1180/880 两档断点 | FR-1, FR-2, FR-3, FR-4, FR-5 |
| `tests/list-responsive.test.ts` | 新增 | 静态断言：wrap 容器 / 列类名成对 / colspan 不变 / CSS 规则齐备 / 空分支 | FR-7 |
| `scripts/list-responsive-probe.mts` | 新增 | headless Chrome 5 档宽度真实布局断言 | FR-1, FR-3, FR-4, FR-5, FR-6, FR-7 |
| `docs/requirements/REQ-260930194112-1ab8/evidence/*.png` | 新增 | 修复前/后对照截图 | FR-6 |

**删除**：无（旧卡片式样式类按边界第 3 条保留）。

## 条款覆盖对照表

| 需求条款 | 接收任务 |
|----------|----------|
| FR-1 | t2, t3 |
| FR-2 | t2 |
| FR-3 | t2, t3 |
| FR-4 | t1, t2, t3 |
| FR-5 | t1, t2, t3 |
| FR-6 | t3, t4 |
| FR-7 | t1, t3 |

全部 7 条均有接收任务；本轮**无**「不做」条款。

## 任务 DAG

```
t1 markup 契约 ──► t2 CSS 自适应 ──► t3 布局探针 ──► t4 兼容与证据
   (implement)        (implement)        (test)          (doc)
```

## 任务表

| key | 标题 | phase | side | 依赖 |
|-----|------|-------|------|------|
| t1 | 列表行 markup 加滚动容器与列类名契约 | implement | frontend | — |
| t2 | 列表视图自适应样式与两档让位断点 | implement | frontend | t1 |
| t3 | 五档宽度布局回归探针（headless Chrome） | test | frontend | t2 |
| t4 | 兼容降级与回滚面核对 + 证据归档 | doc | doc | t3 |

### t1 · 列表行 markup 加滚动容器与列类名契约

- **实施**：`buildListView` 非空分支的 `<table>` 外层加 `<div class="dsh-pm-table-wrap">`（空结果分支不动）；`renderListCard` 的 `td` 与表头对应 `th` 成对加 `dsh-pm-col-cat`（第 3 列）、`dsh-pm-col-progress`（第 5 列）、`dsh-pm-col-owner`（第 6 列）、`dsh-pm-col-when`（第 7 列）；分组头 `colspan="8"` 保持不变、不加列类名。同步新增 `tests/list-responsive.test.ts` 的 TC-1/TC-2/TC-3/TC-5。
- **验收**：`./node_modules/.bin/vitest run tests/list-responsive.test.ts` 中 TC-1/2/3/5 通过；且对 4 条 fixture 调 `buildListView` 后，`thead` 与每条 `tr.dsh-pm-list-row` 内 4 个列类名各出现 1 次、分组头 0 次。

### t2 · 列表视图自适应样式与两档让位断点

- **实施**：`src/client/styles/board.ts` 列表区段追加——`.dsh-pm-table-wrap{overflow-x:auto}`、`.dsh-pm-table{min-width:720px}`、`.dsh-pm-table th,td{white-space:nowrap}`、`.dsh-pm-td-title{white-space:normal;min-width:220px}`、操作列 `flex-wrap:nowrap` + `.dsh-pm-card-actions{flex:none;min-width:max-content}`、按钮 `white-space:nowrap`；`@media (max-width:1180px)` 内解除标题列 380px 上限并隐藏分类/负责人/更新时间；`@media (max-width:880px)` 隐藏进度。补 TC-4。
- **验收**：`./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed；`BOARD_CSS` 文本含 `overflow-x: auto`、`min-width: 720px`、`white-space: nowrap`、`min-width: max-content`、`max-width: 1180px`、`max-width: 880px` 与 4 个列类名（缺一即红）。

### t3 · 五档宽度布局回归探针（headless Chrome）

- **实施**：新增 `scripts/list-responsive-probe.mts`：内建 4 条 fixture 渲染标本页（含真实 CSS 拼接），注入断言脚本（行盒数 / 按钮相交 / 操作列压缩 / 列数 / 横向溢出），按 640/760/840/1080/1680 调 headless Chrome（`CHROME_BIN` 优先，macOS 默认路径兜底，找不到 → 退出码 2 且打印原因），末行输出 `PROBE PASS`/`PROBE FAIL`。
- **验收**：`./node_modules/.bin/tsx scripts/list-responsive-probe.mts` 退出码 0；输出 5 行 `DIAG` 全部 `problems=NONE`，其中 640 行 `overflowX=true`、1680 行 `cols=8` 且 `titleW ≥ 500`；负向验证：把 `min-width: 720px` 临时改为 `2000px` 重跑，840 行必须出现 `overflowX=true` 或问题项且末行 `PROBE FAIL`。

### t4 · 兼容降级与回滚面核对 + 证据归档

- **实施**：核对 `design/data-model.md` D-3（`min-width:max-content` / `@media` / `overflow-x` 的降级路径均不劣于现状）与 D-4（无数据迁移、回滚=还原文件）；把最终 CSS 渲染的对照截图（before-840 / after-840 / after-1080 / after-1680）落到 `docs/requirements/REQ-260930194112-1ab8/evidence/`；确认改动面未溢出清单。
- **验收**：`git diff --stat` 仅含 `src/client/views/board.ts`、`src/client/styles/board.ts`（+ 新增 tests/scripts/evidence），无 `package.json`/依赖变更；evidence 四图存在且尺寸为 840x520 / 840x520 / 1080x520 / 1680x520。

## 里程碑

| 节点 | 判定 |
|------|------|
| M1 契约冻结 | t1 完成：markup 契约可被静态断言，列类名成对、colspan 不变 |
| M2 行为落地 | t2 完成：5 条静态断言全绿 |
| M3 真实渲染通过 | t3 完成：5 档宽度探针 PASS（含负向验证） |
| M4 可交付 | t4 完成：改动面收敛在 2 源文件 + 2 新增文件 + 证据四图 |
