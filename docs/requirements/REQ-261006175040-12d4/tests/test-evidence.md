# 测试证据（REQ-261006175040-12d4）

> 每条都是**实际跑过的命令 + 实得输出摘要**（不是"预期"）。原始输出另存 `evidence/` 下的报告与 PNG。
> 采集时刻：验收材料提交前（全部命令新鲜跑过一遍）。

## 1. 用例（新鲜跑）

```
npx vitest run tests/gate-readings.test.ts tests/reqboard/domain-summary.test.ts \
  tests/card-face.test.ts tests/card-face-summary-shape.test.ts \
  tests/state-no-bigfield-read.test.ts tests/reqboard/store-contract.test.ts \
  tests/state-payload-client.test.ts tests/stage-panel.test.ts
→ Test Files  8 passed (8)
→      Tests  258 passed (258)
```

| 用例文件 | 条数 | 覆盖 | 对应 FR |
|---|---|---|---|
| `tests/gate-readings.test.ts`（新增） | 14 | 三态 / design 成组 / `count` / 顺序稳定 / `planState` 三态与缺省 / `archivePrepared` 两来源 | FR-1, FR-3, FR-5 |
| `tests/reqboard/domain-summary.test.ts`（扩） | 26 | 摘要键集恰等于 `SUMMARY_KEYS`；三键投影；`artifacts === undefined` ⇒ 不下发键 | FR-2, FR-6 |
| `tests/card-face.test.ts`（重写夹具） | 21 | 三态 chips / `门 c/总数` / 确认按钮在场缺席 / 计划·验收·归档 chip / 列表行 / 读数缺省整块不渲染 | FR-1, FR-3, FR-4, FR-5, FR-6 |
| `tests/card-face-summary-shape.test.ts`（新增） | 4 | **跨缝**：只喂摘要字段；无读数不渲染且不出现 ✗ 与 `产物 0/6` | FR-1, FR-3, FR-6, FR-7 |
| `tests/state-no-bigfield-read.test.ts`（新增） | 3 | 预热读 3 件、从不读 `verification.json`；连续 3 次增量 0；重建如实为 3 | FR-2, FR-7 |
| `tests/reqboard/store-contract.test.ts`（扩） | 120 | 四条实现读数同形（逐字段相等） | FR-2, FR-7 |
| `tests/state-payload-client.test.ts`（扩） | 9 | 载荷 `gates ≤ 5`、值域合法、六个大字段键零出现 | FR-2, FR-7 |
| `tests/stage-panel.test.ts`（按新契约重写一处） | 61 | `renderConfirmButton` 成组确认文案（改读 `gates`） | FR-4 |

## 2. 端到端（真实台账，非夹具）

```
ShardedRequirementStore.listSummaries()（root = ~/.dsh/reqboard）
→ 需求数 60 · 有 gates 60 · 告警 0
→ REQ-261006130057-7a43 = requirement:confirmed:1 / design:confirmed:6 /
  decomposition:confirmed:1 / verification:missing:0 · planState=approved · archivePrepared=false
```

读数与台账 `artifacts.json`（需求文档 1 份已落章、设计 6 份已落章、拆分计划已批准、验收材料未登记）一致。

## 3. 逆验证（证伪力取证，三次）

见 `evidence/inverse-verification.md`：① 改回就地读 `artifacts` ⇒ 4/4 红；② 读不到当缺失 ⇒ 2/4 红；
③ 一条实现漏装配 ⇒ 2 条同形断言红。三次均**逐字节复原**后回绿。

## 4. 构建与出图

```
pnpm build:client
→ [verify-client] OK  bundle=712353 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

npx tsx scripts/card-gates-ui-shot.mts
→ 退出码 0；四张 2560×1800 PNG：
  evidence/card-gates-analysis-1280-cards.png（门 0/4 + 确认产物）
  evidence/card-gates-design-group-1280-cards.png（门 1/4 + 确认产物（全部 6 份））
  evidence/card-gates-implementing-1280-cards.png（✓✓✓✗ + 门 3/4 + 计划已批 + 无按钮）
  evidence/card-gates-degraded-1280-cards.png（门相关块整块不渲染）
```

## 5. 基线（C-14）与类型（C-15）：不达标，逐条归属外部

```
pnpm typecheck        → 1 error：src/client/views/panels/verify.ts(36,41) TS2307（vendor 相对深度，属 REQ-261006130057-7a43）
pnpm baseline:check   → 新增失败 7 条，全部指向其他需求在飞的改动；
                        本需求涉及的 8 个测试文件一个都不在新增失败清单里
```

第二轮基线跑完后，本次唯一一条真回归（`tests/stage-panel.test.ts` 旧契约用例）已修好并复跑全绿。
处置纪律：**未 refresh 基线**（refresh 等于承认现状，会把别人的红一并落账）。

## 6. 覆盖度自查（FR ↔ 证据）

| FR | 证据 |
|---|---|
| FR-1 三态 chips | 用例 + 实拍图 analysis/design-group/implementing |
| FR-2 服务端算 + 读放大 | 用例（摘要投影 / 载荷有界 / 读放大 0）+ 真实台账端到端 |
| FR-3 门 c/总数 | 用例断言 `门 3/4` / `门 0/4`；实拍图 |
| FR-4 确认入口恢复 | 用例（在场/缺席/份数文案）+ 实拍图 design-group |
| FR-5 计划/验收/归档 chip | 用例（三态 + 缺省不渲染）+ 实拍图 implementing（计划已批） |
| FR-6 读不到 ≠ 缺失 | 跨缝用例 + 逆验证② + 兼容演练①（真实 60 条载荷） |
| FR-7 回归防线 | 261 条相关用例（258 + 3 出图判据）+ 三条逆验证 + 出图脚本 |

## 7. 逐卡覆盖对照（covers）

> 门禁口径：`covers: t-xxx` 逐张声明本卡的验收由哪些用例/证据兑现。父卡与其子卡**各一行**，
> 子卡的阶段职责（研发/联调/复核/测试）就写在对应证据里。

| 任务 | 类型 | covers | 兑现的用例 / 证据 |
|---|---|---|---|
| t-7dbf23 | 父卡（t1 domain 纯判定） | covers: t-7dbf23 | `tests/gate-readings.test.ts`（14 条：三态 / 成组 / count / planState / archivePrepared）；parity 48 组穷举 |
| t-6a3c56 | 子卡·研发 | covers: t-6a3c56 | `src/domain/artifact/GateReadings.ts` 落盘 + `tests/gate-readings.test.ts` 全绿（14 passed） |
| t-100b2d | 子卡·联调 | covers: t-100b2d | 项目 typecheck 本卡零新增错误；消费端签名与 `design/interfaces.md` §2 逐条对照 |
| t-347a76 | 子卡·复核 | covers: t-347a76 | 对抗式复核：`archivePreparedOf` 与 `closingGapOf` 48 组穷举零不一致；模块 import 数为 0 |
| t-20c3f1 | 子卡·测试 | covers: t-20c3f1 | `npx vitest run tests/gate-readings.test.ts` → 14 passed；全量基线失败总数未回涨 |
| t-a9e562 | 父卡（t2 摘要契约 + 装配单点） | covers: t-a9e562 | `tests/reqboard/domain-summary.test.ts`（26 条：键集恰等于 `SUMMARY_KEYS`；三键投影；缺省不下发） |
| t-61147b | 父卡（t3 分片读侧接线） | covers: t-61147b | 真实台账端到端 60/60 有 gates / 0 告警；`tests/reqboard/store-contract.test.ts` 分片读套件 |
| t-57b7d3 | 父卡（t4 SQLite 与测试辅助） | covers: t-57b7d3 | `tests/reqboard/store-contract.test.ts` + `tests/state-payload-client.test.ts` → 163 passed；grep 直出 `summarize(` = 0 |
| t-5fd2f8 | 父卡（t5 同形 + 载荷上界） | covers: t-5fd2f8 | `tests/reqboard/store-contract.test.ts`（同形两节）+ `tests/state-payload-client.test.ts`（gates ≤ 5、大字段零出现） |
| t-eb821e | 父卡（t6 卡面渲染） | covers: t-eb821e | `tests/card-face.test.ts`（21 条）+ `tests/stage-panel.test.ts`（61 条，成组确认文案改读读数） |
| t-71d3f9 | 父卡（t7 跨缝用例） | covers: t-71d3f9 | `tests/card-face-summary-shape.test.ts`（4 条）+ `evidence/inverse-verification.md` 逆验证①② |
| t-7352d0 | 父卡（t8 读放大上界） | covers: t-7352d0 | `tests/state-no-bigfield-read.test.ts`（3 条：预热 3 件 / 连续 3 次增量 0 / 重建如实 3） |
| t-da59e2 | 父卡（t9 E2E 出图） | covers: t-da59e2 | `npx tsx scripts/card-gates-ui-shot.mts` 退出码 0；四张 PNG 落 `evidence/` |
| t-ad63f6 | 父卡（t10 兼容与回滚收口） | covers: t-ad63f6 | `evidence/compat-rollback.md`：旧服务端真实 60 条载荷演练（✗/产物 0/6/门 0/4 均 0 处）+ 回滚步骤；基线两轮归属表 |
