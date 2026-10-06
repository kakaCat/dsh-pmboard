# 数据模型设计 · REQ-261006164732-6503 <!-- serves: FR-1, FR-2, FR-4, FR-5, FR-6 -->

> 关注点：门是什么形状、被读 / 被写哪些字段、可断言的不变式、迁移与回滚。
> 结论先行：**零 schema 变更、零持久字段、零回填**。

## G-1 结论：门是运行时结构，不落库 <!-- serves: FR-4, FR-6 -->

门（确认请求）今天就不在台账里——它是进程内的 `PendingConfirmation` 记录（`PendingConfirmRegistry`）。
本需求**不新增持久字段、不写台账新键、不做任何回填**；判据全部是**读时判定**。

## G-2 门的形状（沿用既有字段，语义收紧） <!-- serves: FR-1, FR-2 -->

| 字段 | 类型 | 语义（本次收紧点） |
|---|---|---|
| `ticket` | string | 门 id（`pc-…`）；**复用**时原样返回同一个 |
| `windowKey` | string | **首个**建门者的窗口（唤醒与回执归属）；跨窗口复用**不覆盖** |
| `requirementId` | string | 唯一性键的一部分 |
| `target` | `'artifact' \| 'plan'` | 唯一性键的一部分 |
| `kind?` | ArtifactKind | 唯一性键的一部分（`target='plan'` 时缺省） |
| `createdAt` | number | TTL 基准（`interruptedAt ?? createdAt`，逐字不变） |
| `interruptedAt?` | number | 阻塞被中止的留痕（语义不变） |
| `outcome?` | `{confirmed, advanced, userChoice?, userFeedback?}` | **open ⇔ `outcome === undefined`**——"门仍 open"的唯一判据 |

不定入持久字段：`reused` 之类是**一次调用的返回语义**，不是门的状态（下次调用可能新建）。
"谁能答"同样是**推导量**（有门 + 产物在册 ⇒ 看板与会话都能答），不新增存储。

## G-3 唯一性口径与判定键 <!-- serves: FR-1 -->

- 判定键 = `(requirementId, target, kind)`；**不含 `windowKey`**——同一需求的同一道门，人只该被问一次，
  跨窗口（多窗口 / worker 席位）亦然。
- "命中"= 键相同 ∧ `outcome === undefined` ∧ 未过期（TTL 沿用既有口径）。
- 命中数恒为 **0 或 1**（不变式）；不断言"必须为 1"——"还没有门"是合法状态。
- 判定是**纯读**：不 settle、不 `markInterrupted`、不写任何标记、不改任何字段。
- 复用不改 `createdAt`（不续期）：门的老化不被复用延长，避免"反复请求把门续成永不过期"。

## G-4 台账写入不变式（可断言） <!-- serves: FR-4, FR-5 -->

| 不变式 | 断言（跑什么、看到什么） |
|---|---|
| **首写即事实** | `plan.approvedAt` / 产物 `confirmedAt` / `approvedEvidence` / `confirmedEvidence` 一经非空写入，任何后到路径（迟到作答 / 回执续跑 / 看板重试）都不得改变其值 |
| **落章前提** | 落章必经「门 open ∧ `status === sourceStageOf(target, kind)`」；不满足 ⇒ 台账**零新时间戳**，只多一条评论 |
| **附件不动** | 落章不新增 / 不删除产物，不改 `path` / `registeredAt` / `registeredBy` |
| **门的状态单调** | `outcome` 一经写入不再改变（既有 `settle` 首写口径不变） |

## G-5 迁移 / 回滚 <!-- serves: FR-6 -->

| 面 | 结论 |
|---|---|
| DDL / schema | **零变更**（门表是进程内结构；本需求不碰数据库） |
| 存量数据 | 不迁移、不回填；存量未作答门**按新判据即时生效**（复用 / 早退都是读时判定） |
| 历史台账 | 历史上被迟到作答覆写过的记录**保持原样**——本需求只保证"此后不再被覆写"，不追溯改写 |
| 旧调用方 | 对外工具参数与返回键**零变更**（I-3）：旧调用方无需改一行 |
| 回滚 | 代码回退 + `node scripts/inline-prompt-fragments.mjs` 重生成提示词产物；**无数据侧回滚动作** |
| 开关 | 不引入配置开关（判据幂等；回滚即还原代码，不需要灰度口径） |
