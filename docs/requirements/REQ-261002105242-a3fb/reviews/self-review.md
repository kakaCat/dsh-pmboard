# 评审报告（REQ-261002105242-a3fb · 2026-10-02）

- 评审人：session-2dc1cd4e（**内部自评**；无独立评审人）
- 评审范围：t1 契约卡（`src/client/views/board.ts` + `styles/base.ts`）、t2 接线卡（泳道归档条 + 列表终态分组）、t3 终态只读（`views/stage-detail.ts`）、t4 兼容卡（`api.ts` / `board-mount.ts` / `views/verification.ts` + 两条既有用例翻转）、t5 验证卡（证据汇总）；测试文件 `tests/archived-entry.test.ts`（新增）、`tests/client-view.test.ts`（1 例精确化）、`tests/board-info-fixes.test.ts`（1 例翻转）
- 评审类型：内部自评
- 结论：**通过**（评审中自查出 2 处自身缺陷并已修，另披露 1 处范围外既有红与 1 处已确认文档的清单漏项）

## 评审维度清单（逐项过，不适用标 N/A）

- [x] **完整性**：5 条条款全部有落点且都有可跑判据——FR-1 ← t1,t2（投影 + 归档条 + 两条视图接线）；FR-2 ← t3（三态早退）；FR-3 ← t2（`finished` 死分支修复）；FR-4 ← t4（三处残留 + 文案 + 两条既有用例翻转）；FR-5 ← t1,t5（投影不变量 + 真实数据端到端）。台账 `clause_receive_status` 五条全部 received、无未接收条款。
- [x] **一致性**：`design/interfaces.md` §1/§2/§3/§4/§5/§6 与代码逐条对得上——`toCard` 私有单点、`toTerminalCards` 导出且 `updatedAt` 降序、`ARCHIVED_CHIPS_MAX=100`、`renderArchivedBar(cards, limit?)` 可单参调用、DOM 钩子（`data-archived-bar` / `data-archived-count` / `data-action="open-req"` / `data-req` / `data-status` / `.dsh-pm-archived-count`）全部落地、事件委托零新增。
- [x] **编号可追溯**：需求文档 FR-1…FR-5 → 设计文档 `serves:` 标注 → 拆分计划覆盖对照表 → 任务卡 → 测试用例 A1…A6 六处互相引用，均可在对方文件查到；`rtm-implementing/` 下 14 张子卡 YAML 与父子结构一致。
- [x] **清晰度**：每处关键改动带「为什么」注释（为何抽 `toCard`、为何归档条默认折叠、为何终态早退、为何删僵尸入口），后来者能复现判断；三处偏差在 `tests/test-evidence.md` 第 7 节显式记账。
- [x] **可实现性**：无新依赖、无新接口、无新契约；归档条复用既有 CSS 类名与既有事件委托，旧服务端（字段更少的 state）同样可渲染。
- [x] **安全**：id / 标题一律 `esc()`（XSS 回归由既有 `client-view.test.ts` 的 XSS 用例 + 本次 A1-1 覆盖）；未放宽任何路径或权限校验；未新增网络/存储面。
- [x] **测试覆盖**：纯函数层（投影 + 归档条渲染）、字符串层（看板 / 列表 / 详情三段输出）、模块面（`'archiveReq' in api === false`）、真实数据端到端（探针取看板真实 API 的 state，不伪造 fixture）四层齐备；**修前必红**留档（11 failed / 3 passed）。
- [x] **用户价值**：直接回答并解决用户最初的困惑——「归档后 DAG 数据是不是被收回了」。现在是：数据一直都在，入口也回来了（泳道底部归档条 + 列表终态组），点开即见与归档前同源的 DAG 与任务表。
- [x] **迁移与兼容（feature 档要求）**：数据侧零迁移（`queue.json` / 台账 / 协议均未改），回滚 = `git revert` + `pnpm build:client`；旧调用方仅 `api.archiveReq` 一处，删除前已 grep 确认，删除后 `tsc` 197 ≤ 基线 223 无新增错误。

## 问题清单

| # | 位置 | 问题 | 严重度 | 处置 |
|---|------|------|--------|------|
| 1 | `docs/requirements/REQ-261002105242-a3fb/design/test-cases.md` §「需同步修订的既有用例」 | 清单只列了 2 条既有用例，**漏了第 3 条**：`tests/client-view.test.ts` 的「归档/取消不进泳道」原先断言**整页**不含归档/取消需求 id——归档条一回归它必然红（实施时实测命中） | 中 | 按该用例的真实语义精确化修订为「泳道段（归档条之前）不含 + 归档条段含」，语义不倒退且更精确；**未回改已确认的设计文档**（为一行清单重开人工门不划算），偏差已写入 `tests/test-evidence.md` 第 7 节与 t2 完工记录 |
| 2 | `evidence/probe-archive-entry.mts` 首版 A4 断言 | 断言「归档行出现在列表视图」时未考虑**列表默认 10 条/页**——真实数据 29 条需求下归档行落在后续页，探针直接失败；若不改写，验收人会把它读成产品 bug | 中 | 已改为显式 `pageSize=50` 并补一条说明性断言（默认分页下归档行在后续页，故泳道归档条是常驻入口）；重跑 exit 0，输出留档 `evidence/probe-live-output.txt` |
| 3 | `tests/board-info-fixes.test.ts:307` | `jumpResultMessage('unavailable')` 断言含「暂不可用」，而实现文案为「会话导航服务不可用（uiWorkspace 未注入）…」→ 该用例红 | 低（**范围外**） | 已用 `git diff` 确认该断言来自 HEAD（不在本次工作区改动中），且 HEAD 的 `src/client/board-mount.ts:139` 文案本就不含「暂不可用」字样——属**既有基线红**。本次不修（超出本需求边界）、不掩盖（已写入测试证据并在两处完工记录点名），建议另立需求收口 |
| 4 | 计划 t1 的验收预期 | 写的是「A1-2/A2/A4 在 t1 时仍失败」，实测 **A2 一开始就是绿的**——A2 锁的是"详情渲染能力没丢"，本需求没动它 | 低 | 判据不改（它是有价值的回归锚点），仅在 t1 完工记录里如实说明预期偏差来源 |

## 已识别的已知次优（不修，显式记账）

1. **归档条不分页**：超过 `ARCHIVED_CHIPS_MAX = 100` 条时只渲染前 100 条 + 「另有 N 条未显示」。设计阶段已声明为范围外（当前台账 21 条归档，离上限尚远）。
2. **列表视图的归档行在后续页**：默认 10 条/页，翻到「已完成 / 已归档」组需要翻页；常驻入口是泳道底部归档条，这是设计上有意为之（两个视图各给一种入口，不重复）。
3. **会话节点面板默认节点行为未动**：归档会话默认仍显示归档材料；点流程图「实施」节点照样能看到 DAG。这是现状且可用，本次不新增 UI（见 `design/use-cases.md` 非目标）。
4. **`canceled → archived` 仍无 UI 入口**：状态机允许但全站没有入口，属既有缺口、非本需求引入；本轮未新增。

## 结论

- 交付与需求文档、设计文档、拆分计划三份已确认产物**逐条对得上**；范围严格限于 client 渲染层，未越界改数据层或服务端。
- 判据：`tests/archived-entry.test.ts` 14/14 全绿；真实数据端到端探针 exit 0；全量回归 98 failed / 2991 passed 优于基线 106 / 2807；`tsc` 197 ≤ 223；`pnpm build:client` 通过 `verify-client`。
- **评审通过**，转人工验收。人工需确认的一项：刷新看板后展开归档条、点开归档需求，肉眼确认 DAG 与任务表可见且顶部无操作按钮。
