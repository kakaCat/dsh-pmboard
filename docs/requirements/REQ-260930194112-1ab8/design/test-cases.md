# REQ-260930194112-1ab8 测试策略 · 可复跑的布局回归门 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 两条腿：**vitest 静态断言**（Node 环境，不依赖浏览器）+ **headless Chrome 探针**（真实布局量化）。探针是本需求的主要证据来源——布局缺陷只能靠真实渲染判定。

## T-1 · 探针：scripts/list-responsive-probe.mts serves: FR-1, FR-2, FR-3, FR-4, FR-5

| 项 | 设计 |
|----|------|
| 输入 | 仓库当前源码（`buildListView` + `styles/*` 拼接 CSS），内建 4 条同形 fixture（含长 ID、长标题、中英文混排） |
| 渲染 | 生成标本页 → headless Chrome `--dump-dom` → 读回页内注入的 `#diag` 文本 |
| 档位 | 640 / 760 / 840 / 1080 / 1680（覆盖 <720 滚动档、<880 让位档、<1180 让位档、宽档） |
| 浏览器 | `CHROME_BIN` 环境变量优先，其次 macOS 默认 Chrome 路径；**找不到即退出码 2 并打印原因**（不静默跳过） |
| 输出 | 每档一行 `DIAG width=… cols=… titleW=… overflowX=… problems=…`，末行 `PROBE PASS` / `PROBE FAIL` |

断言矩阵（`problems` 必须为 `NONE`）：

| 断言 | 量法 | 服务 |
|------|------|------|
| A1 关键列单行 | `.dsh-pm-card-id` / `.dsh-pm-status-badge` / 可见的 `.dsh-pm-cat` 的 `getClientRects().length === 1` | FR-1 |
| A2 操作列未被压缩 | 操作列 `clientWidth + 0.5 ≥ scrollWidth` | FR-3 |
| A3 按钮不重叠 | 同行按钮包围盒两两不相交 | FR-3 |
| A4 档位列数 | `cols`：1680→8、1080→5、840→4、640→4 | FR-4 |
| A5 滚动兜底 | `overflowX`：640→true，其余→false | FR-5 |
| A6 宽档不缩水 | 1680 档 `cols === 8` 且 `titleW ≥ 500`（标题列保持现状的宽松宽度） | FR-6 |

## T-2 · 实测基线（修复前 → 修复后，同一 fixture） serves: FR-1, FR-4, FR-5, FR-6

| 视口 | 修复前 cols / titleW / problems | 修复后 cols / titleW / overflowX / problems |
|------|--------------------------------|--------------------------------------------|
| 640px | 8 / 94 / ID 3 行 + 状态 2 行 + 分类 2 行 + 按钮重叠 + 操作列压缩 | 4 / 282 / true / **NONE** |
| 840px | 8 / 101 / 同上（= 用户截图症状） | 4 / 362 / false / **NONE** |
| 1080px | 8 / 267 / ID 2 行 + 状态 2 行 + 分类 2 行 + 按钮重叠 | 5 / 430 / false / **NONE** |
| 1200px | 8 / 350 / ID 2 行 + 状态 2 行 + 按钮重叠 | 8 / 322 / false / **NONE** |
| 1680px | 8 / 540 / NONE（现状正常） | 8 / 540 / false / **NONE**（与现状一致） |

> 1200px 档说明：现状在该宽度已经开始换行，修复后靠 nowrap 单行——属于修复增益，不属于「宽屏零变化」范围；FR-6 的零变化以 1680px 档为准。

「修复前」对照不冻进仓库（避免把已删除的坏 CSS 留成死代码）；证据以 `evidence/before-*.png` 与 `evidence/after-*.png` 留存。

## T-3 · vitest 静态断言：tests/list-responsive.test.ts serves: FR-3, FR-4, FR-5

| 用例 | 断言 | 服务 |
|------|------|------|
| TC-1 wrap 容器 | `buildListView` 输出包含 `<div class="dsh-pm-table-wrap">` 且 `<table` 位于其内 | FR-5 |
| TC-2 列类名成对 | `thead` 中 4 个列类名各出现 1 次；每条 `tr.dsh-pm-list-row` 中同样各 1 次；分组头行不含列类名 | FR-4 |
| TC-3 colspan 不变 | 分组头仍为 `colspan="8"` | FR-4 |
| TC-4 CSS 规则齐备 | `BOARD_CSS` 含 `overflow-x: auto`、`min-width: 720px`、`white-space: nowrap`、`min-width: max-content`、`max-width: 1180px`、`max-width: 880px` 与 4 个列类名 | FR-1/3/4/5 |
| TC-5 空列表分支 | 空结果输出**不含** `<table` 与 wrap | FR-5 |

## T-4 · 命令与期望输出 serves: FR-7

```bash
# ① 静态断言（Node 环境，秒级）
./node_modules/.bin/vitest run tests/list-responsive.test.ts
# 期望：5 passed

# ② 布局探针（headless Chrome，真实渲染）
./node_modules/.bin/tsx scripts/list-responsive-probe.mts
# 期望：5 行 DIAG（problems=NONE）+ 末行 PROBE PASS，退出码 0
# 找不到 Chrome：退出码 2 + 明确提示（不静默通过）
```

## T-5 · 明确不测的项 serves: FR-6

- 像素级视觉比对（字体渲染/间距随平台差异，不做快照）
- 泳道视图、详情页、DAG 画布（不在本需求边界内）
- 真机 Safari/Firefox（降级路径已在 data-model.md D-3 说明）
