# REQ-261001213924-1441 测试策略与用例 · 修前必红 + 修后全绿 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

## 测试策略 serves: FR-7

+ **接缝优先**：本需求四处缺陷三处在装配与状态语义上，因此必须有一条**真实组合根**的端到端断言（不使用假投递端口），它修前必红、修后全绿；
+ **纯函数单测**：计数归零、上限判定、判定函数用真值表逐行覆盖（含负例）；
+ **写入断言**：activation 不被运行时改写，用"静态扫描 + 单测"双重锁；
+ **诊断可读**：心跳与订阅的失败路径必须能从诊断文件断言（不依赖日志）。

## 规范条目引用（验收前必跑，来自项目知识层 kb kind=standard） serves: FR-1, FR-7

| 条目 | 命令 | 期望 |
|------|------|------|
| C-11 发版前必须构建（host + client） | pnpm build | 退出码 0，dist/ 与 lib/client.js 均有新产物 |
| C-12 改客户端源码必须重建 bundle | pnpm build:client | [verify-client] OK（本需求不改 client，作为回归确认） |
| C-14 提交前必须跑测试并与基线比对 | npx vitest run | 失败数不高于既有基线（当前 97 failed / 2897 passed），且本需求新增用例全绿 |

## 测试用例 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

| 编号 | 覆盖 | 做法 | 期望（修前 → 修后） |
|------|------|------|----------------------|
| T1 | FR-1 | transitionRequirement 跨阶段：draft 用掉 1 轮 → 推进到 brainstorming | 修前 roundsInStage 保持 1（且 draft 上限 1 已 terminalBlock）→ 修后为 0 且可驱动 |
| T2 | FR-1 | 同阶段内重复调用 transitionRequirement（status 不变） | 不归零（计数不丢） |
| T3 | FR-2 | 构造达上限（roundsInStage = maxRounds）后 drive() | 修前 phase=paused 且此后 isDrivableRequirement=false → 修后 health=paused、activation 不变、人一动即恢复 |
| T4 | FR-2 | 达上限后走一次 recoverHealth（人确认推进/看板继续） | 恢复 healthy 且能再起轮 |
| T5 | FR-3 | 真实 agent 句柄 + 真实订阅装配：订阅落点断言 | 订阅注册在 agent.ctx（不是插件 ctx）；agent/disposed 后注销 |
| T6 | FR-3 | 拿不到 agent.ctx 的负例 | 响亮失败：warn + 诊断行 + 台账 comment（不静默） |
| T7 | FR-4 | wake-reconciler.tick()：armed+healthy+超时未动 | 返回 woken=[REQ]，投递一次，台账留 [Dive 心跳兜底] |
| T8 | FR-4 | attempts 连续 3 次失败 | health={paused, reason:wake-undeliverable} + comment；activation 不变 |
| T9 | FR-5 | 静态扫描：运行时模块对 activation 的赋值 | 只有 createRequirementDirect / ClearPause 出现赋值（修前后对比） |
| T10 | FR-5 | 投递失败后 | activation 保持 armed；health.reason 正确；comment 存在 |
| T11 | FR-5 | 人 clear_pause 后跑 tick() 与 requirement-moved | activation 仍 disarmed、零写入 |
| T12 | FR-6 | turn/end 载荷三种形状（对象/字符串/嵌套） | 两个读取者（断点写入器与 round-driver）结果一致 |
| T13 | FR-7 | 端到端：真实组合根（真 AgentDeliverer）+ 真 round driver | 一次 requirement-moved ⇒ inbox 恰 1 条 source.kind=dive，且 roundsInStage=1、lastWakeAt 更新 |
| T14 | FR-4 | 诊断面：订阅与驱动各早退分支 | 诊断文件出现对应 [dive-diag] 行（可 grep 断言） |

## 端到端验收（人工可复核） serves: FR-7

1. pnpm build 后重启宿主；
2. 在会话里确认一个人工门，**不发任何消息**，观察 60 秒；
3. 读台账：目标需求 `dive.roundsInStage` 增长、`lastWakeAt` 更新、`activation` 仍为 armed；
4. 读 `~/.dsh/state/reqboard-capture-diag.log`：出现 `[dive-diag] agent/created` / `agent/status` / `drive deliver` 行；
5. 反例：对一条 disarmed 需求调用 `tick()`，确认它**不动**且不新增 comment。

## 迁移与回滚验证 serves: FR-5

| 项 | 做法 | 期望 |
|----|------|------|
| 存量迁移 | 用一份含四种存量形态的台账样本跑迁移 | 四种形态各自落到矩阵指定结果，且逐条留痕 |
| 幂等 | 连跑两次迁移 | 第二次零写入 |
| 回滚 | 还原字段与订阅装配 | 行为回到修前（含已知静默停摆，因此仅在确认新实现有故障时回滚） |
