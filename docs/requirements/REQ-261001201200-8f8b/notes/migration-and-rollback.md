# REQ-261001201200-8f8b 迁移、兼容与回滚说明（t5）

## 1. 数据库 / 台账 schema：**零变更**

- 未新增、未删除、未修改任何台账字段（`RequirementRecord.dive`、`comments` 全部沿用既有形状）。
- 因此**无需迁移脚本、无需回填、无需双读或开关**。旧台账可直接被新代码读取。

## 2. 存量数据：**不回填**（有意为之）

- 「误停摆」判定纯靠既有字段组合（`activation=disarmed` 且 `phase=active`），不需要新字段。
- 存量 `disarmed` 需求**不做一次性批量重写**：历史记录无法可靠区分「当时是驱动失败」还是「当时人就是想手动跑」，
  批量重写会把后者也一并武装，越权覆盖人的决定。
- 收敛路径：下一次推进事件（人确认 / 看板推进 / 派生推进）自动恢复，或人在看板点「继续」显式恢复。

## 3. 旧调用方处置

| 调用方 | 处置 |
|--------|------|
| `createCaptureRuntime` 调用方 | `idFactory` 为**可选**入参；不传则回落 `newCommentId()`，旧调用方**零改动** |
| 直接 `new AgentDeliverer(...)` 的调用方 | 契约是三参 `(resolveAgents, idFactory, plugin)`；第二参非函数 → **构造期抛 TypeError**（刻意响亮，避免装配错误再被拖到运行期） |
| `deliverMessage` 消费方 | 返回形状 `{ delivered, reason? }` 与「永不抛」语义**逐字未变** |
| HTTP `POST /req/autorun` 消费方 | 返回体**未新增键**（恢复信息并入既有 `advanceNote`） |

## 4. 旧测试处置

- `tests/agent-deliverer.test.ts`：旧 `deliver()` API 与两参 options 构造已在「全面 Dive 化」中失效（9/9 全红），
  本次迁移到 `createRoundMessage` / `deliverMessage` 三参构造，并补「构造契约」一组断言。
- `tests/dive-round-driver.test.ts`：test harness 里给 fake delivery 多写的 `deliver` 属历史残留，本次未动（既有类型告警，非本需求引入）。

## 5. 回滚路径

改动集中在 **6 个源文件 + 4 个测试文件 + 3 个新增文件**，回滚即还原它们，**无数据副作用**：

```
源：  src/wiring/pm-capture-root.ts
      src/adapters/AgentDeliverer.ts
      src/index.ts                                  （diveRoundPorts 增 delivery / idFactory）
      src/application/dive/round-state.ts           （增 isRecoverableDisarm）
      src/application/dive/round-driver.ts          （disarm 留痕 + onRequirementMoved 恢复检查）
      src/http/routers/requirements.ts              （autorun 增恢复入口）
新增：src/application/internal/rearm.ts
测试：tests/dive-wake-wiring.test.ts（新）/ tests/dive-rearm.test.ts（新）
      tests/agent-deliverer.test.ts / tests/dive-round-driver.test.ts / tests/dive-round-state.test.ts
```

- 回滚后行为与修前逐字一致（回到「人工门确认后不自动续跑」的旧状态——即本需求要修的那个状态）。
- 台账无需回滚：新增的只是 `comments` 里的留痕与 `dive.activation` 取值，旧代码读起来无害。
- 回滚后建议重跑 `pnpm build`（C-11）让 `dist/` 与新源码一致。

## 6. 兼容性风险

| 风险 | 评估 |
|------|------|
| 恢复入口误覆盖人的主动暂停 | 已由判别器排除：`clear_pause` 写 `phase=idle`、终态写 `phase=paused`，二者不满足 `disarmed+active`（负例用例覆盖） |
| 插件重启后 teardown 遗留的 disarmed 被自动恢复 | **期望行为**：重启不该永久打死自动链；已在 design 的「风险与边界」中明示 |
| 构造期抛错导致插件启动失败 | 仅当有人再次把非函数传进 `idFactory` 位时发生；这正是「响亮失败优于静默停摆」的取舍，且有守卫测试锁住 |
