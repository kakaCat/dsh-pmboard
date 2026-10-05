# 测试证据 · REQ-261004111917-f473（看板深链 404 修复）

> 卡面要求：`pnpm test` 失败数 ≤ 开工基线；`npx tsc --noEmit` 错误数 ≤ 基线。
> 本文件记录**基线测量的方法**（不只贴数字），以及四张卡的用例与反向演练证据。

## 1. 基线怎么量的（方法先于结论）

全仓开工时即为「多需求在途」的脏工作区（`tsc` 144 条既有错误、`pnpm test` 97 条既有失败）。
因此**不能**拿「HEAD 版」当基线（HEAD 远落后于工作区），改为**受控对照**：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 带本次改动 | `pnpm test` | 47 failed 文件 / **97** failed 用例 / 3701 passed / 3818 总（t1 收尾时） |
| **临时停用**本次生产改动（其余一字不动） | `pnpm test` | 47 failed 文件 / **98** failed 用例 / 3700 passed / 3818 总 |
| 还原 | `shasum -a 256 src/index.ts` | 与改动前**逐字节相同**（`bc218943...`） |

**结论**：本次改动新增失败 **0**；差异 1 条正是新加的那条接线断言（停用注册后它必红）。
逐卡推进时再按同一命令复测，失败数始终为 97：

| 时点 | failed 用例 | passed | 总 | 新增用例 |
|---|---|---|---|---|
| t1 收尾 | 97 | 3701 | 3818 | — |
| t2 收尾 | 97 | 3722 | 3839 | +21（deep-link） |
| t3 收尾 | 97 | 3734 | 3851 | +12（focus 9 + attach 3） |
| t4 收尾 | 97 | 3742 | 3859 | +8（tool-schema-board-link） |
| t5 收尾（终态） | 97 | 3742 | 3859 | —（只重建产物，无源码变更） |

`npx tsc --noEmit`：开工前 144 条 → 终态 **144** 条（本需求全部文件零新增；期间修掉自己引入的一处 `TS2367`）。

## 2. 本需求用例清单（63 条全绿）

| 文件 | 条数 | 覆盖 |
|---|---|---|
| `tests/legacy-board-route.test.ts` | 11 | 中转页状态码/响应头/片段表达式×2/方法约束/幂等/零数据/路径表；真 `node:http` 集成 2 条（HEAD 去体、GET 体为常量）；成组注册与失败回滚 3 条 |
| `tests/deep-link.test.ts` | 21 | 解析六态表 + 缺省/空值区分 + 多值取首；调用序列；ignored 零副作用；重试成功/耗尽；缺省预算下界；clearHash 抛错不中断；非 Error 抛出收敛；`ports=null` 不 reject；与 board-focus 联动的 I-6/I-7 |
| `tests/board-focus.test.ts` | 14 | 既有 5 条（一次性语义）+ TC-7a~TC-7i（通知不留 pending、多订阅者与幂等退订、退订回一次性、抛错隔离、空白清 pending、clear 不惊动订阅者、**返回 false 回落**、**全部抛错回落**、迭代中改集合） |
| `tests/board-attach.test.ts` | 9 | 既有 6 条 + TC-8b（挂载后登记 → 当场切详情）+ TC-8c（`isActive()=false` → 不消费、意图回落）+ TC-9b（dispose 退订） |
| `tests/tool-schema-board-link.test.ts` | 8 | 三处描述（含 `type==='string'`）+ src/tools 全域旧口径清扫 + 三处产出值逐字 + 前缀同源 |
| `tests/apply-wiring.test.ts` | +1 | 接线断言：`/dashboard` 与 `/dashboard/` 两条 exact 路由真的被注册 |

## 3. 反向演练（10 组，均按预期变红 + 文件逐字节还原）

| 卡 | 破坏点 | 变红 |
|---|---|---|
| t1 | 中转表达式删掉 `location.hash` | 1 条（TC-1①） |
| t1 | 摘掉方法守卫（POST 也回 200） | 1 条（TC-2④） |
| t2 | 删掉 `clearHash()` | 4 条 |
| t2 | 把 `requestFocus` 挪到 `selectPanel` 之后 | 5 条 |
| t2 | 失败路径不清定位意图 | 3 条 |
| t3 | 去掉 board-mount 订阅接线 | 1 条（TC-8b） |
| t3 | 有订阅者时仍无条件写 pending | 3 条 |
| t3 | 去掉可见性门闩（隐藏实例也消费） | 1 条（TC-8c） |
| t4 | 改 `QueryState` 的产出路径 | 1 条 |
| t4 | 回退 `StatusTool` 描述到旧口径 | 2 条 |

每组演练后均 `shasum -a 256` 校验原文件**逐字节还原**（sha 值记录在对应任务卡汇报里）。

## 4. 存量红（与本需求无关，如实列出）

| 失败项 | 说明 |
|---|---|
| `tests/apply-wiring.test.ts` > 注册全部 agent 工具 | 期望 18 个工具名、实际 23 个；多出的 `reqboard_kb` / `reqboard_open_window` / `reqboard_task_adopt` / `reqboard_task_refs` / `reqboard_task_regenerate` 由**其它需求**在途加入（HEAD 版已注册 adopt/regenerate 而清单不含）→ 改动前即红 |
| `tests/application/repository.test.ts` > RandomIdFactory | id 形状断言（6 位 hex）与当前实现不符，预存在 |
| `tests/reqboard/domain-summary.test.ts` | 并行全量跑时偶发红、单跑与复跑均绿（抖动，已记录） |
| `tests/host-panel.test.ts` | 环境缺 `react-dom/server` 无法加载（预存在，非本需求） |

## 5. 任务覆盖对照（验收覆盖度门禁用）

每行给出「该任务卡的验收标准由哪些测试/证据承接」，并按门禁要求的格式标出任务 id。

| 任务卡 | 承接它的测试与证据 |
|---|---|
| t-2cd503（父卡：宿主兼容入口） | `tests/legacy-board-route.test.ts`（11 条）+ `tests/apply-wiring.test.ts` 的接线断言 + `evidence/README.md` E-1/E-2 — `covers: t-2cd503` |
| t-20c87f（t1·研发） | `tests/legacy-board-route.test.ts`（状态码/响应头/片段表达式/方法约束/幂等/零数据/真 HTTP 集成/成组注册回滚） — `covers: t-20c87f` |
| t-8b5bf8（t1·复核） | `reviews/t1-host-route-review.md`（逐条核对表 + R1~R7 处置） — `covers: t-8b5bf8` |
| t-086497（t1·测试） | 本文件 §1 基线对照（97 vs 98）+ §4 存量红清单 — `covers: t-086497` |
| t-bac32d（父卡：客户端深链消费） | `tests/deep-link.test.ts`（21 条）+ 本文件 §2/§3 — `covers: t-bac32d` |
| t-f94b67（t2·研发） | `tests/deep-link.test.ts` 全部 21 条（解析六态、时序、重试、兜底、端口 null、与 board-focus 联动） — `covers: t-f94b67` |
| t-61de2a（t2·复核） | `reviews/t2-deep-link-review.md`（6 条跟进项处置：重试预算 640ms、I-8、req= 口径、layout 短路、只清自己意图、边界入文档） — `covers: t-61de2a` |
| t-6742c5（t2·测试） | 本文件 §1 时点表（t2 收尾 97 failed / 3722 passed）+ §3 反向演练三组 — `covers: t-6742c5` |
| t-5f475a（父卡：定位订阅通道） | `tests/board-focus.test.ts`（14 条）+ `tests/board-attach.test.ts` TC-8b/TC-8c/TC-9b — `covers: t-5f475a` |
| t-45ecd7（t3·研发） | `tests/board-focus.test.ts` TC-7a~TC-7i + `tests/board-attach.test.ts` TC-8b/TC-8c/TC-9b — `covers: t-45ecd7` |
| t-45a0dc（t3·复核） | `reviews/t3-board-focus-review.md`（R1~R7 处置：产物重建、可见性门闩、抛错留诊断、追溯编号、空白清 pending、覆盖缺口、退订顺序） — `covers: t-45a0dc` |
| t-5859d0（t3·测试） | 本文件 §1 时点表（t3 收尾 97 failed / 3734 passed）+ §3 反向演练三组 — `covers: t-5859d0` |
| t-b5f41f（父卡：文案与契约护栏） | `tests/tool-schema-board-link.test.ts`（8 条） — `covers: t-b5f41f` |
| t-a55776（t4·研发） | `tests/tool-schema-board-link.test.ts` 8 条（描述含「并定位」、旧口径 0 命中、产出值逐字、前缀同源、type 断言） — `covers: t-a55776` |
| t-40fa7a（t4·复核） | `reviews/t4-schema-text-review.md`（逐字对照 + 4 组只读变异 + 两条生效条件转 t5） — `covers: t-40fa7a` |
| t-57b5fe（t4·测试） | 本文件 §1 时点表（t4 收尾 97 failed / 3742 passed）+ §3 反向演练两组 — `covers: t-57b5fe` |
| t-149471（构建 + 端到端联调 + 全量回归） | `evidence/README.md` E-1（真 HTTP 线级）/ E-2（产物取证）/ E-3（运行态现状）/ E-4（真机四步待人工）+ 本文件 §1 终态行 — `covers: t-149471` |
