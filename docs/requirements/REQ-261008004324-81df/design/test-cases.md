---
requirement_id: REQ-261008004324-81df
title: "测试用例：28 个目标文件的读数矩阵与另案 5 条"
status: accepting
category: bug
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-11]
---

# 测试用例（REQ-261008004324-81df）

> 本需求是「让既有测试回到当前语义」，故**测试用例 = 既有失败文件本身**（不新建测试文件）。
> 下表是逐文件读数矩阵；命令一律 `npx vitest run <文件>`（逐文件点名，不抽样）。

## 逐文件读数矩阵（本需求内修 28 文件） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9 -->

| 条款 | 文件 | 改前 | 改后 |
|---|---|---|---|
| BUG-1 | tests/artifact-openable.test.ts / move-rollback.test.ts / design-registration.test.ts | 5 failed \| 30 passed | 3 passed files / 35 passed（7/7 · 19/19 · 9/9） |
| BUG-2 | tests/triad-gate.test.ts / e2e-triad-gate.test.ts | 6 failed | 「放行」类 3 passed；「缺三要素」类 3 仍红（另案） |
| BUG-3 | capture / client-view / node-panel-styles / template-address-injection | 1 / 3 / 1 / 4 | 0 / 0 / 0 / 2（余 2 条为另案 TC-9/TC-11）；顺跑 header-progress-responsive 22/22 |
| BUG-4 | auto-chain-approval / confirm-settle-plan-persist / plan-mode / t17-queue-e2e | 1 / 1 / 1 / 1 | 0 / 0 / 0 / 0（4 passed files / 24 passed） |
| BUG-4 | decompose-tools / t11-decompose-queue-write | 6 failed \| 27 passed | 30 passed / 3 passed |
| BUG-5 | dive-gate-prompt / dive-session-driver-wiring | 2 / 3 | 0 / 0（17 passed；静默 TypeError 计数 0） |
| BUG-5 | handoff / adapters/failure-alert / canceled-legacy-read | 2 / 2 / 1 | 0 / 0 / 0（29 passed；抖动条目连跑 8 次绿） |
| BUG-6 | create-doc-location / application/repository | 2 / 1 | 0 / 0（11 passed）；t-/e-/c- 三条 6 位断言保持原样 |
| BUG-7 | isolate-node-context / zero-arg-binding | 文件级 collect 失败；4 failed | 24 passed + 5 skipped；1 passed（连跑 3 次一致） |
| BUG-8 | kb-generate / kb-invalidation / kb-operations | 2 failed \| 33 passed | 3 passed files / 35 passed（KB K7 零漂移为绿） |
| BUG-9 | skills-assets | 1 failed \| 7 passed | 8 passed；真实 tarball pycache/pyc 均 0 |

## 另案用例（5 条，**保持红**作为证据） <!-- serves: BUG-10 -->

| 文件 | 用例 | 为什么保持红 |
|---|---|---|
| tests/triad-gate.test.ts | 拆分出口：卡缺三要素→拒；单卡结单：卡缺三要素→拒 | 三要素门**零生产调用点**（真缺陷，需接线） |
| tests/e2e-triad-gate.test.ts | 卡被改坏→出口门禁拦下 | 同上 |
| tests/template-address-injection.test.ts | TC-9、TC-11 | 系统段地址注入点未接线（`CaptureGuidanceDeps.address` 为死参数） |

## 任务覆盖标注（covers） <!-- serves: BUG-10, BUG-11 -->

> 本需求每个任务（13 张父卡 + 49 张子卡）的测试落点 = 该卡点名的测试文件（命令与读数见上表；
> 逐卡原始读数见 `tasks/*.md` 的完工汇报）。逐条标注如下：

covers: t-31ef1e
covers: t-2760e3
covers: t-c3c973
covers: t-0fa35e
covers: t-172714
covers: t-62c5ea
covers: t-95213f
covers: t-449951
covers: t-97e07f
covers: t-fcb5ab
covers: t-6056de
covers: t-ab7c10
covers: t-3e0403
covers: t-9053b0
covers: t-7b65ec
covers: t-0f4ab9
covers: t-e1a585
covers: t-815775
covers: t-951ef1
covers: t-e7a577
covers: t-e1cf86
covers: t-ccca0a
covers: t-a18541
covers: t-11b4f3
covers: t-8759ce
covers: t-734554
covers: t-9d5dc2
covers: t-87844d
covers: t-c047ef
covers: t-834538
covers: t-effc81
covers: t-858d1e
covers: t-309f5d
covers: t-7caaaf
covers: t-da226d
covers: t-82178d
covers: t-199944
covers: t-6ce006
covers: t-cbd381
covers: t-52f045
covers: t-09e7b1
covers: t-fe1092
covers: t-38e54c
covers: t-30e718
covers: t-de6874
covers: t-eebb66
covers: t-a4ae25
covers: t-f0ad8d
covers: t-c192f8
covers: t-163f02
covers: t-79ed13
covers: t-417692
covers: t-6329b7
covers: t-234699
covers: t-eb37cd
covers: t-24ffdf
covers: t-6f55d5
covers: t-777cf0
covers: t-93c7cf
covers: t-5979c1
covers: t-4855e4
covers: t-1789ae

## 回归命令矩阵 <!-- serves: BUG-11 -->

```bash
# 全量
pnpm test                      # → 12 failed files / 21 failed tests（开工前 37 / 67）
# 目标文件（逐文件点名）
npx vitest run tests/<目标文件>  # → 逐文件全绿
# 仓库门
pnpm kb:check                  # → 本需求关心的 K7 零漂移为绿；K1/K3/K14 为改前即有的授权外红
npx tsc --noEmit -p tsconfig.json   # → exit 0
# 分诊不变量（基线三份清单同源）
npx tsx tests/drill/triage-baseline.mts   # 只读报告
```
