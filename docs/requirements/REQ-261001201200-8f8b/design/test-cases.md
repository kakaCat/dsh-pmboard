# REQ-261001201200-8f8b 测试策略与用例 · 修前必红加修后全绿 serves: FR-1, FR-2, FR-3, FR-4

## 测试策略 serves: FR-2

- **契约守卫优先**：本次 bug 的本质是「组合根形状 不等于 类签名」，因此第一条测试不测行为、只测**装配形状**（真实组合根加真实 round driver），修前必红。
- **纯函数单测**：判别器 isRecoverableDisarm 是零 IO 纯函数，用真值表逐行覆盖（含负例）。
- **写入断言**：disarm comment 与 rearm 写入都断言台账，不依赖日志。
- **既有红转绿**：tests/agent-deliverer.test.ts 从旧 API 迁移（修前 9 failed 全为同一句 TypeError）。

## 规范条目引用（验收前必跑，来自项目知识层 kb kind=standard） serves: FR-1, FR-2

| 条目 | 命令 | 期望 |
|------|------|------|
| C-11 发版前必须构建（host 加 client） | `pnpm build` | 退出码 0，dist/ 与 lib/client.js 均有新产物 |
| C-12 改客户端源码必须重建 bundle | `pnpm build:client` | `[verify-client] OK`（本需求不改 client，作为回归确认） |
| C-14 提交前必须跑测试并与基线比对 | `npx vitest run` | 失败数不高于既有基线（当前 106 failed / 2807 passed），且本需求新增用例全绿 |

## 测试用例 serves: FR-1, FR-2, FR-3, FR-4

| 编号 | 覆盖 | 文件 / 做法 | 期望（修前 → 修后） |
|------|------|-------------|----------------------|
| T1 | FR-1, FR-2 | 新增 `tests/dive-wake-wiring.test.ts`：真实 createCaptureRuntime 加真实 createDiveRoundDriver，注入假 agent registry，触发一次 requestDrive | 修前：抛 TypeError（红）→ 修后：inbox 收到 1 条 source.kind=dive 消息（绿） |
| T2 | FR-1 | 同上，断言消息形状：role=user、source.kind=dive、带 requirementId/revision/round | 修后：四字段齐全且 round 等于 roundsInStage 加 1 |
| T3 | FR-1 | 新增构造契约用例：第二参传非函数（如 {plugin}） | 修后：构造期抛 TypeError（把装配错误暴露在启动期） |
| T4 | FR-1 | 新增缺省用例：createCaptureRuntime 不传 idFactory | 修后：仍能构造出非空 messageId（缺省工厂生效） |
| T5 | FR-2 | `tests/agent-deliverer.test.ts` 迁移到 createRoundMessage / deliverMessage，保留三态断言（在线 / 离线 / 无 followup / 抛错 / 服务不可得） | 修前 9 failed → 修后 9 passed |
| T6 | FR-4 | `tests/dive-round-state.test.ts` 增 isRecoverableDisarm 真值表：disarmed 加 active 为 true；armed 加 active、disarmed 加 idle、任意加 paused、undefined 为 false | 修后全绿 |
| T7 | FR-4 | 新增 `tests/dive-rearm.test.ts`：对 disarmed 加 active 需求调 rearmIfRecoverable | 修后：返回 true、activation=armed、新增 1 条恢复 comment、version 加 1；再次调用返回 false 且零写入 |
| T8 | FR-4 | 同上，对 disarmed 加 idle（人 clear_pause）与 paused（回合上限）调用 | 修后：返回 false、零写入、activation 不变 |
| T9 | FR-4 | 集成：onRequirementMoved 对 disarmed 加 active 需求 → 先重新武装再起轮 | 修后：inbox 收到 dive 消息且台账 activation=armed |
| T10 | FR-3 | 新增 disarm 留痕用例：制造一次投递失败（registry 返回 undefined 的 agent） | 修后：台账出现 `[Dive] 已解除武装（手动模式）：<reason>`；teardown 路径**不**写 |
| T11 | FR-1 | 类型红线：`npx tsc --noEmit -p tsconfig.json`，过滤 pm-capture-root | 修前：TS2554 Expected 3 arguments, but got 2（1 行）→ 修后：无输出 |

## 端到端验收（人工可复核） serves: FR-1

1. 在真实会话里确认一个人工门，**不发任何消息**，观察会话是否自行起一轮（UC-1）。
2. 统计 `~/.dsh/sessions` 中 source.kind=dive 的消息数：修前实测 0，修后应大于 0。
3. 读 `~/.dsh/dsh-reqboard.json`：目标需求的 `dive.roundsInStage` 应从 0 开始增长，且 `activation` 保持 armed。
4. 对一条历史 disarmed/active 需求触发一次推进，确认其被恢复（UC-4）。
