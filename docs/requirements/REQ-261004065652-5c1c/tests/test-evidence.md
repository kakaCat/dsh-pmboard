# 测试证据（REQ-261004065652-5c1c）

> 判据口径：**新增失败 = 0**（工作区长期带存量失败，多窗口在改同一棵树 ⇒ 比"失败数字"可靠的是**失败名称集**）。
> 每条命令都可直接复跑；完整明细见 `evidence/regression.md`。

## 一、三条主判据

| 判据 | 命令 | 实测 | 与基线 |
|---|---|---|---|
| 类型闸门 | `npx tsc --noEmit \| grep -c 'error TS'` | **144** | 持平 |
| 全量回归 | `npx vitest run --reporter=dot` | **48 failed files / 98 failed / 3635 passed** | 失败**名称集**逐条比对为空（零新增） |
| 知识层 | `pnpm kb:check` | **11 项全绿** | 开工时为红（本轮新增 42 符号致代码地图漂移），重生成后全绿 |

```bash
# 零新增失败的判据（名称集比对，不是比数字）
comm -3 <(基线失败名称集) <(当前失败名称集)      # 实测：空
```

> 关于「98 vs 基线 97」：用归因实验证明是**套件基线自身漂移**，不是本次引入——
> 把本需求四个行为面逐个短路重跑（名称集无变化），再把源码回到 t3 等价态并移走新用例，
> 仍是 `48 / 98`，与交付态完全一致。

## 二、反向演练矩阵（护栏没空转的机械判据）

```bash
npx tsx scripts/reverse-drill-matrix.mts        # 退出码 0
```

```
✅ FR-4   投影读己所写（写路径不刷新快照）            → 红 5/应≥5
✅ FR-1   上游致命错误不可重试（AUTH 落进 transient）  → 红 4/应≥4
✅ FR-3   内存闭锁 fail-closed（起轮前不看闭锁）       → 红 1/应≥1
✅ FR-5   人工门即停手（起轮前不看台账态的门）         → 红 6/应≥6
✅ FR-8   断点留痕限流（窗口置 0）                    → 红 2/应≥2
✅ FR-10  引擎开工预检（预检关掉）                    → 红 2/应≥2
[通过] 全部演练如预期变红，且源码逐字节还原。
```

## 三、本需求新增判据用例（12 个文件）

| 文件 | 条数 | FR |
|---|---|---|
| `tests/upstream-failure.test.ts` | 16 | FR-1 / FR-2 / FR-8 |
| `tests/chain-budget.test.ts` | 15 | FR-11（含 5 条驱动接线） |
| `tests/human-gate.test.ts` | 14 | FR-5 |
| `tests/dive-terminal-reconcile.test.ts` | 10 | FR-9 |
| `tests/interruption-dedupe.test.ts` | 9 | FR-8 |
| `tests/provider-latch.test.ts` | 8 | FR-1 |
| `tests/store-projection-ryow.test.ts` | 8 | FR-4 / FR-11 |
| `tests/dive-loop-breaker.test.ts` | 7 | FR-1 / FR-2 / FR-3 / FR-6 |
| `tests/dive-human-gate-stop.test.ts` | 7 | FR-5 |
| `tests/ask-confirm-default-grace.test.ts` | 7 | FR-7 |
| `tests/advance-engine-precheck.test.ts` | 6 | FR-10 / FR-11 |
| `tests/dive-abort-latch.test.ts` | 5 | FR-3 / FR-6 |

合计 **112 条**（全量通过数 3523 → 3635 的主要来源；差额另有其它窗口同期新增）。

## 四、台账安全的端到端证据

```bash
rm -rf /tmp/drill-src && mkdir -p /tmp/drill-src && cp -R ~/.dsh/reqboard/. /tmp/drill-src/
npx tsx scripts/reconcile-terminal-drill.mts --src /tmp/drill-src      # 退出码 0
```

```
扫描条数: 47 · 已归一: （无）· 冷侧写不动: 35 条（全部 REQBOARD_COLD_IMMUTABLE）
逐文件 sha256: 改动 0 / 新增 0 / 删除 0   ← 零改写
```

真台账路径只读、只写临时副本；实测真台账演练前后一致（10 热 + 37 归档）。

## 五、既有用例的行为回归（改动的调用方）

| 文件 | 结果 | 说明 |
|---|---|---|
| `tests/ask-confirm-blocking.test.ts` | 5/5 绿 | 整形与重建后逐条一致 |
| `tests/confirm-evidence.test.ts` | 8/8 绿 | 文字证据路径未受影响 |
| `tests/concurrency-limits.test.ts` | 8/8 绿 | FR-5 的「1 小时 + 无 600s 硬编码」裁定未被破坏 |
| `tests/interruption-checkpoint.test.ts` | 11/15（3 条既有失败） | 与开工基线**同集**；显式通道补上后未新增 |
| `tests/ask-confirm-pending.test.ts` / `ask-confirm.test.ts` | 各 1 条既有失败 | 与开工基线一致 |

## 六、测试契约的有意变更（供复核）

1. **瞬时错误不再立刻暂停**：改由「同因连续 3 次」熔断（避免一次抖动就叫人）。
2. **`onAgentError` 不再立刻 disarm**：改走同一套熔断计数。
3. **abort/致命/熔断的停机位由 `driverHealth` 承载**：legacy `phase=paused` 不再由 `pauseAborted` 写（停机位唯一）。
4. `kb-operations.test.ts` 白名单条数断言 8 → **10**（新增两条护栏入口，进白名单并写理由）。

以上 1–3 均为本需求的设计意图，卡记录与 `evidence/regression.md` 留痕；第 4 条是被改动直接触发的同步。

## 七、测试覆盖度标注（任务卡 ↔ 判据）

每个任务的覆盖证据（门禁按 `covers:` 行统计覆盖度）：

covers: t-58c271
covers: t-230a8b
covers: t-7b3f98
covers: t-64c231
covers: t-ab7224
covers: t-62c1c8
covers: t-17ab48
covers: t-2bc495
covers: t-22f84b
covers: t-a6831f
covers: t-a31dbf
covers: t-fd132a
covers: t-cbaf3a

| 任务卡 | 判据（用例 / 命令） |
|---|---|
| t-58c271 定契约：失败分类器 + 三个判定纯函数 | `tests/upstream-failure.test.ts`(16) `tests/provider-latch.test.ts`(8) `tests/human-gate.test.ts`(14) `tests/chain-budget.test.ts`(10 纯函数) |
| t-230a8b 修投影：写路径同源刷新 | `tests/store-projection-ryow.test.ts`(8)；反向演练「注释掉刷新 → 红 5」 |
| t-7b3f98 接线驱动：闭锁/退避/额度闩/心跳 | `tests/dive-loop-breaker.test.ts`(7) `tests/dive-abort-latch.test.ts`(5)；反向演练 2 条（红 4 / 红 1） |
| t-64c231 人工门即停手 + 终态收手与启动对账 | `tests/dive-human-gate-stop.test.ts`(7) `tests/dive-terminal-reconcile.test.ts`(10)；反向演练「短路人工门 → 红 6」；`scripts/reconcile-terminal-drill.mts`（副本零改写） |
| t-ab7224 弹框缺省有界宽限 | `tests/ask-confirm-default-grace.test.ts`(7) `tests/concurrency-limits.test.ts`(8 回归) |
| t-62c1c8 断点留痕去重限流 | `tests/interruption-dedupe.test.ts`(9) `tests/interruption-checkpoint.test.ts`(回归)；反向演练「窗口置 0 → 红 2」 |
| t-17ab48 引擎开工预检 + 全局预算闸接线 | `tests/advance-engine-precheck.test.ts`(6) `tests/chain-budget.test.ts`(5 接线)；反向演练「关预检 → 红 2」 |
| t-2bc495 迁移与兼容：台账副本演练 | `scripts/reconcile-terminal-drill.mts`（退出码 0 = 零改写）+ `docs/requirements/REQ-261004065652-5c1c/evidence/reconcile-drill.md` |
| t-22f84b 回归收口 | `scripts/reverse-drill-matrix.mts`（6 条全红且逐字节还原）+ `evidence/regression.md` + `npx tsc --noEmit`(144) + 全量名称集比对 |
| t-a6831f 知识层与文档同步 | `pnpm kb:check`(11 项全绿) + `tests/kb-operations.test.ts`(11) + `evidence/docs-sync.md`（引用路径 15/15 实测存在） |
| t-a31dbf 定契约·研发（t-58c271 子卡） | 同 t-58c271：四个纯函数用例文件覆盖研发段产出 |
| t-fd132a 定契约·复核（t-58c271 子卡） | 同 t-58c271；复核段证据见该卡汇报与其反向演练（`fatal=false` → 红 4） |
| t-cbaf3a 定契约·测试（t-58c271 子卡） | 同 t-58c271；测试段判据即上述四个用例文件的全绿结果 |
