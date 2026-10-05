# 会话头部需求流程图（L2 领域篇）

> **TL;DR**：本插件在会话标题行常显一张「需求流程图」（立项→需求分析→设计→拆分→实施→验收→归档 + 进度计数）。
> 三条硬约束：**挂在右侧工具组的最左（不是标题簇）**、**宽度档位由 `FLOW_TIERS` 单一源决定**、
> **详情面板与会话框最左边对齐**。窄窗口下它不是被压扁，而是**有秩序地减信息**：
> 先去每节点 token → 再去连线与旁支节点名 → 最后只留圆点 + 计数；**当前节点、计数、需求累计 Token 三者恒在**。

## 为什么需要它（根因备忘）

| 失效点 | 机理 | 症状（都真实发生过） |
|--------|------|----------------------|
| 座位选在标题簇 `actions` | 该簇里还有 ui-jobs 的「N 个后台任务」（order **+20**）等占用者 | 芯片压在它前面，把「后台任务」挤到右边、会话标题被压成「流…」 |
| 芯片宽度由内容撑开 | 7 个节点 min-width 固定 + 连线固定宽 ≈ 578px（带 token 近 790px） | 标题行被撑破、官方工具被挤出屏 |
| 面板锚在芯片上 | 芯片一旦挪到右侧，`right: 0` 的宽面板就从屏幕左边出界 | 弹框跑到屏幕外 |
| 宽度上限只写 `64vw` | 窄窗口下与固定宽度的官方工具并排仍会溢出 | 极窄窗口仍越界 |

**一条通用机制**（改头部任何东西都该知道）：官方 `.titleRow` 带 `container-type: inline-size`，
它带来的 **layout containment** 让该元素成为**绝对/固定定位后代的包含块**——所以本组件的根
`.dsh-pm-cprog` **故意不设 `position`**，详情面板才能相对「会话框」定位；设成 `relative` 会把面板拉回芯片右下角。

## 座位与档位契约

```
座位：  titleCluster(actions)                       utilities(右侧工具组)                    corner
        [会话标题][模式标签][N 个后台任务]   [流程图(order -20)][在应用打开][⋯]        [侧栏开关]
```

| 档位（容器 = `.titleRow` 的内容盒宽） | 渲染内容 |
|------|----------|
| **明细档 C > 600px** | 圆点 + 节点名（`.dsh-pm-flow-label`，8px 状态色）+ **该节点的数在名字正下方**（`.dsh-pm-flow-token`，8px 次要灰）+ 计数；`C > 780` 时另有连线与非当前节点名 |
| **紧凑档 C ≤ 600px** | 圆点 + 计数 + **需求累计 Token**（只留数字，🪙 图标收起） |

阈值是**单一源**：`src/client/flow-chart-model.ts` 的 `FLOW_TIERS = { token: 600, link: 780, label: 600 }`；
样式写进**两段** `@container`，单测断言「CSS 里的阈值 === 常量」与「`token === label`」。

**`token === label` 是刻意的等式**（REQ-261004151652-d535）：名字全隐的档位恰好也是节点数全隐的档位，
于是「**有名字就有该节点的数**」是**结构性事实**，而不是两条规则碰巧对上。旧值 `token = 1000` 与
`label = 600` 分离，造就了「有名字没数」——用户实测反馈的正是这个。
**旧值 1000 是旧账**：文档里「带 token 近 790px」出自圆点 22→14px、节点最小宽 58→32px **之前**；
本次实测（真 Chrome）横排 358px、**上下两行 214px**（芯片总宽 463 → 320px）。

**排版与字号契约（验收反馈定稿）**：节点内**上下两行**（`.dsh-pm-flow-meta` 为 `flex-direction: column`），
节点宽由 `max(名字, 数字)` 决定（`.dsh-pm-flow-node { flex: none }`，不许再压到 min-width 让数字串行）。
字号**名字与数字同号（8px）**，数字用**次要灰**、名字保留**状态色**（已完成绿 / 当前蓝 / 未到灰）——
主次分明；计数与累计徽章 9px。第一版把数字写成 10px 正文黑，比名字还大还深，被用户判为「字体太大、颜色不对」。

**为什么「累计 Token」只在紧凑档出现**（REQ-261004143941-b2ca + REQ-261004151652-d535 的两次裁定）：
明细可见时「各节点相加」就是总数，再挂一个是重复；明细全隐时才由它兜底。它渲染在 `.dsh-pm-flow`
**之外**（计数旁），档位规则够不着它，所以默认隐藏 + 窄档显示就够，不需要额外的 JS。

## 三条不变量

1. **当前节点恒可见**（`[data-state="current"]`）；**计数（`done/total`）恒在**；**有名字就有该节点的数**（`token === label` 保证）；明细全隐时**累计 Token 让位出现**——降级只减信息，不丢定位、不丢「烧了多少」
2. **标题行永不被撑破**：六档验收宽度 + 12 档边界复核实测 `rowRightOverflow=-12`（最右座位停在行内 12px 处）、
   `docOverflow=0`、`chartScrollX=0`（芯片内部零滚动）
3. **详情面板与会话框最左边对齐**：宽窄同一套绝对定位（`top: 84px; left: 0` + `box-sizing: border-box`），
   不需要"窄档切 fixed"的双模

## 累计 Token 的口径（改它之前先读这条）

- **来源**：`GET /dashboard/api/reqboard/session/:sessionId/progress` 的 `requirement.tokenTotal`；
  计算与节点**同源**——`assembleRequirementToken(req, {tasks}).totals` 的四桶之和（节点快照优先、缺失用该节点任务执行差值兜底）。
- **不要用记录上的 `tokenUsage.totals`**：它只在**离开某阶段**时增量写入，**仍在进行中的阶段不在里面**。
  实测 `REQ-261004121649-bfa7`：记录总计 12,650,950，而正确总数 25,321,586——差额正是还在跑的 implementing。
  （验证脚本：`docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts`）
- **缺失 ≠ 0**：无任何快照时宿主**不发该键**，前端不渲染徽章（绝不显示「🪙 0」）。
- **含子代理**（REQ-261004154937-2ca3 起）：快照口径是「执行窗口会话 **+ 其全部后代子代理会话**」
  （按 `parentSession` 传递闭包）。改动前只算自身，实测某窗口 141.1M vs 真实 226.4M——**漏计 37.7%**。
  血缘与差值规则的唯一实现在 `src/domain/token/lineage.ts`（`descendantsOf` / `deltaSnapshots`），
  取数在 `src/adapters/SessionProbeAdapter.ts`（枚举零日志读 + 投影缓存同步读 + 有界冷读预热）。
  已知边界：**起链预算闸仍按旧口径（不含子代理）**，两者差异写在 Token tab 里——
  改闸门口径要另立项（阈值需重新标定）。

## 回归门（改这里前后都要跑）

```bash
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts   # 13 passed：模型/挂载/阈值/收缩/面板
./node_modules/.bin/tsx scripts/header-progress-probe.mts                 # 六档 DIAG + PROBE PASS（真实容器查询）
./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback      # 无容器语义时全量渲染 + PROBE PASS
./node_modules/.bin/vitest run tests/header-progress-e2e.test.ts          # 端到端（需本机 Chrome，找不到响亮失败）
```

**两处量法必须这么量，否则会假绿**：

- 溢出看「行内**最右直接子座位** vs 行右边缘」——`scrollWidth` 对 `overflow: visible` 的盒子**不报**溢出内容（实测恒 0）
- 可见性看 `getClientRects().length`——只看 `display` 会漏掉「颜色 token 缺失导致肉眼不可见」那一类

## 变更史（四轮验收反馈 + 两次口径/判据修正，也是"改头部"的踩坑记录）

| 轮次 | 用户反馈 | 改动与教训 |
|------|----------|------------|
| 1 | 「大小没适配屏幕」+「移到模式后面」 | 从 utilities 中间迁到 actions（模式标签右），节点缩约 30% |
| 2 | 「还是太高太长了」+「弹框应该会话框最左边对齐」 | 圆点 22→14px、节点最小宽 58→32px、内边距收紧；面板改锚会话框左边（顺带查清：面板宽度其实来自 `styles/node-panel.ts` 的 720px，不是 `board.ts` 的 420px） |
| 3 | 「节点应该靠右边 / 这个（Finder·⋯·侧栏开关）左边」 | 定稿：回 utilities 且取 **order -20**（右侧工具组最左）；同时确认 **ui-jobs 注册在 actions(+20)**，两者不再互相挤压 |
| 4 | 「token 统计不展示了」 | 档位把**结论**（累计消耗）和**明细**（每节点）一起裁了。改法：新增不参与降级的累计 Token 徽章；口径改用 `assembleRequirementToken` 的合计（记录级总计会漏掉进行中阶段）；探针新增「各档可见 token ≥ 1」硬断言并留红态证据（REQ-261004143941-b2ca） |
| 5 | 「我希望看到每个节点用了多少 token」→ 又提「上下模式」 | 用户要的是**明细**而不是总数。改法：节点内改上下两行（358→214px）；`token` 阈值降到与 `label` 相等（1000→600）让「有名字就有数」成为等式；累计徽章改为**只在明细全隐时**出现。教训：**旧阈值是旧账**——节点缩小后没人重算，「放不下」是假前提（REQ-261004151652-d535） |
| 6 | 「字体太大、颜色不对、样式和之前不一样」 | 上下两行后数字 10px 正文黑、名字 8px 状态色 ⇒ **主次颠倒**。改法：数字 8px 次要灰（与名字同号、退居辅助），计数与徽章 9px。教训：**排版换了，字号关系要跟着重审**——同一条 CSS 在横排里没问题，竖排后就成了视觉主角 |

## 来源

- **REQ-260930230225-71be**《会话头部需求流程图改为响应式并移到模式标签后》（8/8 验收项通过后归档）
- **REQ-261004143941-b2ca**《会话右上角流程图 token 统计不展示：定位与修复》（口径修正 + 累计 Token 兜底）
- **REQ-261004151652-d535**《流程图每节点 token 在窄窗口也要看得到》（上下两行 + 阈值等式 + 徽章让位 + 字号主次）
- 落点：`src/client/index.ts`（座位）、`src/client/flow-chart-model.ts`（模型 + `FLOW_TIERS` + 累计 token 落模）、
  `src/client/styles/board.ts` 与 `styles/node-panel.ts`（收缩 / 档位 / 面板 / 节点排版）、`styles/token.ts`（节点数字与徽章字号）、
  `src/client/conversation-progress.ts`（渲染）、`src/http/routers/stages.ts`（`requirement.tokenTotal`）
- 回归：`scripts/header-progress-probe.mts`（两档模型 + 三条断言码）、`tests/header-progress-responsive.test.ts`、
  `tests/header-progress-e2e.test.ts`、`tests/session-progress.test.ts`
