# REQ-260930231831-a8fa 复盘 · 重复交付判定（本需求零代码改动） serves: FR-1, FR-2, FR-3

> 结论：本需求（09-30 23:18 立项）的四张任务卡，其交付物**已由 10-01 的 REQ-261001201200-8f8b**
> （端到端闸门部分由 REQ-261001213924-1441）交付、验收（7/7 通过）并归档。本需求**不重复实施**，
> 按「重复交付」归档；本次唯一新增物就是本记录。

## 判定证据 serves: FR-1, FR-2, FR-3

| 本需求的卡 | 交付物现状（工作区实测） | 交付方 |
|------------|--------------------------|--------|
| t-dfaada 对齐投递器装配契约 | `createCaptureRuntime` 现为 `new AgentDeliverer(deps.getAgents, idFactory, deps.plugin)`（[pm-capture-root.ts:69](../../../../src/wiring/pm-capture-root.ts#L69)）；`AgentDeliverer` 构造期对非函数 `idFactory` **响亮抛错**（[AgentDeliverer.ts:36](../../../../src/adapters/AgentDeliverer.ts#L36)） | REQ-261001201200-8f8b FR-1 |
| t-220e7a 投递契约与「一次驱动即起轮」回归测试 | [agent-deliverer.test.ts](../../../../tests/agent-deliverer.test.ts) 已迁到 `createRoundMessage`/`deliverMessage`；[dive-wake-wiring.test.ts](../../../../tests/dive-wake-wiring.test.ts) 在场（10 项，含真实投递器 + 真实驱动起轮） | 同上 FR-1 / FR-2 |
| t-38e435 disarm 写台账留痕 | disarm 时追加 system comment（[round-driver.ts:146-154](../../../../src/application/dive/round-driver.ts#L146-L154)）；且语义更强：运行时故障只写 `driverHealth`，**不改写人的 activation 意图**；teardown 不写噪声 | 同上 FR-3 |
| t-1cb840 迁移说明与端到端验证 | [dive-wake-e2e.test.ts](../../../../tests/dive-wake-e2e.test.ts) 在场；REQ-261001201200-8f8b 验收单 7/7 通过并于 10-02 10:11 归档；10-02 10:08「Dive 迁移」把存量误停摆需求统一恢复为 `armed` | REQ-261001213924-1441 及 Dive 迁移 |

## 为什么不按本需求原计划重做 serves: FR-1

原 `decomposition.md` 的 t1 写的是「`idFactory` 兜底回落 `randomUUID`，构造期不抛」；
而落地版刻意做了相反取舍——**构造严格（响亮抛错）、投递宽容（`deliverMessage` 永不抛）**。
照原计划重做会把装配错误重新推回运行期，属于**回退一个已验收的设计**，因此停手不实施。

## 时间线 serves: FR-3

```
09-30 23:18  本需求立项（会话提出「点击通过后不自动唤醒」的疑问）
09-30 23:33  本需求计划获批 → 落库 4 张卡 → 进 implementing（此后本窗口未实施）
10-01        另一窗口立项 REQ-261001201200-8f8b《修复节点确认后不唤醒 agent》，并完成修复
10-02 10:08  Dive 迁移：存量误停摆需求统一恢复（含本需求）→ armed / healthy
10-02 10:11  REQ-261001201200-8f8b 验收 7/7 通过并归档
10-02 15:46  本需求复核：交付物齐备、测试全绿 → 判定为重复交付
```

## 复核命令与结果（2026-10-02 15:46） serves: FR-1, FR-2, FR-3

| 命令 | 结果 |
|------|------|
| `npx vitest run tests/dive-wake-wiring.test.ts tests/dive-wake-e2e.test.ts tests/agent-deliverer.test.ts tests/dive-round-driver.test.ts` | Test Files 4 passed / Tests **51 passed** / 0 failed |
| `tsc --noEmit -p tsconfig.json 2>&1 \| grep -E 'pm-capture-root\|agent-deliverer'` | **无输出**（原 TS2554「Expected 3 arguments, but got 2」已消失） |
| 残留两参调用扫描 `grep -rn "new AgentDeliverer(" src tests` | 仅剩三参与负例用例（无生产两参调用） |
| 本需求代码改动 | **0**（四张卡 `files_changed` 均为空；本记录是唯一新增文件） |

## 遗留与教训 serves: FR-3

| 项 | 说明 |
|----|------|
| 代码遗留 | 无。本需求不引入任何改动，也不回退既有实现 |
| 需求层遗留 | 同一根因在两个窗口各立一次（本需求 09-30、交付需求 10-01）；**同期多窗口对同一现象立项时缺少去重提示** |
| 流程教训 | 「为什么点击通过不唤醒」这类**已定位到单点根因**的疑问，立项后应尽快推进到实施；拖过夜就可能被另一窗口先交付，留下一条零交付的重复需求 |
| 诚实边界 | 本需求**没有**独立验证过 E2E（未跑真实会话）；E2E 结论引用自交付需求的验收记录与既有测试 |
