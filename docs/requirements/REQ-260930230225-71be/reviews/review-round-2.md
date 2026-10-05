# 验收反馈处理记录 · 第二轮（REQ-260930230225-71be）

> 生成于验收阶段。用户在当前 GUI 上看到实机效果后给了两条反馈，本文逐条记录「怎么理解的、怎么改的、改完什么变了」。
> 说明：`verification.md` 是验收单自动生成物（每次 submit 重写），所以反馈处理记录放在这里，不放进那份文件。

## 1. 反馈原文与理解

| # | 用户原话 | 理解与动作 |
|---|----------|------------|
| ① | 「感觉现在图的节点太大了，缩小点」 | 节点（圆点 / 名称 / 连线 / 芯片内边距）整体缩小约 30% |
| ② | 「subagent 的那个应该再前面，现在太大挤压了其他的地方」 | 经确认指的是右上角官方 `ui-jobs` 的「N 个后台任务」入口。它被挤的原因是**我们这张图太宽**，所以动作 = 把图缩小、把空间还给标题与右侧入口 |

## 2. 尺寸改动（①）

| 元素 | 改前 | 改后 |
|------|------|------|
| 圆点 | 22px / 字号 11 | **18px / 字号 10** |
| 节点名 | 10px | **9.5px** |
| 节点最小宽 | 58px（C 档 28 / D 档 24） | **44px（C 档 24 / D 档 20）** |
| 连线 | 16 × 2px，上边距 10 | **12 × 2px，上边距 8** |
| 芯片内边距 / 间距 | 6px 12px / 10px | **4px 9px / 8px** |
| 计数 | 11px | **10.5px** |

实测芯片宽度（标本页，同模型同 CSS）：

| 行宽 | 改前 | 改后 | 省出 |
|------|------|------|------|
| 1280px（容器 1232，含 token） | ~630px | **444px** | ~186px |
| 974px（容器 926，无 token） | ~576px | **434px** | ~142px |

## 3. 档位阈值重算（①的连带调整，**属于对已批准契约的调整，请在本轮验收确认**）

| 档位 | 改前 | 改后 | 理由 |
|------|------|------|------|
| 去 token | 容器 ≤ 880 | **≤ 1100** | 含 token 的全量现在约 500px，想给标题与官方入口留 ~580px，容器 <1100 先牺牲 token |
| 去连线与非当前节点名 | ≤ 620 | **≤ 900** | 「圆点 + 当前节点名」约 222px，让 ~974px 窗口下标题能拿回 ~250px |
| 只留圆点 | ≤ 460 | **≤ 700** | 更窄时才收成纯圆点（约 194px） |

语义未变（越窄越少信息 / 当前节点恒可见 / 计数恒在），变的是**从哪一档开始收**。
阈值仍是单一源 `FLOW_TIERS`（`src/client/flow-chart-model.ts`），CSS 与单测同步消费——你要调回去只改这一处。

## 4. 关于「N 个后台任务」入口更靠前（②）

- 查证结论：该入口是官方 `ui-jobs` 的 `JobListAction`，注册在右侧 `conversation.session.header.utilities` 座位；
  本插件流程图在 `conversation.session.header.actions` 座位，**actions 恒在 utilities 之前**（DSH 定死的座位顺序）。
- 所以：**插件无法把官方入口跨座位挪到流程图前面**；能做的是不让流程图挤它 —— 图缩小后，同一窗口下省出的 140~200px
  会回到标题与右侧入口。
- 若你要的是「官方入口相对流程图更靠前」这种排序变更，属于宿主/官方插件侧改动，建议单独立项（不在本需求边界）。

## 5. 改后复跑（全部命令可复现）

```bash
./node_modules/.bin/tsx scripts/header-progress-probe.mts   # PROBE PASS（6 档），problems=NONE
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts  # 13 passed
pnpm build:client                                            # exit 0，verify-client OK
```

| 档位 | 行宽 | 容器 | 可见内容（改后） | 芯片宽 |
|------|------|------|------------------|--------|
| A | 1280 | 1232 | 圆点 + 全节点名 + token + 连线 + 计数 | 444px |
| B | 1024 | 976 | 去 token，其余同 A | 434px |
| C | 900 / 768 | 852 / 720 | 圆点 + 仅当前节点名 + 计数 | 222px |
| D | 640 / 480 | 592 / 452 | 圆点 + 计数 | 194px |

六档 `rowRightOverflow=-12`（行内）、`docOverflow=0`、`chartScrollX=0`、`problems=NONE`。

## 6. 实机确认步骤（第二轮，已被下面第 7 节取代）

1. **刷新本页**（刷新前跑的是旧 bundle；`pnpm build:client` 已重新打包）。
2. 看三件事：① 节点是否够小、不再挤压标题与右侧「N 个后台任务」；② 把窗口拉窄，是否按 1100/900/700 逐档降级；
   ③ 点任一圆点，详情面板是否仍在屏幕内。
3. 在验收单里逐项打勾；若阈值想调回 880/620/460，在本轮验收里退回并说明，我改 `FLOW_TIERS` 一处即可。
## 7. 第三轮反馈：位置定稿「靠右边」→ 右侧工具组最左

**用户原话**：「节点应该靠右边」「这个（Finder + ⌄ / ⋯ / 侧栏开关 那一组）左边」。

### 7.1 查证到的事实（这轮才查清，第 4 节的旧说法作废）

| 元素 | 注册座位 | order |
|------|----------|-------|
| subagent 目录 / Team 导航 / 模式标签 | `header.actions` | -30 / -20 / -10 |
| **ui-jobs「N 个后台任务」** | **`header.actions`** | **+20** |
| ui-open-in-app（Finder + ⌄） | `header.utilities` | -10 |
| ui-schedule | `header.utilities` | -5 |
| session-log-export | `header.utilities` | 默认 0 |
| 侧栏开关 | `header.corner` | — |

> 第 4 节旧结论「后台任务入口在右侧 utilities、插件无法影响」是**错的**：ui-jobs 其实注册在
> **标题簇**（actions, order 20）。所以第一版把流程图放在 actions order 0 时，正好排在它前面、把它挤了。

### 7.2 最终落点

`src/client/index.ts`：注册到 `conversation.session.header.utilities`，**order -20** —— 落在**右侧工具组的最左**，
紧邻「在应用中打开（Finder + ⌄）」的左侧。渲染顺序（左→右）：

```
[会话标题] [标准模式] [N 个后台任务]            ← 标题簇（actions）
        [流程图] [Finder+⌄ 在应用中打开] [⋯] [侧栏开关]   ← 右侧工具组（utilities，流程图 order -20 最左）+ corner
```

两个反馈因此同时解决：流程图在**右半边**（符合「靠右边」「这一组左边」），后台任务入口**不再被挤**
（它在标题簇里，位于流程图左边）。

### 7.3 代码与验证同步

| 项 | 变化 |
|----|------|
| `src/client/index.ts` | 槽位 `…actions`/order 0 → **`…utilities`/order -20**，注释写清官方 order 表 |
| `src/client/conversation-progress.ts` | 文件头注释同步 |
| `scripts/header-progress-probe.mts` | 标本页镜像真机座位（图表放进 `headerUtilities` 最前） |
| `tests/header-progress-responsive.test.ts` | TC-1a/TC-1b 改为断言 `…utilities` + `order: -20` |
| `evidence/wide-1280.png` / `narrow-480.png` | 按新座位重拍 |

复跑（全绿）：探针六档 `problems=NONE` + `PROBE PASS`；单测 `13 passed`；`pnpm build:client` 退出码 0。

### 7.4 实机确认（请在本轮验收里判断）

1. **刷新本页**（bundle 已重建）。
2. 看位置：流程图是否在「Finder + ⌄ / ⋯ / 侧栏开关」那一组的**左边**，且不再压住「N 个后台任务」。
3. 尺寸与降级沿用第 2、3 节：圆点 18px、阈值 1100/900/700。

