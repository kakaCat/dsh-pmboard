---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 测试用例设计（REQ-261007100513-6749）

> 命令口径：单文件 `npx vitest run tests/<file>`；全量 `pnpm test` 后比对 `pnpm baseline:check`；
> 类型 `pnpm typecheck`。新增测试文件不得改变既有基线结果（C-14）。

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

### TC-1 头部段在同阶段内逐字节稳定 `serves: FR-1`

- **前置**：窗口绑定需求 REQ-x（brainstorming）。
- **动作**：用同一份 `RequirementFacts` + `tasks` 快照调用头部段组装函数两次；随后把需求 `status` 改成 `design`、任务快照改成「另一张卡在制」，再各调一次。
- **断言**：前两次输出**逐字节相等**；后两次输出**仍等于**第一次（状态与当前任务不在头部）。
- **命令**：`npx vitest run tests/capture-section-stability.test.ts -t "头部段稳定"`

### TC-2 状态/任务/阶段纪律只在变化时注入，且不新起回合 `serves: FR-2`

- **前置**：fake agent（含 `inbox.prepend` 记录器）已注册到 `agents.get(windowKey)`。
- **动作**：连续两次用**相同**易变文本组装并投递；再改一个字节后组装投递一次。
- **断言**：`prepend` 被调用 **2 次**（相同文本只投 1 次）；投递走 `next-step`；投递路径**不含** `followup`（以 fake 上是否存在 followup 调用来断言）；`InjectionLogPort.record` 每次投递各 1 条且 `delivered=true`。
- **命令**：`npx vitest run tests/volatile-notice.test.ts -t "去重与投递"`

### TC-3 两态来回不翻版 `serves: FR-3`

- **动作**：构造「有任务 → 无任务 → 有任务」的短时序列（时间戳间隔 < 阈值）。
- **断言**：投递次数 ≤ 2；同一内容不出现两次投递；最终态一定是最后那次的文本。
- **命令**：`npx vitest run tests/volatile-notice.test.ts -t "去抖"`

### TC-4 批量推进：逐项结果 + 父子卡摘要 `serves: FR-4`

- **动作**：一次调用推进 3 张合法子卡；再构造「2 张合法 + 1 张非法边」；再构造「同一卡重复出现 2 次」；最后用旧的 `{task_id, to}` 单卡形态调一次。
- **断言**：
  - 3 张全成功时回执含 3 条逐项结果，且含父卡与其子卡链状态摘要；
  - 混合批：2 张落账成功、1 张返回错误码与原因，台账**未回滚**；
  - 重复项被拒并给出原因；
  - 旧单卡形态返回体与改造前一致（既有测试全绿）。
- **命令**：`npx vitest run tests/task-move-batch.test.ts`

### TC-5 节流拒绝给出剩余时间与可做之事 `serves: FR-5`

- **动作**：注入 `doneThrottleMs`，在窗口内连续两次尝试关闭**两张父卡/存量卡**。
- **断言**：第二次回执含 `throttleRemainingMs > 0` 与「还要等多久 + 可做之事」文案；子卡走新口径仍豁免节流（回归断言）。
- **命令**：`npx vitest run tests/done-throttle-guidance.test.ts`

### TC-6 子卡预算软门禁 `serves: FR-6`

- **动作**：把某卡预算设为 3（可覆盖字段），驱动 4 次请求；随后不放行再驱动 1 次；然后放行一次再驱动；最后重复放行一次。
- **断言**：
  - 第 3 次请求后**不再发起新请求**，且卡评论出现「预算到顶汇报」（先停后报：断言停止时刻早于汇报时刻）；
  - 未放行时第 4 次请求不成立；
  - 放行后计数窗口重置并可继续；
  - 重复放行不产生第二个窗口（幂等）；
  - 计数不可得时卡评论标注「计数不可得」，不按 0 处理。
- **命令**：`npx vitest run tests/subtask-budget.test.ts`

### TC-7 注入通道不可得的降级 `serves: FR-2`

- **动作**：让 `agents.get(windowKey)` 返回 undefined（等价「窗口不在线」），触发行易变文本变化。
- **断言**：退回头部注入且头部文本含该易变内容；有告警留痕（`InjectionLogPort.record` 的 `origin='system-prompt'`、`delivered=true`，并另有一条说明降级的诊断记录）；**不静默丢弃**。
- **命令**：`npx vitest run tests/volatile-notice.test.ts -t "降级"`

### TC-8 同口径成本度量可跑 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **动作**：`pnpm cost:report --req REQ-261007100513-6749`（以及任意一条已完成需求的会话）。
- **断言**：输出含「请求数 / 未命中输入 / 命中缓存 / 输出 / 墙钟」与「缓存失效点列表（`cacheReadTokens < 20000 且 inputTokens > 40000` 的请求 + 其前 60 秒内是否有 `system/message`）」；对一条**无嵌套子代理**的会话，统计值与逐条求和一致。
- **命令**：`pnpm cost:report --req REQ-261007100513-6749`

## 测试覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 条款 | 用例 | 覆盖方式 |
|---|---|---|
| FR-1 | TC-1 | 纯函数断言（逐字节相等） |
| FR-2 | TC-2, TC-7 | fake agent + 投递记录 + 降级路径 |
| FR-3 | TC-3 | 去抖序列断言 |
| FR-4 | TC-4 | 台账落库 + 逐项结果 + 兼容回归 |
| FR-5 | TC-5 | 拒绝文案 + 子卡豁免回归 |
| FR-6 | TC-6 | 计数窗口 + 停止/汇报时序 + 幂等 |
| 整体 | TC-8 | 端到端度量脚本（同口径可复现） |

- 门禁回归：`pnpm test` + `pnpm baseline:check`（新增失败数 = 0）、`pnpm typecheck`（零错）、`pnpm build`（退出码 0）。
- 不新增依赖、不改既有测试断言语义（只增不改）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 头部稳定性怎么测 | 端到端跑真实会话再人工看日志 | 纯函数逐字节断言 | 真实会话不可复现且昂贵；头部是纯文本编排，函数级断言就能证伪 |
| 去重怎么测 | 只测「投递次数」 | 投递次数 + 内容哈希 + 最终态一致性 | 只数次数会漏「内容变了却被吞」这类更严重的错 |
| FR-6 的时序怎么测 | 只断言「有汇报」 | 断言「停止时刻早于汇报时刻」 | 「先汇报后继续跑」是这一条款最容易走样的形态 |
| 成本度量 | 靠人肉解压 session 日志 | 落一个 `pnpm cost:report` 脚本 | 验收要求同口径前后对比；一次性人工统计无法回归 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **可证伪优先**：每个条款都落在一条能跑的命令上，不写形容词（本仓 `readabilityHints` 与验收门禁的既有口径）。
- **回归护栏**：既有 `capture.test.ts` / `stage-prompts.test.ts` / `acceptance-criteria.test.ts` 的断言语义**逐字不变**（文本搬迁不改变既有语义）。
- **度量脚本复用诊断口径**：与 `docs/reviews/REQ-261006130057-7a43-token-cost-diagnosis.md` 完全同一套统计（按 `createdAt` 过滤自身请求、区分未命中/命中缓存），保证改造前后可比。
