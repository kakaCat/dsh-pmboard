# 验收反馈处理记录 · 第三轮（REQ-260930230225-71be）

> 两句反馈：**「还是太高了再矮点，太长了」**、**「弹框应该会话框最左边对齐」**。本文记录改法与实测。

## 1. 流程图：再矮一档、再短一档

| 元素 | 上一版 | 本版 |
|------|--------|------|
| 圆点 | 18px / 字号 10 | **14px / 字号 9** |
| 节点名 | 9.5px | **8px** |
| 节点最小宽 | 44px（C 24 / D 20） | **32px（C 20 / D 18）** |
| 连线 | 12 × 2px，上边距 8 | **8 × 2px，上边距 6** |
| 芯片内边距 / 间距 | 4/9px、8px | **2/6px、6px** |
| 节点竖向间距 | 3px | **1px** |
| 计数 | 10.5px | **10px** |

实测（标本页同模型同 CSS，窗口宽 = 行宽）：

| 行宽 | 档位 | 芯片尺寸（本版） | 上一版 |
|------|------|------------------|--------|
| 1280 | A（含 token） | **344 × 37** | 444 × ~51 |
| 1024 / 900 | B | **316 × 34** | 434 × ~51 |
| 768 | C（圆点 + 当前名） | **184 × 34** | 222 × ~51 |
| 640 / 480 | D（圆点 + 计数） | **170 × 22** | 194 × ~51 |

阈值随尺寸再降一档：**1100/900/700 → 1000/780/600**（越小越早收，语义不变）。改一处 `FLOW_TIERS` 即可回调。

## 2. 详情面板：与会话框最左边对齐

### 2.1 先纠正一个事实（前两轮都判断错了）

面板的实际宽度**不是** board.ts 写的那 420px，而是 `styles/node-panel.ts` 里的
`width: min(720px, calc(100vw - 130px))` —— 它在样式拼接顺序里排在 board.ts 之后，所以一直是它生效。
这也解释了截图里面板为什么比预期宽得多。

### 2.2 定位机制：面板的包含块就是「会话框」

官方 `.titleRow` 带 `container-type: inline-size`，这带来 **layout containment** ——
按规范，它同时让该元素成为**绝对/固定定位后代的包含块**。所以：

| 项 | 改前 | 改后 |
|----|------|------|
| `.dsh-pm-cprog` | `position: relative`（面板被拉回芯片右下角） | **不设 position** → 面板锚到会话框（.titleRow 的包含块） |
| 面板定位 | `top: calc(100% + 8px); right: 0`（贴着芯片右侧） | **`position: absolute; top: 84px; left: 0; right: auto`** → 左缘贴会话框左边 |
| 宽度 | `min(420px, …)`（被 node-panel 的 720px 覆盖） | `min(720px, calc(100% - 32px))` + **`box-sizing: border-box`** |
| 窄档双模 | `@container (≤900) { position: fixed; right: 12px }` | **删掉** —— 包含块本来就是会话框，一条 absolute 宽窄通用 |

实测：六档下面板左缘 = **0**（会话框左缘），右缘 498~750，全部在会话框内。

### 2.3 探针新增断言（防止再次「锚错地方」）

只查「不越界」抓不到锚错位置，所以 t5 的探针加了一条正向断言：

> 面板左缘 ≤ 会话框左缘 + 16px（宽档 0、窄档容忍内缩）——现在六档都是 `left=0`。

## 3. 复跑结果（本版）

```bash
./node_modules/.bin/tsx scripts/header-progress-probe.mts            # 6 行 DIAG + PROBE PASS
./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback # 5 行 DIAG + PROBE PASS
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts  # 13 passed
pnpm build:client                                                    # exit 0，verify-client OK
```

六档关键量：`rowRightOverflow=-12`（在行内）、`docOverflow=0`、`chartScrollX=0`、`panel=0..750/638/498`、`problems=NONE`。

## 4. 请你在本轮验收里判断

1. **刷新本页**（bundle 已重建）。
2. 看两件事：① 流程图是否够矮够短（应比上版再小 ~30%）；② 点任一圆点，弹框是否**贴着会话框左边**展开。
3. 阈值 1000/780/600 与左对齐方式若想调整，在验收单里退回说明即可（阈值一处常量、面板一条定位）。
