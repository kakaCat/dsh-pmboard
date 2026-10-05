# REQ-261001213924-1441 拆分计划 · 状态收敛 + 计数归零 + 订阅归位 + 心跳兜底 + 唯一门禁 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 目标 + 做法：把「人工门确认后要人敲一句才动」这件事从**四个独立缺陷**上一起拆掉——
> ①状态收敛（activation 只管人的意图，新增 driverHealth 管运行时健康）；②回合计数改本阶段语义、达上限可恢复；
> ③agent 事件订阅按宿主规范挂到 agent.ctx；④新增不依赖事件的心跳对账器 + 唤醒链诊断；
> 并用一条**真实组合根**的端到端断言当唯一 CI 门禁。不动 round driver 本体，不动五道人工门。

```
改动面（约 12 源文件 + 6 测试文件，含 1 个新模块）

  src/shared/protocol.ts                       ← DiveState：activation 语义收窄 + driverHealth/lastWakeAt
  src/application/internal/token-usage.ts      ← transitionRequirement：跨阶段 roundsInStage 归零
  src/application/dive/round-state.ts          ← isDrivableRequirement 改判健康位；判定函数
  src/application/dive/round-driver.ts         ← terminalBlock/disarm 改写 health；turnEndOutcome；诊断
  src/application/dive/ReqboardDiveManager.ts  ← agent/created → agent.ctx 订阅装配
  src/application/dive/round-subscriptions.ts  ← 拆成 root 订阅 + per-agent 订阅
  src/application/dive/wake-reconciler.ts      ← 新增：心跳对账器
  src/application/internal/rearm.ts            ← recoverHealth（原 rearm 的语义升级）
  src/http/routers/requirements.ts             ← 看板「继续」接 recoverHealth
  src/index.ts / src/wiring/pm-capture-root.ts ← 装配 reconciler（定时器 + disposer）
  tests/                                        ← 端到端门禁 + 既有单测扩展
```

## 1. 改动盘点 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 动作 | 路径 | 说明 |
|------|------|------|
| 修改 | src/shared/protocol.ts | DiveState：activation 语义收窄为「人的意图」；新增 driverHealth / lastWakeAt；phase 降级为读侧兼容字段 |
| 修改 | src/application/internal/token-usage.ts | transitionRequirement 内：status 变化时 roundsInStage=0、health.attempts=0 |
| 修改 | src/application/dive/round-state.ts | isDrivableRequirement 改判 activation+driverHealth；新增健康位断言辅助 |
| 修改 | src/application/dive/round-driver.ts | terminalBlock 与 disarm 改写 driverHealth（不再写 activation/phase 终态）；turn/end 改用 turnEndOutcome；各早退分支加 [dive-diag] |
| 修改 | src/application/dive/ReqboardDiveManager.ts | 订阅 agent/created；对每个 agent 在其 agent.ctx 注册六类事件；按 agent 注销 |
| 修改 | src/application/dive/round-subscriptions.ts | 拆成 root 订阅（requirement-moved + agent/created）与 per-agent 订阅两组 |
| 新增 | src/application/dive/wake-reconciler.ts | 周期 + 启动扫描；armed+healthy+超时未动 → 兜底直投；连续 3 次失败 → paused + 告警 |
| 修改 | src/application/internal/rearm.ts | 语义升级为 recoverHealth（清 paused / attempts 归零 / 留痕），保留存量恢复分支 |
| 修改 | src/http/routers/requirements.ts | 看板「继续」与 autorun(on) 走 recoverHealth（返回体不新增键） |
| 修改 | src/index.ts、src/wiring/pm-capture-root.ts | 装配 wake-reconciler（定时器 unref + disposer 清理） |
| 新增 | tests/dive-wake-e2e.test.ts | 真实组合根端到端断言（本需求唯一 CI 门禁） |
| 修改 | tests/dive-round-state.test.ts、tests/dive-round-driver.test.ts、tests/dive-rearm.test.ts、tests/dive-wake-wiring.test.ts | 判定真值表、上限恢复、健康位写入、订阅落点 |
| 删除 | — | 无（不删公开能力；disarm 保留为「写健康位」的实现，不再写 activation） |

## 2. 任务表 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 计划 key | 任务标题 | phase | side | 依赖 | 摘要 |
|----------|----------|-------|------|------|------|
| t1 | 定死状态契约：人的意图与运行时健康分家 | implement | backend | — | DiveState 改造 + 判定函数；契约先行 |
| t2 | 回合计数改「本阶段」：阶段推进就归零 | implement | backend | t1 | transitionRequirement 归零 + 不变量 |
| t3 | 达上限不再锁死：人一动就能继续 | implement | backend | t1 | terminalBlock 改写 health + 恢复路径 |
| t4 | 把 agent 事件订阅搬到 agent 作用域上 | implement | backend | t1 | agent/created → agent.ctx；注销与响亮失败 |
| t5 | 加心跳兜底与唤醒链诊断：事件丢了也照样叫醒 | implement | backend | t1 | wake-reconciler + [dive-diag] |
| t6 | 回合收尾只认一个解析器 | implement | backend | t1 | turn/end 统一走 turnEndOutcome |
| t7 | 一条真端到端断言当门禁（修前必红） | test | backend | t2, t3, t4, t5 | 真实组合根 + 真投递器 + 真 driver |
| t8 | 存量台账分类迁移与兼容回滚 | implement | backend | t1, t2, t3 | 五种存量形态 + 幂等 + 回滚验证 |

**批次**：批次 1 = t1（契约先行）→ 批次 2 = t2、t3、t4、t5、t6（互不依赖，可并行）→ 批次 3 = t7、t8。

## 3. 覆盖对照表 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 需求条款 | 接收任务 | 落点说明 |
|----------|----------|----------|
| FR-1 回合计数按阶段重置 | t2、t7 | 归零写入 + 端到端断言 roundsInStage 增长 |
| FR-2 达上限不得终态 | t3、t7、t8 | health 改写 + 恢复路径 + 存量 paused 迁移 |
| FR-3 唤醒链可达性 | t4、t7 | agent.ctx 订阅 + 端到端投递 |
| FR-4 停摆可见 + 心跳 + 诊断 | t5、t7 | reconciler + 诊断行 + 断言 |
| FR-5 开关收敛（意图/健康） | t1、t8 | 数据契约 + 迁移矩阵 |
| FR-6 turn/end 单一解析 | t6 | 统一入口 + 形状单测 |
| FR-7 端到端契约断言 | t7 | 唯一的 CI 门禁，修前必红 |

> 七条条款均有落点，无「本轮不做」条款。

## 4. 卡内验收（可证伪） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 计划 key | 验收命令 | 通过条件 |
|----------|----------|----------|
| t1 | npx vitest run tests/dive-round-state.test.ts；npx tsc --noEmit -p tsconfig.json 过滤 round-state | 判定真值表全绿（armed+healthy 可驱动；armed+paused / disarmed+healthy 不可）；类型无新增错误 |
| t2 | npx vitest run tests/dive-round-driver.test.ts | 新增用例断言：跨阶段后 roundsInStage===0；同阶段重复转换不归零 |
| t3 | npx vitest run tests/dive-round-driver.test.ts | 达上限后 activation 不变、driverHealth.state=paused 且 reason 含 round-limit；调用 recoverHealth 后重新可驱动 |
| t4 | npx vitest run tests/dive-wake-wiring.test.ts | 断言订阅注册在 agent.ctx（不是插件 ctx）、agent/disposed 后注销；拿不到 agent.ctx 时 warn+诊断+comment 三者齐备 |
| t5 | npx vitest run tests/dive-rearm.test.ts + 诊断断言 | tick() 对 armed+healthy+超时需求返回 woken 含该需求；attempts 连续 3 次失败 → health=paused 且 activation 不变；诊断文件出现 [dive-diag] reconcile tick 行 |
| t6 | npx vitest run tests/dive-round-driver.test.ts | 三种 turn/end 形状（对象/字符串/嵌套）下，round-driver 与断点写入器结论一致 |
| t7 | npx vitest run tests/dive-wake-e2e.test.ts | 一次 requirement-moved ⇒ inbox 恰 1 条 source.kind=dive，且 roundsInStage=1、lastWakeAt 更新；该用例在修前必红（先在 HEAD 上跑一次留证） |
| t8 | npx vitest run tests/dive-migration.test.ts | 五种存量形态各自落到矩阵结果并留痕；连跑两次第二次零写入；回滚路径可复现 |
| 全体 | pnpm build；npx vitest run | pnpm build 退出码 0；全量失败数不高于基线（97 failed / 2897 passed） |

## 5. 验收与证据 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 需求断言 | 证据形态 | 由谁产出 |
|----------|----------|----------|
| A1 回合计数按阶段 | 单测输出 + 迁移后台账样本 | t2、t8 |
| A2 达上限可恢复 | 单测输出 + 台账 health 字段 | t3 |
| A3 订阅可达 | 订阅落点断言 + 诊断文件 [dive-diag] agent/status 行 | t4、t5 |
| A4 停摆可见 | 台账 comment 原文 + 看板状态字段 | t5 |
| A5 开关收敛 | 静态扫描（activation 赋值点）+ 单测 | t1、t8 |
| A6 载荷统一 | 单测输出 | t6 |
| A7 端到端 | 真实会话：确认人工门后不发消息 60s，台账 roundsInStage 增长 + 诊断行；**修前必红证据**一并留存 | t7 |

## 6. 边界与不变量（本次不做） serves: FR-1, FR-2, FR-3, FR-5

| 项 | 约定 |
|----|------|
| round driver 本体 | 不改预留/准入/并发栅栏/回合上限的存在本身（只改达上限后的语义） |
| 五道人工门 | 强度不变；本需求只让「人点头之后」真的自动继续 |
| autoRun / advance.pausedReason | 本需求不合并这两个字段（只明确归属），避免数据模型改动过大；合并另立需求 |
| 工具面 / HTTP 形状 | 不新增工具、不改返回体形状 |
| 回滚 | 新增字段对旧代码无害；行为回滚 = 还原订阅装配与 reconciler（会回到已知的静默停摆，故仅在确认新实现有故障时回滚） |

## 7. 总览 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 项 | 内容 |
|----|------|
| 卡数 | 8（6 实现 + 2 测试/迁移），批次 1/2/3 |
| 契约先行 | t1 定死 DiveState 与判定函数，其余全部 depends_on 它 |
| 关键改动 | 状态收敛（意图/健康分家）、计数归零、上限可恢复、订阅搬到 agent.ctx、心跳兜底 |
| 唯一门禁 | t7 真端到端断言（修前必红） |
| 零变更 | round driver 本体、五道人工门、工具面、HTTP 形状 |

## 下一步

implementing —— 用 reqboard_ask_confirm(target=plan) 请人批准；未获批准不得落库任务卡。
