# REQ-260930230225-71be 测试策略 · 六档视口布局门 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 两条腿：**headless Chrome 探针**（真实容器查询与真实布局，本需求主要证据）+ **vitest 单测**
> （挂载契约、档位常量、模型映射，Node 环境秒级）。布局缺陷只能靠真实渲染判定。

## T-1 · 探针：scripts/header-progress-probe.mts serves: FR-2, FR-3, FR-4, FR-5

| 项 | 设计 |
|----|------|
| 输入 | 仓库当前源码：`FLOW_TIERS` + `buildFlowChartModel()` + `BOARD_CSS` / `TOKEN_CSS` |
| 标本页 | 复刻 DSH 标题行几何：`.titleRow{container-type:inline-size}` + `.titleCluster{flex:1;min-width:0}` + `.headerActions{flex:none}` + `.headerUtilities{flex:none}`（照抄官方 CSS 语义，不引官方类名）；内放模式标签占位块 + 本插件图表（DOM 由模型按 I-2 的类名契约生成） |
| 渲染 | 生成标本页 → headless Chrome → 页内脚本量布 → 读回 `#diag` 文本 |
| 档位 | 六档视口：1280 / 1024 / 900 / 768 / 640 / 480（覆盖 A/B/C/D 四档与两个边界） |
| 浏览器 | `CHROME_BIN` 优先，其次 macOS 默认 Chrome 路径；找不到即退出码 2 并打印原因（不静默跳过） |
| 输出 | 每档一行 `DIAG width=… tier=… nodes=… links=… tokens=… rowOverflow=… chartScrollX=… panel=… problems=…`，末行 `PROBE PASS` / `PROBE FAIL` |

## T-2 · 断言矩阵（problems 必须为 NONE） serves: FR-2, FR-3, FR-4, FR-5

| 断言 | 量法 | 通过条件 | 服务 |
|------|------|----------|------|
| A1 标题行不溢出 | `.titleRow` 的 `scrollWidth - clientWidth` | 六档 ≤ 0.5 | FR-2 |
| A2 档位可见集 | 逐档统计 `display`：可见 token 数 / 连线数 / 节点名数 | 与 A-2 档位表逐档一致 | FR-3 |
| A3 当前节点恒可见 | `[data-state="current"]` 的 `getBoundingClientRect().width > 0` | 六档成立 | FR-3 |
| A4 面板不越界 | 触发点击后面板包围盒 | `left ≥ 0` 且 `right ≤ innerWidth - 0.5`；`height ≤ innerHeight - 100 + 0.5` | FR-4 |
| A5 宽档零回归 | 1280 档 | 节点 7、连线 6、计数文本形如 `d/t`、token 数 ≥ 0 全显示 | FR-5 |
| A6 单项不重复 | 圆点数 = 7、连线数 = 6 | 两种显示态下都成立 | FR-3 |

`chartScrollX > 0` 只记录不判失败（A-6 残余）。

## T-3 · vitest 单测：tests/header-progress-responsive.test.ts serves: FR-1, FR-3, FR-6

| 用例 | 断言 | 服务 |
|------|------|------|
| TC-1 挂载契约 | `src/client/index.ts` 文本含 `conversation.session.header.actions`、不含 `conversation.session.header.utilities`，且同段 `order: 0` | FR-1 |
| TC-2 档位常量入 CSS | `BOARD_CSS` 含 `max-width: 880px` / `620px` / `460px`，与 `FLOW_TIERS` 三个值一一相等 | FR-3 |
| TC-3 收缩与兜底规则 | `BOARD_CSS` 含 `.dsh-pm-cprog` 的 `min-width: 0`、`max-width: 64vw`、`overflow-x: auto` | FR-2 |
| TC-4 面板双模 | `BOARD_CSS` 含 `min(420px, calc(100vw - 32px))`、`position: fixed`、`top: 78px` | FR-4 |
| TC-5 模型映射 | `buildFlowChartModel` 对 7 种 status 的 state 序列、skip、token、countText 逐项断言 | FR-3 |
| TC-6 无需求返回 null | 组件在 `hasRequirement !== true` 时的早退分支仍存在（源码断言 `return null`） | FR-1 |

## T-4 · 命令与期望输出 serves: FR-6

```bash
# ① 单测（Node 环境，秒级）
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts
# 期望：6 passed

# ② 布局探针（headless Chrome，真实容器查询）
./node_modules/.bin/tsx scripts/header-progress-probe.mts
# 期望：6 行 DIAG（problems=NONE）+ 末行 PROBE PASS，退出码 0
# 找不到 Chrome：退出码 2 + 明确提示（不静默通过）

# ③ 类型与构建
./node_modules/.bin/tsc --noEmit -p tsconfig.json && pnpm build:client
```

## T-5 · 明确不测的项 serves: FR-5

- 像素级视觉快照（字体/间距跨平台有差异，不做快照）。
- 真机 Safari/Firefox（降级路径在 D-4 记录，探针只跑本机 Chrome）。
- 看板页、列表视图、DAG 画布、节点面板内容（不在本需求边界内）。
