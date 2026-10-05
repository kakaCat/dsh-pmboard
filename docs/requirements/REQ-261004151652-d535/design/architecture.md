---
serves: FR-1, FR-2, FR-3, FR-4
---

# REQ-261004151652-d535 设计 · 架构（节点内上下两行 + 阈值等式 + 徽章让位）

## 目标与不变量（serves: FR-1, FR-2, FR-3）

**目标（可证伪）**：会话头部流程图在**容器 > 600px 的一切宽度**下都能看到「每个可见节点自己的 token」；累计总数徽章只在节点明细完全不可见（容器 ≤ 600px）时出现。

**必须同时成立的不变量**：
1. 标题行不被撑破：探针各档 `rowRightOverflow ≤ 0`、`docOverflow = 0`；
2. 芯片内部零滚动：`chartScrollX = 0`；
3. 当前节点恒可见（圆点带 `●`），计数恒在；
4. **有名字就有数**：该档可见的节点名，其 token（若该节点确有快照）必须同样可见——由 `token 阈值 === label 阈值` 结构性保证；
5. token 口径不动（仍为执行会话快照差值；不含子代理）；后端字段与接口契约不动。

## 三条设计决策（为什么这么定）（serves: FR-1, FR-2, FR-3）

**D-1 上下两行换横向空间（FR-1）**：`.dsh-pm-flow-meta` 由横排（名字·数字同行）改为纵排（名字在上、数字在下）。实测同一组数据：横排 7 节点名 + 4 数字 + 6 连线 = **358px**，纵排 = **214px**（省 40%）；芯片总宽 463 → **320px**。
为什么必须同时取消「节点被压到 32px 最小宽」的收缩：横排时数字（≈33px）宽于最小宽，窄档会串成 `827.8k10.9M922.0k12.7M`（实测 E-4）。纵排下节点宽取 `max(名字, 数字)`，`flex: none` 不许再压。

**D-2 阈值等式：`FLOW_TIERS.token` 1000 → 600，与 `label` 相等（FR-2）**：
可见性规则由三段 `@container` 表达：
| 容器 C | 节点名 | 节点 token | 连线 | 累计徽章 |
|---|---|---|---|---|
| C > 780 | 全部 7 个 | 全部（有快照者） | 有 | 无 |
| 600 < C ≤ 780 | 仅当前节点 | **仅当前节点**（有快照则显） | 无 | 无 |
| C ≤ 600 | 无 | 无 | 无 | **有** |

`token === label` 让「有名字就有数」变成**结构性事实**而不是两条规则的巧合：名字全隐的档位恰好也是 token 全隐的档位。旧值 1000 是**节点缩小前的旧账**（文档写「带 token 近 790px」，而那是圆点 22→14px、最小宽 58→32px 之前的尺寸）。

**D-3 累计徽章让位（FR-3）**：`.dsh-pm-cprog-token-total` 默认 `display: none`，只在 `label` 档（容器 ≤600px，明细全隐）的 `@container` 块里改为显示。
为什么默认隐藏：宽档里「各节点相加」已经给出总数，再挂一个总数是重复；而**降级路径（浏览器不支持容器查询）下默认隐藏正好也是对的**——那时全部明细可见，总数同样冗余。

## 改动点地图（serves: FR-1, FR-2, FR-3）

| # | 文件 | 改什么 |
|---|---|---|
| 1 | `src/client/flow-chart-model.ts` | `FLOW_TIERS.token: 1000 → 600`（单一源；注释写明等式语义与实测依据） |
| 2 | `src/client/styles/token.ts` | `.dsh-pm-flow-meta` 改纵向（`flex-direction: column; align-items: center; gap: 0`）；`.dsh-pm-cprog-token-total` 默认 `display: none` |
| 3 | `src/client/styles/board.ts` | `.dsh-pm-flow-node` 取消最小宽压缩（`flex: none`，宽度由内容决定）；`label` 档块内补 `.dsh-pm-cprog-token-total { display: inline-flex }`；`token` 档块的注释与语义更新 |
| 4 | `src/client/conversation-progress.ts` | **不动**（DOM 结构与类名不变，只换排版与显隐） |
| 5 | `scripts/header-progress-probe.mts` | 档位期望表按新规则重写 + 两条新断言（有名字就有数 / 明细不可见时总数必在） |
| 6 | `tests/header-progress-responsive.test.ts` | 更新 `FLOW_TIERS` 常量断言；新增 meta 纵向、徽章默认隐藏 + 窄档显示的 CSS 结构断言 |

**不动的**：`src/http/routers/stages.ts`（后端与 `nodes[].tokens` 契约）、详情面板与 Token tab、芯片座位与 `order -20`、`.dsh-pm-flow-token` 的样式（只改显隐阈值）。

## 回归锚点（serves: FR-4）

- 探针两模式（档位 6 档 + 降级 5 档）退出码必须 0，且**两条新断言**：
  ① 有名字就有数（标本的当前节点 `implementing` 有快照，故「可见名数 > 0 ⟺ 可见数 ≥ 1」严格成立）；
  ② 明细不可见时（容器 ≤600）累计徽章必须可见。
- **红态自证**：把 `token` 阈值改回 1000（或把 meta 改回横排），B/C 档必红——红绿两份输出一起入证据，防装饰断言。
- 单测：`FLOW_TIERS` 与三段 `@container` 逐一相等（既有 TC-2 的机制）；新增 `flex-direction: column` 与徽章显隐规则在场。
- 构建：`pnpm build:client` 退出码 0（C-12）；窄档截图（视口 ~830）里每个数字都在其名字正下方。

## 兼容与回滚（serves: FR-1, FR-2, FR-3）

- **兼容**：纯样式与常量改动——后端契约、DOM 结构、类名、节点点击行为、文档打开行为全部不变；老客户端/老宿主不受影响（无新字段）。
- **降级路径**（浏览器不支持容器查询 / 组件无容器祖先）：全部明细照旧可见、徽章默认隐藏——与宽档行为一致，不出现「总数孤零零」。
- **回滚**：`FLOW_TIERS.token` 改回 1000、meta 改回横排、徽章改回常显即可；无数据迁移、无 schema、无开关。
