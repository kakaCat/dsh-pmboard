# REQ-260930230225-71be 证据与复现

> 本目录是验收材料的一部分。全部证据都能在本机复跑；找得到 Chrome 就跑，找不到会响亮失败（退出码 2）。

## 1. 交付物长什么样（两张图）

| 文件 | 是什么 | 怎么来的 |
|------|--------|----------|
| `wide-1280.png` | 宽档（行宽 1280px）：圆点 + 节点名 + 每节点 token + 连线 + `3/12` 计数全显示；芯片位于**右侧工具组的最左**（Finder / ⋯ / 侧栏开关那一组的左边） | 真实 `buildFlowChartModel()` 模型 + 真实插件 CSS（BASE + BOARD + TOKEN 三个分片）+ 复刻的 DSH 标题行几何，headless Chrome 截图 |
| `narrow-480.png` | 窄档（行宽 480px）：自动降级成「圆点 + 计数」，7 个圆点全在视野内，标题行不溢出 | 同上 |

两张都是**标本页渲染**，不是实时 GUI 截图：窗口宽度 = 行宽度，用来把档位行为钉死。
实时界面请在 `pnpm build:client` 后刷新本页查看（刷新前页面跑的是旧 bundle）。

## 2. 怎么复跑

```bash
# ① 六档视口布局探针（真实容器查询，本需求主要证据）
./node_modules/.bin/tsx scripts/header-progress-probe.mts
#    期望：6 行 DIAG + 末行 PROBE PASS，退出码 0

# ② 降级路径（模拟不支持容器查询的引擎）
./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback
#    期望：5 行 DIAG + PROBE PASS，退出码 0

# ③ 契约单测（挂载点 / 档位常量 / 收缩规则 / 面板双模 / 模型映射 / 空需求早退）
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts
#    期望：13 passed

# ④ 构建（会把 lib/client.js 重新打包，之后刷新本页生效）
pnpm build:client
```

## 3. 实测输出（2026-09-30，本机 Chrome）

```
DIAG frame=1280 viewport=1280 container=1232 tier=A nodes=7 links=6 tokens=2 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=296..746 problems=NONE
DIAG frame=1024 viewport=1024 container=976  tier=A nodes=7 links=6 tokens=2 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=296..746 problems=NONE
DIAG frame=900  viewport=900  container=852  tier=B nodes=7 links=6 tokens=0 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=266..716 problems=NONE
DIAG frame=768  viewport=768  container=720  tier=B nodes=7 links=6 tokens=0 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=224..674 problems=NONE
DIAG frame=640  viewport=640  container=592  tier=C nodes=7 links=0 tokens=0 labels=1 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=178..628 problems=NONE
DIAG frame=480  viewport=500  container=452  tier=D nodes=7 links=0 tokens=0 labels=0 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=38..488  problems=NONE

PROBE PASS（6 档视口：标题行不溢出 / 档位可见集正确 / 当前节点恒可见 / 面板不越界）

DIAG fallback frame=1280 viewport=1280 container=1232 tier=A nodes=7 links=6 tokens=2 labels=7 rowOverflow 量法见下 chartScrollX=0   problems=NONE
DIAG fallback frame=900  viewport=900  container=852  tier=B nodes=7 links=6 tokens=2 labels=7 chartScrollX=0   problems=NONE
DIAG fallback frame=768  viewport=768  container=720  tier=B nodes=7 links=6 tokens=2 labels=7 chartScrollX=94  problems=NONE
DIAG fallback frame=640  viewport=640  container=592  tier=C nodes=7 links=6 tokens=2 labels=7 chartScrollX=222 problems=NONE
DIAG fallback frame=500  viewport=500  container=452  tier=D nodes=7 links=6 tokens=2 labels=7 chartScrollX=362 problems=NONE

PROBE PASS（降级态：无容器语义时全量渲染且标题行不溢出）
```

> `rowRightOverflow=-12` 的含义：行内最右座位停在行右边缘**内侧 12px**（官方角落座位 `margin-right: -16px` + 行右内边距 28px 的几何结果），即**没有内容越出标题行**。`docOverflow=0` 是文档级横向溢出。

## 4. 实施过程中如实记录的三处偏离 / 修因

| 项 | 设计里写的 | 实际做的 | 为什么 |
|----|-----------|---------|--------|
| 降级上限 | `.dsh-pm-cprog-inline { max-width: 64vw }` | `min(64vw, calc(100vw - 320px))` | 64vw 单用不够：窄窗口下与固定宽度的官方工具并排仍会溢出；320px ≈ preset + utilities + corner 的固定占用 |
| 容器查询可用时 | 未写 | 新增 `@container (max-width: 880px) { .dsh-pm-cprog-inline { max-width: none } }` | 把宽度上限交还行布局后，实测六档 `chartScrollX` 从 28~102px 归零、7 个圆点全在视野内；视口上限退居「不支持容器查询」的安全网 |
| 探针 A1 量法 | `.titleRow` 的 `scrollWidth - clientWidth` | 「行内最右直接子座位 vs 行右边缘」+ 文档级 `scrollWidth - innerWidth` | Chrome 对 `overflow: visible` 的盒子**不把溢出内容算进 scrollWidth**，原量法恒为 0（假绿）。改后能真正抓到越界 |

另有一处验证缺陷（非交付代码）：探针标本页最初漏了 `BASE_CSS` 的 `--pm-*` 色彩 token，done 圆点变成「白字透明底」——断言只看 `display` 所以照样通过，截图里却一个点都看不见。已补，并把它写进脚本注释当围堵记录。

## 5. 已知残余（不藏）

- **不支持容器查询的引擎**（老 Safari/Chromium）：档位规则整体不生效 → 退化为全量渲染；行仍不溢出（靠 `min(64vw, 100vw-320px)` + 内层 `overflow-x: auto`），但窄窗口下图表会出现**内部横向滚动**（见上表 `chartScrollX`）。同档位下面板回到 `right:0` 锚点，极窄窗口可能向左溢出屏幕。
- **档位边界**：改法后六档实测 `chartScrollX=0`，但介于两档之间的宽度（例如行宽 640~700px）仍可能在芯片内部出现 1 条横向滚动条（残余，探针会把它打进 DIAG 供观察，不判失败）。
- **实机确认**：本目录截图是标本页；实时 GUI 需刷新后肉眼确认一次（刷新前跑的是旧 bundle）。

## 6. 回滚（一条命令级路径）

改动只有三处源文件 + 三个新增文件，**无数据迁移、无配置开关、无接口变更**：

| 要还原什么 | 动哪里 |
|------------|--------|
| 座位（回到右上角工具区） | »src/client/index.ts`：槽位名 »…header.actions` 改回 »…header.utilities`、»order: 0` 改回 »5` |
| 自适应行为（回到「由内容撑开」） | »src/client/styles/board.ts`：删掉三段 »@container` 与收缩/兜底规则；»styles/token.ts` 本来就未改 |
| 模型接线（回到组件内联口径） | »src/client/conversation-progress.ts`：恢复内联 »FLOW` / »flowState` 渲染；»flow-chart-model.ts` 与探针可一并删除 |

回滚后重跑 »pnpm build:client` 并刷新页面即可；探针/单测会在这三处还原后失败，属预期（它们是本次新增的回归门）。
