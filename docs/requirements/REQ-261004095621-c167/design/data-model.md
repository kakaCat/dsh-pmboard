---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 数据模型设计（REQ-261004095621-c167） <!-- serves: FR-2, FR-3, FR-4 -->

## 实体总览（本期零新增台账实体） `serves: FR-2, FR-3`

| 实体 | 载体 | 本期变化 | 说明 |
|---|---|---|---|
| 席位快照（slot occupant） | 运行时只读 | 不落库 | `Slots.listSubTree` 现取现用：`registrant` / `active` |
| 缺陷报告 | `docs/requirements/<REQ>/evidence/dsh-model-seat-crash.md` | 新增（文档） | FR-3 的 DSH 侧交付物 |
| 知识层 pitfall 条目 | `docs/knowledge/entries/kb-00XX.md` + INDEX 一行 | 新增（文档） | FR-1/FR-4 的判别法固化 |
| 需求台账（req/task/artifact） | `~/.dsh/reqboard/**` | **零变更** | 不新增字段、不改结构 |

## 字段与契约 `serves: FR-2`

- **台账字段**：0 新增 / 0 修改 / 0 删除（本需求不写台账结构）。
- **KB 条目 front-matter**：沿用既有必填键 `id / kind / status / title / one_liner / applies_when / updated / req`，
  不新增键；正文四节（结论 / 适用条件 / 证据 / 失效条件）为既有契约。
- **FR-2 若将来实施**（本期不落地）才涉及新数据：`~/.dsh/state/pm-client-render-errors.jsonl`，
  单条字段见 `design/interfaces.md` 附录。

## 版本兼容与迁移 `serves: FR-2`

- **迁移**：无（无结构变更、无历史数据回填、无索引重建）。
- **兼容**：纯新增文档；旧读取方（`reqboard_kb` / 看板索引）行为不变。
- **回滚**：删新增条目与 INDEX 行即可，无残留状态。

## 数据不变量（可断言） `serves: FR-4`

| 编号 | 不变量 | 断言方式 |
|---|---|---|
| INV-1 | 本仓不得在 `conversation.input.model` 注册任何占用者（红线：不遮蔽自带控件） | `grep -rn "conversation.input.model" src/client` 必须为空 |
| INV-2 | 本仓客户端组件返回的元素必须带 `$$typeof`（合法 ReactElement） | `pnpm vitest run tests/kb-client-page.test.ts` 的 `$$typeof` 断言 |
| INV-3 | 知识层条目 id 唯一且 `status: active` 才进索引 | `pnpm kb:check` |
