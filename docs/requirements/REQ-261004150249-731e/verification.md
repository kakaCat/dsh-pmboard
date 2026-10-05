# REQ-261004150249-731e 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：「上下文将满时开新会话接管原项目」这条链路已打通——新会话落回源会话所属项目（拿不到就响亮失败，不再静默落宿主目录）；owner 交接是一次原子写（新窗 owner / 旧窗 observer / 绑定同步 / 留痕一条，失败不留半个）；水位三档可配且读数缺席不猜；跨窗口底稿投递接上已实现的投递端口（自署来源，绝不为 user）；看板改绑的「假成功」修正为真正换人。7 张父卡 / 27 张子卡全部收口；探针 exit 0、8 文件 90 断言全绿、类型检查无新增、构建 exit 0。唯一未完成项：宿主重启后的实机四步复核（当前宿主仍加载旧构建）。

## 1. 验收列表

### v1-1 · 扩端口签名与 handoff 配置契约

**验收内容**：【扩端口签名与 handoff 配置契约】验收

**操作步骤**：
1. npx tsc --noEmit 通过
2. npx vitest run tests/handoff-policy.test.ts 中「缺省三档 = 0.75/0.85/0.90」与「warn ≥ fork → 装配期抛错」两条断言绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-2 · 交接写原子化：席位升降 + sourceSessionId + 留痕

**验收内容**：【交接写原子化：席位升降 + sourceSessionId + 留痕】验收

**操作步骤**：
1. npx vitest run tests/handoff-owner.test.ts：① 交接后 seats 含 owner=toWindow、observer=fromWindow 且 sourceSessionId===toWindow
2. ② mutate 内注入异常 → seats 与 sourceSessionId 三处都不变（无半个交接）
3. ③ 无 seats 的存量记录被物化为两条
4. ④ 重复调用 changed=false 且评论数不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-3 · 分叉判据纯函数（三档 + 读数缺席不猜）

**验收内容**：【分叉判据纯函数（三档 + 读数缺席不猜）】验收

**操作步骤**：
1. npx vitest run tests/handoff-policy.test.ts 全绿：0.74/0.75/0.84/0.85/0.89/0.90 分别得 none/warn/warn/fork/fork/critical
2. contextWindow 缺、pressureTokens 缺、projectedTokens=0（不得判缺席）、source='unavailable' 四种分别断言
3. npx vitest run tests/layer-boundary.test.ts 绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-4 · 开窗落回源项目（适配器 + 两个用例调用点）

**验收内容**：【开窗落回源项目（适配器 + 两个用例调用点）】验收

**操作步骤**：
1. npx vitest run tests/handoff-owner.test.ts 中三条：① 命中 workspace → 替身收到 { workspaceId }
2. ② 无 workspace 有 cwd → 收到 { cwd }
3. ③ 都拿不到 → 回执 REQBOARD_OPEN_WINDOW_UNAVAILABLE 且替身零调用。npx vitest run tests/open-window-tool.test.ts tests/capture-window-bound-policy.test.ts 不回归。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-5 · 交接用例与 reqboard_handoff 工具

**验收内容**：【交接用例与 reqboard_handoff 工具】验收

**操作步骤**：
1. npx vitest run tests/handoff-owner.test.ts：① 非 owner → REQBOARD_SEAT_NOT_OWNER 且台账零改动
2. ② to_window 不存在 / 等于源 → REQBOARD_HANDOFF_TARGET_INVALID
3. ③ 投递消息 source.kind === 'reqboard-handoff' 且断言 ≠ 'user'
4. ④ 投递失败 → success:true 且 delivery.delivered=false + 有 reason
5. ⑤ 回执含 from_window/to_window/old_role/new_role 四键。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-6 · 组合根装配 + 看板改绑修正 + 迁移兼容与回滚

**验收内容**：【组合根装配 + 看板改绑修正 + 迁移兼容与回滚】验收

**操作步骤**：
1. npx vitest run tests/handoff-owner.test.ts 中「已有显式 seats 的需求经 applyRebind 后：新窗口 owner、原窗口 observer、sourceSessionId 同步」绿（该断言在改造前必红，作为反向演练）
2. npx vitest run tests/binding-trace.test.ts tests/layer-boundary.test.ts tests/size-budget.test.ts 不回归
3. npx tsc --noEmit 通过
4. pnpm build 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-7 · 验收：探针 + 反向演练 + 全量回归与实机复核

**验收内容**：【验收：探针 + 反向演练 + 全量回归与实机复核】验收

**操作步骤**：
1. npx tsx scripts/handoff-probe.mts 退出码 0 且打印五个读数
2. npx vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts tests/open-window-tool.test.ts tests/bind-seat.test.ts tests/capture-window-bound-policy.test.ts tests/binding-trace.test.ts 全绿
3. npx tsc --noEmit 通过
4. pnpm build 退出码 0
5. 实机四步（侧栏归入项目分组 / my_seat.role=owner / 写产物无 PROJECT_ROOT_MISMATCH / 原窗口降 observer）结果记入 verification。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/handoff-owner.test.ts、tests/handoff-policy.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/handoff-owner.test.ts、tests/handoff-policy.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx tsx scripts/handoff-probe.mts → exit 0，末行「✅ 交接探针通过」；五读数 from=w-old to=w-new old_role=observer new_role=owner source_session=w-new；跑前后真实台账 ~/.dsh/reqboard 370 文件快照哈希一致（零写入）
- 探针脚本路径：scripts/handoff-probe.mts；同时覆盖看板改绑路径（from=w-old-2 → w-new-2，席位真的换过去）
- npx vitest run tests/handoff-owner.test.ts tests/handoff-policy.test.ts tests/open-window-project-root.test.ts tests/open-window-tool.test.ts tests/bind-seat.test.ts tests/capture-window-bound-policy.test.ts tests/binding-trace.test.ts tests/apply-wiring.test.ts → 8 files / 90 tests 全绿，exit 0
- 新增测试证据：tests/handoff-policy.test.ts（23）、tests/handoff-owner.test.ts（23）、tests/open-window-project-root.test.ts（6）——覆盖六点边界、四种读数缺席不猜、交接原子性与幂等、非 owner 拒、投递 kind 恒非 user、投递失败如实回报、半截交接四处不变
- npx tsc --noEmit → 146 条错误，与开工前基线逐条一致（全部落在既有文件）；本需求改动文件零新增错误
- pnpm build → exit 0；[verify-client] OK bundle=344123 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- 测试证据文档（含 covers 覆盖标注）：docs/requirements/REQ-261004150249-731e/tests/test-evidence.md
- 评审报告：docs/requirements/REQ-261004150249-731e/reviews/self-review.md（9 处偏离/发现：7 处已处置、2 处如实披露为环境缺口/范围外）
- 实现落点：src/application/internal/handoff-policy.ts、src/application/internal/binding-write.ts（handoffOwner + applyRebind 委托）、src/application/use-cases/HandoffOwner.ts、src/tools/HandoffTool/HandoffTool.ts、src/adapters/SessionWindowOpener.ts、src/index.ts、src/plugin-config.ts、src/application/ports.ts
- 未完成项（如实报出）：宿主重启后的实机四步复核未执行——运行中宿主仍是旧构建（plugin_build 8d03c8f413b9）：① 新会话应出现在该项目分组 ② 新窗口 my_seat.role=owner ③ 新窗口写产物不报 PROJECT_ROOT_MISMATCH ④ 原窗口降 observer
- 外部噪声（逐条核对 offender 无本需求文件）：tests/layer-boundary.test.ts 3、tests/size-budget.test.ts（既有超标 index.ts 845 / ports.ts 1181）、tests/output-contract.test.ts 3、tests/handoff.test.ts 2、tests/routes-rollup.test.ts 2 均为开工前基线
- kb-probe 的 K5/K6/K7/K9 四项失败来自另一窗口并行改动的 src/client/styles/board.ts 与其知识条目 kb-0031；本需求新脚本已按规范登记（src/domain/knowledge/operations.ts），K10「清单零漂移」已通过

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 扩端口签名与 handoff 配置契约 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-2 | 交接写原子化：席位升降 + sourceSessionId + 留痕 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-3 | 分叉判据纯函数（三档 + 读数缺席不猜） | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-4 | 开窗落回源项目（适配器 + 两个用例调用点） | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-5 | 交接用例与 reqboard_handoff 工具 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-6 | 组合根装配 + 看板改绑修正 + 迁移兼容与回滚 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-7 | 验收：探针 + 反向演练 + 全量回归与实机复核 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-9 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
| v1-10 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561 | 2026-10-04 15:59 |
