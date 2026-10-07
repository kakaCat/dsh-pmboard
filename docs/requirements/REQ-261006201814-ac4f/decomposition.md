# 拆分计划（REQ-261006201814-ac4f · 第二版）

## 目标与做法（一段话）

给本仓的测试立三层判据：**先冻结错误码口径**（清单由脚本生成，新增码漏配即红并给自助命令），
再给每个可触发码配一条「触发 → 断码」用例；把基线里 68 条失败**分诊**成反向子集与其余两份，
让 `baseline:refresh` 再也无法静默吞掉新失败；最后把「测试不写真实工作树」做成**三层**——
Node 权限模型从内核层**真拦**、契约锚点钉住夹具根、隔离副本端到端对拍。
全程 **src 一个字节不改**（D-3），既有用例零语义变更（D-9），且凡改共享夹具的卡都必须交 **A/B 归因证据**（FR-10）。

## 第一版已完成、本版沿用的资产（不重做，只补验收）

第一版走到 implementing 时已落地并验证两项，**本版沿用**，只安排差量工作：

| 已落地 | 证据 | 本版如何处理 |
|---|---|---|
| `tests/helpers/error-code-scan.ts` + `tests/fixtures/error-code-inventory.json` + `tests/error-code-inventory.test.ts` + `tests/drill/refresh-error-code-inventory.mts` | 11 条守卫全绿；注入新码必红并点名；刷新幂等；读数 127 码 / 零覆盖 25 / 假阴性率 6.86% | u4 直接消费；u12 复核契约一致性 |
| `tests/helpers/workspace-root.ts` + `tests/helpers/tool-deps.ts`（改再导出）+ `tests/application/harness.ts`（FakeDocs 认绝对根）+ `tests/workspace-root.test.ts` | 18 用例绿；跑 lazy-expand 与 execute-task 后真实需求目录 rtm 逐字节不变；A/B 把 10 条回归清零 | u2 补契约断言；u11 补 A/B 产物 |

**为什么单列这一节**：不列出来就会被当成「没人管的既有改动」；列出来又不必重做。

## 变更盘点

### 新增

| 路径 | 职责 |
|---|---|
| `tests/setup/hermetic-guard.ts` | 契约锚点守卫 + 权限模型启动自检（零依赖） |
| `tests/hermetic-guard.test.ts` | 两层隔离的元测试（写仓被拒 + 改回 `.` 必红） |
| `tests/helpers/code-trigger-harness.ts` | 触发矩阵骨架 + 三条自检 |
| `tests/error-code-matrix.test.ts` | 参数化「触发 → 断码」 |
| `tests/fixtures/error-code-exempt.json` | 豁免白名单（逐条 reason/plan/blocker） |
| `tests/error-code-exempt.test.ts` | 棘轮双向钉死 |
| `tests/baseline-triage.test.ts` | reverse/other 与基线三方对账 |
| `tests/drill/triage-baseline.mts` | 差集报告（只报告不落盘） |
| `tests/helpers/code-assert.ts` | 「断言携带某码」助手 |
| `tests/helpers/ledger-probe.ts` | 零写入与状态不变探针 |
| `tests/{authorization,concurrency,empty-input}-matrix.test.ts` | 三类矩阵 |
| `tests/helpers/ab-attribution.ts` | A/B 归因助手（FR-10） |
| `tests/ab-attribution.test.ts` | 归因助手元测试 |
| `tests/drill/reverse-drill-error-codes.mts` | 反向演练（备份 + sha256 + 逐字节还原） |
| `tests/compat-req-261006201814.test.ts` | 兼容三条断言 |
| `docs/reviews/test-baseline.{reverse,other}.txt`、`.reverse.notes.md` | 分诊产物 |
| `docs/reviews/REQ-261006201814-ac4f-ab.json` | A/B 归因产物 |
| `docs/reviews/REQ-261006201814-ac4f-readings.md` | 改前/改后读数与残留结论 |

### 修改

| 路径 | 改动 | 兼容要求 |
|---|---|---|
| `vitest.config.ts` | 新增 `setupFiles` 与 forks worker 的 `execArgv`（权限模型） | 版本探测 + 降级须如实标注 |
| 四处一次性点位 | `rtm-health` / `capture-hook` / 两个 `plan-footprint` | 语义等价 |
| 约 15 个既有测试文件 | 41 处 `success=false` 升级为断码 | **只追加**，不删不弱化 |

### 删除

**无。**

## 批次与依赖

```
   批次 A（地基，四张可并行）
     u1 权限模型沙箱 ──┐
     u2 契约锚点      │
     u4 触发矩阵 ─────┤
     u6 基线分诊 ─────┤
                       │
   批次 B（依赖 A）    ▼
     u3 泄漏点位修复  ← u1
     u5 豁免棘轮      ← u4
     u8 断码升级(上)  ← u4
     u9 断码升级(下)  ← u4
     u10 三张矩阵     ← u4
                       │
   批次 C              ▼
     u7 反向演练      ← u4, u5, u6
     u11 A/B 归因     ← u2, u3
                       │
   批次 D（收口）      ▼
     u12 兼容与读数   ← 全部
```

**依赖安全**：所有 `depends_on` 只引用更早批次的卡，无前向引用。

## 任务表

| 计划 key | 标题 | 批次 | 依赖 | 验收标准（可跑） | 工作量（footprint） | 承接条款 | 关联裁定 | 原型锚点 |
|---|---|---|---|---|---|---|---|---|
| u1 | 把测试进程关进沙箱：仓内写入由内核拒绝 | A | — | `npx vitest run tests/hermetic-guard.test.ts` 退出码 0 且输出含 `ERR_ACCESS_DENIED`；`tests/workspace-root.test.ts` 仍全绿 | files=2 anchors=3 chars=568 | FR-5 | D-11, D-14 | — |
| u2 | 钉住夹具根的契约：替身必须报绝对临时根 | A | — | 同上用例退出码 0；把 FakeDocs 根改回 `.` 后必须红 | files=4 anchors=3 chars=510 | FR-5 | D-11 | — |
| u4 | 逐码演练：让每个能触发的错误码都有一条断码用例 | A | — | `npx vitest run tests/error-code-matrix.test.ts` 退出码 0 且零覆盖码数 ≤5；删任一断码断言必须红 | files=4 anchors=3 chars=539 | FR-2 | D-8, D-13 | — |
| u6 | 把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债 | A | — | `npx vitest run tests/baseline-triage.test.ts` 退出码 0；`npx tsx tests/drill/triage-baseline.mts` 差集为空 | files=6 anchors=3 chars=685 | FR-4 | D-3, D-4 | — |
| u3 | 堵掉四处仍在写真实工作树的测试点位 | B | u1 | 四个文件 `npx vitest run` 退出码 0；跑完 `git status` 无 `.test-rtm-health` 未跟踪项 | files=4 anchors=3 chars=527 | FR-5 | D-11 | — |
| u5 | 给测不了的码登记理由，并让名单只减不增 | B | u4 | `npx vitest run tests/error-code-exempt.test.ts` 退出码 0；删条目 / 上调 frozenCount / 清空 reason 三例必须红 | files=2 anchors=3 chars=522 | FR-3 | D-8, D-12 | — |
| u8 | 把靠中文文案兜底的断言换成断错误码（上半） | B | u4 | 八个文件退出码 0；`git diff -U0 -- tests \| grep -c '^-.*expect('` 为 0 | files=8 anchors=3 chars=732 | FR-6 | D-1 | — |
| u9 | 把靠中文文案兜底的断言换成断错误码（下半） | B | u4 | 下半批文件退出码 0；`success=false` 命中由 41 降到 ≤5 | files=8 anchors=3 chars=776 | FR-6 | D-1 | — |
| u10 | 越权、并发、空输入三张矩阵：每一格都钉死 | B | u4 | 三张矩阵退出码 0；计数断言在场（加枚举项不补格必须红）；并发矩阵连跑三次稳定 | files=5 anchors=3 chars=645 | FR-7 | D-1 | — |
| u7 | 让判据不能自称在判：改坏必须变红 | C | u4, u5, u6 | `npx tsx tests/drill/reverse-drill-error-codes.mts` 退出码 0；跑完无残留；target 写错必须退出码 1 | files=2 anchors=3 chars=423 | FR-8 | D-1 | — |
| u11 | 把「不是本次引入」变成可复核的集合差 | C | u2, u3 | `npx vitest run tests/ab-attribution.test.ts` 退出码 0；A/B 产物 `introduced` 为空且 `stable` 为真 | files=5 anchors=3 chars=600 | FR-10, FR-9 | D-13 | — |
| u12 | 收口：核对零改动、给出改前改后读数与残留结论 | D | 全部 | `npx vitest run tests/compat-req-261006201814.test.ts` 退出码 0；`pnpm baseline:check` 退出码 0；读数文件在场 | files=2 anchors=3 chars=549 | FR-1, FR-2, FR-4, FR-5, FR-9, FR-10 | D-3, D-7, D-9 | — |

**容量核算**（`files×1 + anchors×0.5 + chars/2000`，容量 16 DU）：12 张卡全部低于容量，
最大 u9 = 9.89 DU。**无超容量卡**，故计划文档不需要「⚠️超容量(建议N批)」标记。

## 迁移与兼容（单列卡承接）

无持久数据迁移（新增文件全为新文件）。兼容三条由 **u12** 收口：
① 存量——既有用例零语义变更（`expect` 删除数 0、`it` 标题改写数 0、基线条目数不增）；
② 契约——矩阵同时覆盖大写码与其小写孪生/门内部码，映射有守卫；
③ 前向——守卫报红必给自助命令，刷新只增不减且 `unclassified` 未清零即红。
**回滚**：删除新增文件 + 还原 `vitest.config.ts` / `harness.ts` 两处即回到改前状态。

## 边界与红线（实施阶段不得违反）

- **`src/` 零改动**（D-3）：发现的 5 条实现缺口只上报。
- **不许删断言 / 放宽基线**（D-1）：`tests/` 的 `expect` 删除数必须为 0。
- **既有用例零语义变更**（D-9）：只许追加。
- **不用已被证伪的机制**（D-11）：不得再写「改写 fs 导出」或「全工作树哈希」。
- **改共享夹具必交 A/B 证据**（FR-10）：缺此项视为未验收。
- **不删 `REQ-000001/2`**：处置结论由 u12 给出。
- **不碰 `package.json`**：演练脚本用 `npx tsx` 直接跑。
- **本阶段不二次创作设计**：与 `design/` 矛盾时退回设计改计划后重新提交批准。
