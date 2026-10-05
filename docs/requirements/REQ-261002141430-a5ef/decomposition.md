# REQ-261002141430-a5ef 拆分计划 · 弹框在途即停手 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

> **目标**：人工门禁弹框在途时自动链**停手等人**，作答到达**自动解除并续跑**，没有弹框时**一律不停**。
>
> **做法**：① 在途弹框登记表（内存、**同步**）管拦截；② 停手位复用 `dive.driverHealth`（**零新持久字段**）；
> ③ 三处准入判定（回合投递 / 实施链派卡 / 恢复越权）+ 四条恢复出口（作答、看板确认、显式取消、过期对账）。
>
> **不动**：`dive.activation`、`autoRun`、弹框通道与题干、落章/推进语义、写工具守卫名单、看板渲染；
> **无数据迁移**；回滚 = revert 本次提交（残留 `paused` 由既有 `recoverHealth` 清掉）。

```
改动面（8 源文件 + 1 测试文件，零 schema 变更，不新增工具、不新增持久字段）

  src/application/internal/awaiting-confirm.ts   ← 新增：enter / exit / dialogInFlightFor / 前缀常量
  src/adapters/PendingConfirmRegistry.ts         ← 扩一格在途登记（同步增删 + 按需求查）
  src/application/dive/round-driver.ts           ← 投回合前查一次（在途即 return，不 disarm）
  src/application/use-cases/AdvanceChain.ts      ← 派卡准入新停因 awaiting-confirm（不改 autoRun）
  src/application/use-cases/AskConfirm.ts        ← 投递前 enter，作答/取消/降级后 exit
  src/application/internal/confirm-settle.ts     ← 落章收敛点 exit（覆盖看板与文字证据通道）
  src/application/dive/gate-prompt.ts            ← 门框先 enter；降级不 enter；异常补 exit
  src/application/dive/wake-heartbeat.ts         ← 新增"停手对账"趟（过期/重启兜底恢复）
  src/application/internal/rearm.ts              ← 在途时拒绝 recoverHealth（不越权清停手位）
  tests/dialog-inflight-stop.test.ts             ← 新增：TC-1..TC-9（修前必红 + 反向自检）
```

## 1. 改动盘点 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 动作 | 路径 | 说明 |
|---|---|---|
| 新增 | `src/application/internal/awaiting-confirm.ts` | `AWAITING_CONFIRM_PREFIX='awaiting-confirm:'`；`enterAwaitingConfirm`（同步登记 + 异步写停手位 + 留痕）；`exitAwaitingConfirm`（幂等清位 + 留痕）；`dialogInFlightFor`（同步判据）；`isAwaitingConfirmStop`（台账侧谓词）；**永不抛**，台账写失败走 `alert` + 日志 |
| 修改 | `src/adapters/PendingConfirmRegistry.ts` | 实现 `DialogInFlightPort`（`enter`/`exit`/`inFlightFor`/`list`），与既有 ticket 表同实例；`inFlightFor` 为纯内存同步读（不得 await/IO） |
| 修改 | `src/application/dive/round-driver.ts` | `DiveRoundPorts` 新增可选 `dialogInFlight?`；`drive()` 在 `checkpoint()` 之后、`createRoundMessage` 之前判定，命中即 return（**不** `disarm`、**不**写健康位）；未注入时行为与改动前逐字一致 |
| 修改 | `src/application/use-cases/AdvanceChain.ts` | 单飞锁内、`autoRun` 判定之后插入判据 → `stopped='awaiting-confirm'`；**不**改 `autoRun`、**不**计 `noopStreak`（等人不是停滞，不得触发熔断） |
| 修改 | `src/application/use-cases/AskConfirm.ts` | 两条等待路径：投递前 `enter`，作答/`ASK_CANCELLED`/降级/中止后 `exit`；`fallback=board` 不 `enter`（INV-4） |
| 修改 | `src/application/internal/confirm-settle.ts` | 落章/推进收敛点 `exit(reason='board')`——一处覆盖弹框、看板、文字证据三条通道 |
| 修改 | `src/application/dive/gate-prompt.ts` | `prompt()` 先 `enter(kind='gate')` 再 `questions.ask`；作答/抛错后 `exit`；通道不可用降级**不 enter** |
| 修改 | `src/application/dive/wake-heartbeat.ts` | `tick()` 先跑"停手对账"趟：`isAwaitingConfirmStop` 且无在途 → 清停手位 + 留痕，结果进新增 `resumed` 桶；对账在既有唤醒趟**之前** |
| 修改 | `src/application/internal/rearm.ts` | `RearmDeps` 新增可选 `dialogInFlight?`；为真 → 返回 `false` + **零写入**（看板「继续」不越权） |
| 新增 | `tests/dialog-inflight-stop.test.ts` | TC-1…TC-9（见 design/test-cases.md），复用仓库既有 fake 端口写法，零真实 IO |
| 删除 | — | 无（不删任何公开能力、不删测试） |
| 迁移 | — | **无**：不新增持久字段、不 bump schemaVersion、不回填；重启后由心跳对账恢复 |

## 2. 任务表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 计划 key | 任务标题 | phase | side | 依赖 | 摘要 |
|---|---|---|---|---|---|
| t1 | 落地"在途弹框登记 + 停手位"契约 | implement | backend | — | **契约先行**：`awaiting-confirm` 模块与 `DialogInFlightPort`；同步登记、异步落库、幂等清除、失败响亮 |
| t2 | 回合投递先问"有人在等吗" | implement | backend | t1 | `DiveRoundPorts.dialogInFlight` + `drive()` 判定位；停手不写健康位、不 disarm |
| t3 | 实施链派卡先问"有人在等吗" | implement | backend | t1 | `AdvanceChain` 新停因 `awaiting-confirm`；不改 `autoRun`、不记停滞 |
| t4 | 三个弹框投递点接上登记与清除 | implement | backend | t1 | `AskConfirm`（两条等待路径）、`gate-prompt`（同拍拦截）、`confirm-settle`（落章收敛点）；降级不登记 |
| t5 | 补齐四条恢复出口与周期对账 | implement | backend | t1, t4 | 作答/取消/降级即时清位；`rearm` 在途拒绝越权；心跳对账处理过期与重启 |
| t6 | 回归用例：停手、续跑、反向自检 | test | backend | t2, t3, t4, t5 | TC-1…TC-9，含"无弹框不停"反向项与三条越权路径的反向自检 |
| t7 | 兼容、回滚与端到端核对 | test | backend | t5, t6 | 旧台账零影响、重启对账、回滚路径；类型/全量基线；人工端到端（构建后真跑一遍） |

**批次**：批次 1 = t1 → 批次 2 = **t2、t3、t4**（互不依赖，可并行）→ 批次 3 = t5 → 批次 4 = t6 → 批次 5 = t7。

## 3. 覆盖对照表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 需求条款 | 接收任务 | 落点说明 |
|---|---|---|
| FR-1 在途停手、无弹框不停 | t1, t2, t3, t6 | t1 给判据、t2 停投回合、t3 停派卡、t6 反向自检"无在途时逐字不变" |
| FR-2 停手位落台账、可观测、不改意图 | t1, t4, t7 | t1 写 driverHealth + 留痕、t4 三处投递点调用、t7 断言 activation/autoRun 未被改写 |
| FR-3 作答即自动解除并续跑 | t1, t4, t5, t6 | t1 幂等 exit、t4 覆盖三条确认通道、t5 立即可恢复、t6 断言"无需人再说继续" |
| FR-4 不被自动恢复抹掉、不静默停摆 | t5, t6, t7 | t5 改 rearm + 心跳对账、t6 两条反向用例、t7 重启后恢复实测 |
| FR-5 门框与起轮不并存、降级不登记 | t4, t6 | t4 先 enter 再弹框、降级分支不 enter、t6 同拍用例（TC-7/TC-8） |
| FR-6 回归用例与反向自检 | t6, t7 | t6 九条用例修前必红、t7 类型与全量基线比对 |

> 六条条款均有落点，**无「本轮不做」条款**（需求边界里排除了 capture 五问 / accept_sheet 的阻塞弹框，已在 design/architecture.md 的取舍表中写明理由）。

## 4. 卡内验收（可证伪） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 计划 key | 验收命令 | 通过条件 |
|---|---|---|
| t1 | `npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-9"`；`grep -n "awaiting-confirm:" src/application/internal/awaiting-confirm.ts` | ① 幂等与告警两条断言绿；② 前缀常量**只**在该模块定义（别处只能 import） |
| t2 | `npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-1"` | 在途时 `deliverMessage` 调用次数 = 0，且 `driverHealth.state !== 'paused'`、`roundsInStage` 不变 |
| t3 | `npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-2"` | `out.stopped === 'awaiting-confirm'`；`req.autoRun === true` 保持；`advance.noopStreak` 未增长 |
| t4 | `npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-7"`；`-t "TC-8"` | ① 同一 idle 拍：弹框 1 次、投递 0 次；② 通道不可用：在途表空且无 `awaiting-confirm:` 前缀 |
| t5 | `npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-5"`；`-t "TC-6"` | ① 在途时 `recoverHealth` 返回 `false` 且零写入；解除后返回 `true`；② 心跳对账把"停手但无在途"恢复并进 `resumed` |
| t6 | `npx vitest run tests/dialog-inflight-stop.test.ts` | 全部用例绿，其中 TC-1/2/3/5/6/7/9 在改动前**必红**（用例内含反向自检）；TC-4 为"无在途时投递/派卡与基线一致"的反向项 |
| t7 | `pnpm typecheck 2>&1 \| grep -E "awaiting-confirm\|round-driver\|rearm\|gate-prompt\|wake-heartbeat"`；`pnpm test`；`pnpm build`；人工端到端 | ① 无输出（改动文件零类型错误，C-15）；② 失败数 ≤ 基线 106 且新增用例全绿（C-14）；③ 退出码 0（C-11）；④ armed 需求提交产物后不点弹框：不再起新轮、台账可见停手原因；点确认后**无需额外输入**即续跑 |

## 5. 验收与证据 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 需求断言 | 证据形态 | 由谁产出 |
|---|---|---|
| A1 在途即停手（回合 + 派卡两条链） | vitest 输出：投递次数 = 0、`stopped='awaiting-confirm'` | t2、t3、t6 |
| A2 停手位可观测且不改人的意图 | 台账断言：`driverHealth.reason` 前缀 + 恰好多一条 comment；`activation`/`autoRun` 未变 | t1、t4、t7 |
| A3 作答即自动恢复 | vitest：作答后前缀消失、续跑被触发一次；否定答复同样恢复 | t5、t6 |
| A4 不被自动恢复抹掉 | TC-5（rearm 拒绝且零写入）+ TC-6（对账恢复）两条反向用例输出 | t5、t6 |
| A5 门框同拍不并存、降级不登记 | TC-7、TC-8 输出 | t4、t6 |
| A6 全量不退化 / 类型零新增 / 构建通过 | `pnpm test` 与基线 106 比对、`pnpm typecheck` 过滤空输出、`pnpm build` 退出码 0 | t7 |
| A7 端到端人工复核 | 构建后重载插件，在 armed 需求上真跑一轮：停手 → 弹框确认 → 自动续跑的过程记录 | t7 |

## 6. 风险与回滚 `serves: FR-1, FR-4, FR-5`

| 风险 | 处置 |
|---|---|
| 登记与投递之间的 TOCTOU（登记后弹框投递失败） | 失败/降级分支必须 `exit`；TC-8 断言"失败后无残留停手位" |
| 同拍拦截依赖**同步**登记，若实现里混入 await 就失效 | t1 的 `inFlightFor` 明确"纯内存同步读"；TC-7 直接压同一拍 |
| 停手位与在途表不一致（重启 / 崩溃） | 心跳对账趟兜底：停了但没人等 → 恢复；TC-6 覆盖 |
| 误伤非门禁流程（把正常自动链停住） | TC-4 为**反向自检**：无在途时投递/派卡与基线逐字一致；`dialogInFlight` 端口缺省时行为不变 |
| 阻塞弹框（capture 五问 / accept_sheet）未纳入判据 | 按需求边界 ⑤ 本轮不做；若 t7 端到端实测发现阻塞期 agent 会转 idle（`readyToDrive` 成立），当场升级并回补登记 |
| 需要回滚 | `git revert` 单次提交；无迁移 ⇒ 无补偿脚本；残留 `driverHealth=paused(awaiting-confirm:*)` 由看板「继续」或阶段切换清除 |
