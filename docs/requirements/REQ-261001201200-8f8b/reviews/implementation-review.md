# REQ-261001201200-8f8b 实施评审报告（自评审 · 提请人工复核）

> 评审人：本窗口 agent（自评审）。**结论仅供人工参考，验收由人裁决**。

## 1. 计划 vs 实际：逐卡对账

| 卡 | 计划改动 | 实际 | 偏差 |
|----|----------|------|------|
| t1 装配契约 | pm-capture-root / AgentDeliverer / index.ts | 同左 | 无 |
| t2 守卫测试 | 新增 dive-wake-wiring + 迁移 agent-deliverer | 同左，另**新增生产装配守卫**（见 §2） | **增**（同症状第二处断点） |
| t3 disarm 留痕 | round-driver disarm() 加 comment | 同左 | 无 |
| t4 误停摆恢复 | 判别器 + 恢复入口 + 两调用点 | 同左 | 无 |
| t5 迁移与验证 | 基线比对 + 证据落盘 | 同左 | 无（E2E 未跑，如实标注） |

## 2. 一处**范围外但同源**的发现（必须让人看见）

实施 t4 的集成用例时发现：`src/index.ts` 的 `diveRoundPorts` 字面量**根本没有接 `delivery`**。
这意味着即使修好「投递器构造参数错位」，真实组合根的 `drive()` 仍会在第一步
`ports.delivery.createRoundMessage(...)` 抛 `Cannot read properties of undefined`，被吞后再 disarm ——
**症状与用户报的完全一样**。

- 判定：这是**同一症状的第二处断点**，属 FR-1「修正投递器装配」的意图范围（该卡的文件清单本就包含 `src/index.ts`），
  但 t1 当时**已关闭**，因此它严格来说游走在「照卡执行」的边界上。
- 处置：**修了，并且加了一条独立守卫**（源码级断言 `diveRoundPorts` 含 `delivery` 与其余必需端口键），
  同时在 t4 的完工记录里**显式写明**这是范围外发现。**请人工在验收时确认这个处置可以接受**；若认为应新立需求补流程，请退回。
- 为什么守卫是源码级而不是类型级：`tsc` 早就能报（TS2741），但仓库有 ~192 条既有类型错误，这条信号被淹没；
  源码级断言至少是**可读的、会变红的**。

## 3. 需求条款覆盖自检

| 条款 | 落点 | 证据 |
|------|------|------|
| FR-1 修正投递器装配 | pm-capture-root 三参 + idFactory 缺省 + 构造期校验；index.ts 补 delivery | tsc 过滤无输出；tsx 复现非空 messageId；守卫 7 passed |
| FR-2 锁住组合根形状=类签名 | dive-wake-wiring（真实组合根+真实驱动器）；旧单测迁移 | 修前 3 failed → 修后 7 passed；agent-deliverer 10 passed |
| FR-3 disarm 不再静默 | round-driver disarm() 写 system comment（teardown 除外） | dive-round-driver 17 passed（含写入/幂等/teardown 三例） |
| FR-4 存量误停摆可恢复 | isRecoverableDisarm + rearmIfRecoverable + 两调用点 | dive-round-state 15 + dive-rearm 8 passed（含三类负例） |

## 4. 设计约束自检（「不做」的三条是否守住）

| 约束 | 是否守住 | 依据 |
|------|----------|------|
| 不改「H4=skip、唤醒托管给 Dive」 | ✅ | 未触碰 gate 链与 h4-resume |
| 不改回合语义（预留/准入/上限/驱动点） | ✅ | round-state 与 round-driver 的既有判定逐字未动，只加判别器与恢复写入口 |
| 不做存量批量重新武装 | ✅ | 恢复只在事件触发；无批量脚本、无数据回填 |

## 5. 工程质量与风险

- **失败响亮**：构造期对非法 `idFactory` 抛错（刻意），`disarm` 留痕（可见），未跑项标注未跑（不粉饰）。
- **幂等**：恢复写入条件判定放在 mutate 内，二次调用零写入（有用例）。
- **人的决定优先**：`clear_pause`（phase=idle）与终态（paused）永不被自动改写（有三条负例）。
- **遗留**：历史同缺陷需求 `REQ-260930231831-a8fa`（4 卡全 todo）与新需求重叠，需人裁定复用或废弃；
  端到端一条未跑，需插件重载后人工确认。

## 6. 评审结论

**建议通过验收，但请人明确确认 §2 的范围外修复与 §5 的两项遗留。** 本报告不代替人工裁决。
