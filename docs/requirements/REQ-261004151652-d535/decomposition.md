---
req_id: REQ-261004151652-d535
serves: FR-1, FR-2, FR-3, FR-4
---

# 拆分计划（REQ-261004151652-d535）

> 依据：`design/{architecture,interfaces,data-model,use-cases,test-cases}.md`（均已确认）。
> **契约卡不单列**：本需求**不改后端契约**（`design/interfaces.md` 明写「接口逐字不变」），
> 改动集中在客户端排版与显隐常量；不造「把已冻结的东西再抄一遍」的空卡。
> 纪律：每卡 acceptance 必须能跑；本需求动的是 client 源码 ⇒ 构建（C-12）必须在收口卡里真跑。

## 目标

会话头部流程图的**每个节点 token** 在容器 >600px 的所有宽度下都看得见：节点内改上下两行（名字在上、数字在下）换出横向空间，
`FLOW_TIERS.token` 降到与 `label` 相等（1000→600）使「有名字就有数」成为结构性事实；
累计总数徽章默认隐藏、只在明细全隐（≤600px）时让位显示。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `src/client/flow-chart-model.ts` | 修改（`FLOW_TIERS.token: 1000 → 600`；注释写明等式语义与实测依据） | t1 |
| `src/client/styles/token.ts` | 修改（`.dsh-pm-flow-meta` 改纵向；`.dsh-pm-cprog-token-total` 默认 `display:none`） | t1 |
| `src/client/styles/board.ts` | 修改（节点宽按内容、取消 32px 压缩；`label` 档块补徽章让位规则；`token` 档与 `label` 档同值合并） | t1 |
| `tests/header-progress-responsive.test.ts` | 修改（更新 `FLOW_TIERS` 断言；新增纵排 / 等式 / 徽章显隐四条结构断言） | t1 |
| `scripts/header-progress-probe.mts` | 修改（档位期望表按新规则重写；新增三条断言：有名字没数 / 明细隐却无总数 / 明细在却显总数） | t2 |
| `docs/requirements/REQ-261004151652-d535/evidence/` | 新增（探针红/绿输出、构建日志、三档截图、基线对照） | t3 |

**不动**：`src/http/routers/stages.ts`（后端与 `nodes[].tokens` 契约）、`src/client/conversation-progress.ts`
（DOM 结构与类名逐字不变）、详情面板与 Token tab、芯片座位（`order -20`）、`.dsh-pm-flow-token` 的样式本身。

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 节点改上下两行、阈值对齐「有名字就有数」、总数徽章让位 | ui | frontend | — | FR-1, FR-2, FR-3 |
| t2 | 探针改判据：各档可见集重写 + 三条新断言 + 红态自证 | test | frontend | t1 | FR-4, FR-2 |
| t3 | 构建 + 基线回归 + 兼容/回滚 + 三档截图（收口） | test | fullstack | t1, t2 | FR-1, FR-2, FR-3, FR-4 |

**并行说明**：t1 与 t2 改的文件面不重叠（源码 vs 探针），但 t2 的期望表要照 t1 落地后的真实可见集写，
故 `depends_on t1`；t3 是链尾收口。

## 覆盖对照表

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1, t3 |
| FR-2 | t1, t2, t3 |
| FR-3 | t1, t3 |
| FR-4 | t2, t3 |

## 各卡验收（可证伪）

- **t1**：`./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts` 全绿，逐条含：
  `FLOW_TIERS` 与三段 `@container` 阈值逐一相等（600/780/600）；`FLOW_TIERS.token === FLOW_TIERS.label`；
  `TOKEN_CSS` 含 `.dsh-pm-flow-meta` 的 `flex-direction: column`；
  `TOKEN_CSS` 里 `.dsh-pm-cprog-token-total` 默认 `display: none` 且 `BOARD_CSS` 的 label 档块内有它的
  `display: inline-flex`；`BOARD_CSS` 内不存在把节点级 token 与 label 拆到两个断点的规则。
  另 `pnpm build:client` 退出码 0（`[verify-client] OK`）、`pnpm typecheck` 本需求文件 0 个错误。
- **t2**：`./node_modules/.bin/tsx scripts/header-progress-probe.mts` 退出码 0，
  6 档 `problems=NONE` 且可见集与设计 `test-cases.md` TC-1 的期望表逐档一致
  （1232/976/852 档：7 名 + 2 数 + 6 线 + 无徽章；720 档：**1 名 + 1 数** + 0 线 + 无徽章；
  592/452 档：0 名 + 0 数 + 0 线 + **徽章可见**）。
  `--fallback` 模式 PASS（全明细可见 + 徽章隐藏）。
  **红态自证**：把 `FLOW_TIERS.token` 改回 1000 → 720 档变「1 名 0 数」→ 退出码 1；
  把徽章改回常显 → 宽档报 `TOTAL_DUPLICATED` → 退出码 1。红/绿两份输出一起存入 `evidence/`。
- **t3**：`pnpm build` 与 `pnpm build:client` 退出码 0 且产物时间戳更新；
  全量 `pnpm test` 的失败文件集合与改动前**逐文件相同**（贴 diff 输出）；
  `pnpm typecheck` 错误数 ≤ 146；三档截图（1280 / 700 / 560）落盘，
  **700 档图里当前节点名字下方能看到它自己的数**、560 档图里只有圆点 + 计数 + 徽章；
  兼容与回滚路径逐条写明（无后端/契约变更、降级路径行为、三处独立回滚）。

## 兼容与回滚

- **后端与契约**：零变更（`design/interfaces.md` 明写）。老客户端、老宿主、老需求数据全部不受影响。
- **降级路径**（无容器查询）：三段规则不命中 → 全明细可见 + 徽章默认隐藏——与宽档一致，不出现重复信息。
- **回滚**：`FLOW_TIERS.token` 回 1000、meta 回横排、徽章回常显；三处独立可回，
  无数据迁移、无 schema、无开关、无缓存。

## 边界（不做）

与需求文档「边界」三条一致：不改 token 口径（仍为会话快照差值，不含子代理）；不给只有圆点的最窄档硬塞每节点数字；
不改芯片座位、面板锚定与后端字段。没写进边界的即本次不做。
