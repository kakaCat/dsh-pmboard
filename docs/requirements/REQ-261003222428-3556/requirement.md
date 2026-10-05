---
req_id: REQ-261003222428-3556
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: backend
---

# 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：refactor ｜ 档位：**重档（thorough）** ｜ 立项：2026-10-03
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话：**自动实施链的名义能力与实际行为之间有五处落差——说并行其实串行、锁会"假死"被抢、
计划依赖曾丢光、两代实现并存、三条已知缺口敞着。本需求把它们逐项钉死并给出可证伪判据。**

这些落差全部来自真实事故或源码坐实，不是设想：

| 落差 | 实测/坐实场景 |
|---|---|
| 推进锁无心跳 | 单卡跑 24.7 min > 锁 stale 15 min，另一次 task_run 可收锁并发投递 → 同需求双链并跑 |
| 批内"并行"实为串行 | `AdvanceChain.ts:371` 注释写并行、代码是 `for…await` 串行；`maxParallelParents=10` 从未兑现 |
| 计划 depends_on 落库丢失 | REQ-261003204143-3219 实测：计划写 t2→t1、t3→t2，落库三张父卡 dependsOn 全 `[]`、被并行开工 |
| 死代码两代并存 | StartSubtaskChain / background-runner / checkpoint-manager 全仓无调用者仍编译维护 |
| 缺口 N-1~N-3 | 《自动链契约》§5 已登记：死窗口静默停摆 / 绑定静默改写 / 催办弹框量产 |

**depends_on 丢失的定性**（分析阶段已查）：现行 src 的解析/落库/映射三段逐行正确、
`tests/decompose-tools.test.ts` 落库成链用例绿——**疑似当时运行的构建过旧**（dist 在事故后 23:06 被重建）。
本需求给它一次**端到端复现确认** + 把「构建新鲜度」纳入防线，而不是假装它没发生过。

**本需求不做**：不重写链架构（事件链方向是对的）；不动五道人工门；不做跨需求调度（属后续业务设计需求）。

## 业务流程图

```
 今天（五处落差）                                本需求后
 ──────────────────────────────                 ──────────────────────────────
  task_run 投递 ─锁 15min 无续租─▶ 锁被判残留      在跑 run 周期续租
       │ 另一次投递收锁 ▶ 双链并跑                     │ stale 只收留真死的锁
       ▼                                             ▼
  selectAdvanceBatch 选出一批                        同左
       │ for…await 串行（注释谎称并行）                │ 写集无冲突的批内 Promise.all
       ▼                                             ▼
  10 并发额度 = 1 并发实际                            真并行，额度名副其实
  ──────────────────────────────                  ──────────────────────────────
  计划 depends_on ─落库─▶ []（旧构建）               端到端复现确认现行正确
       │ 父卡并行开工、顺序语义丢失                    │ + 构建新鲜度防线（陈旧可见）
  ──────────────────────────────                  ──────────────────────────────
  死代码：两代链实现并存                              旧代删除，写集调度移植入现役
  N-1 wake 受理即成功                                 叫不动 → driverHealth=paused + 诊断
  N-2 绑定静默改写                                    绑定变更走留痕入口/显式改绑
  N-3 催办弹框量产（实测 39 个）                      按 kind 聚合成组确认
```

## 现状（漂移点 → 目标形态）

### 漂移点 1：推进锁是"死锁租约"（FR-1）

`advance.lockAt` 在投递时认领、stale 阈值 15 min（limits.ts:46），
但 `driveChain` 循环内**没有任何续租**——单卡执行超过 15 min，锁即被任何一次
`reqboard_task_run` 判残留回收（AdvanceChain.ts:509-523），同一需求两条链并发推进。
老 `BackgroundRunner` 有 30s 心跳（background-runner.ts:176-186），现役 AdvanceChain 反而没有。
**目标形态**：在跑 run 按节拍续租（复用 LIMITS.heartbeatIntervalMs），stale 只收留"真死"的锁。

### 漂移点 2：并行调度名不副实（FR-2）

`selectAdvanceBatch` 正确选出了同层 ready 批次，但 `driveChain` 用
`for (const sel of batch) await runSelection(...)` 串行执行（AdvanceChain.ts:371-372）。
写集冲突检测（batch-scheduler.ts）齐备却只被死代码引用。
**目标形态**：批内先过写集冲突（移植 batch-scheduler），无冲突事件 `Promise.all` 真并行；
有冲突的保守串行（宁可慢，不可错）。

### 漂移点 3：计划依赖静默丢失的防线缺口（FR-3，定性已修正）

**修正记录（2026-10-03）**：最初定性为「落库链路丢 depends_on（疑似陈旧构建）」。
经 tsx 复现 `normalizePlanTasks`（t2→['t1']、t8→['t2'] 归约正确）+ 逐字回读两次提交报文，
真相是：**agent 两次提交计划时漏传 `depends_on` 字段**，工具如实接收空依赖并落库——
链路没有丢任何东西。但假事故暴露了真缺口：
`decomposition.md` 的依赖表与 tasks 数组不一致时**没有任何防线**，漏传静默通过。

**目标形态**：① 提交侧一致性警告——计划文档依赖表声明了依赖而 tasks 数组对应 key 全空 →
回执带 warning 点名（不拒，纯文档卡天然无依赖）；② 端到端用例守「带 depends_on 提交 →
落库逐环成链」（防未来真回归）；③ 构建新鲜度可查（保留：陈旧构建仍是真实风险，
auto_confirm 事故就是它放大的）。

### 漂移点 4：两代链实现并存（FR-4）

| 文件 | 状态 |
|---|---|
| `use-cases/StartSubtaskChain.ts` | 无调用者（tests/auto-chain-approval.test.ts:61 已登记） |
| `internal/background-runner.ts` + `checkpoint-manager.ts` | 仅被 StartSubtaskChain 引用 |
| `internal/batch-scheduler.ts` | 写集冲突检测**应移植**进 AdvanceChain（FR-2），移植后旧壳删除 |

**目标形态**：单一现役实现；batch-scheduler 的逻辑搬入 advance 路径后删除四个旧文件及其专属测试。

### 漂移点 5：三条已登记缺口（FR-5/6/7，源自《自动链契约》§5）

| FR | 缺口 | 目标形态 |
|---|---|---|
| FR-5 | N-1：armed + 绑定窗口已死 = 静默停摆（wake 端口恒返 true） | 投递前确认绑定窗口是活 agent；叫不动转 `driverHealth=paused` 并留诊断 |
| FR-6 | N-2：窗口绑定可被静默改写、无留痕 | 绑定变更必须走留痕入口；提供显式「改绑到本窗口」能力 |
| FR-7 | N-3：高频产物逐条催办 → 弹框量产（实测一次积 39 个） | 催办按 kind 聚合成一条；确认支持成组（design 已有成组先例） |

## 目标结构

改完后的实施链只有**一代实现、一套语义**：

| 层 | 目标形态 |
|---|---|
| 锁 | `advance.lockAt` 由在跑 run 按 30s 节拍续租；stale 接管只收留进程真死的锁 |
| 调度 | `selectAdvanceBatch` 选批 → 写集分组 → 无冲突组 `Promise.all` 真并行、未声明写集保守串行 |
| 落库 | `landApprovedPlan` 唯一入口；计划 depends_on 逐环成链，有端到端复现用例看守 |
| 代码 | StartSubtaskChain/background-runner/checkpoint-manager/batch-scheduler 删除，写集逻辑活在 advance 路径 |
| 唤醒 | wake 受理前校验绑定窗口存活，叫不动转 paused + 诊断；绑定改写全部经留痕助手 |
| 催办 | 同 kind 待确认聚合成一条、成组落章（人点 1 次而非 N 次） |

## 行为不变式

交付后以下必须逐条成立（验收对照）：

1. **批次选择不变**：`selectAdvanceBatch` 的选择规则与现状逐一等价（既有用例零改动通过）。
2. **默认行为不变**：写集未声明的卡（= 全部存量卡）执行顺序 ≡ 现状串行。
3. **崩溃语义不变**：进程死亡 → 心跳停 → 15 min stale 接管链路原样可用。
4. **停止原因/回执形状不变**：AdvanceStop 取值集、工具回执字段（除新增 `plugin_build`）不增不减。
5. **人工门不变**：五道门位置与裁决权不动；催办聚合只改组织、不改门语义。
6. **凭证门不变**：done 证据判据、子卡族（写入/结论）划分不动。

## 边界（不做）

- 不重写链架构（事件链方向是对的），不动五道人工门。
- 不做跨需求调度/优先级/模型路由/阶段遥测——属后续业务设计需求。
- 不给计划侧补「写集声明」的录入界面（只留接口；真正用起来等业务设计需求定形态）。
- 不碰并行窗口 REQ-261003204149-1e80 在制的文件（capture-section / RESPONSE_SOURCES 等）。

## 兼容性判断（refactor 必填）

- FR-1/2/4：纯内部行为修正，无协议/落盘格式变更；存量在跑需求不受影响（锁格式不变）。
- FR-3：复现为只读/临时需求操作，无兼容负担。
- FR-5/6：driverHealth 语义细化，沿用既有字段，不新增协议键（FR-6 若需新留痕字段，限台账内、向后兼容）。
- FR-7：催办聚合只改提示组织方式，不改确认门语义。

## 功能点总览

| # | 功能点 | 验收方式 |
|---|---|---|
| FR-1 | 在跑 run 按节拍续租推进锁；单卡跑 >15 min 时第二次 task_run 不再收锁双跑 | 用例：模拟长执行（假时钟越过 stale 阈值）→ 二次投递被锁挡下且 run 继续 |
| FR-2 | 批内写集无冲突事件真并行（Promise.all）；有冲突保守串行；并发数 = min(批次, maxParallelParents) | 用例：两张无冲突父卡开工时间重叠（假时钟/桩计时）；冲突对仍串行 |
| FR-3 | 端到端复现 depends_on 落库（plan→approve→land→断言父卡 dependsOn 非空）；构建新鲜度可查 | 复现脚本输出 + 新鲜度查询回执含构建指纹 |
| FR-4 | StartSubtaskChain/background-runner/checkpoint-manager/旧 batch-scheduler 删除；全仓引用为零 | `grep -rn` 零命中 + `pnpm test` 无新增失败 |
| FR-5 | wake 投递前校验绑定窗口存活；叫不动转 paused + 诊断留痕 | 用例：死窗口场景 → driverHealth=paused、不再刷 lastWakeAt |
| FR-6 | 绑定改写必须留痕；提供显式改绑入口 | 用例：改绑产生台账留痕（actor/at/from/to） |
| FR-7 | 产物催办按 kind 聚合为一条 + 成组确认 | 用例：N 个 task_detail 产物 → 1 条催办；一次确认全部落章 |

## 回归面（refactor 必填）

| 面 | 风险 | 对冲 |
|---|---|---|
| AdvanceChain 主循环 | FR-1/2 都动它，链是实施的心脏 | 既有 advance-chain 一族测试 + 新增并行/续租用例；每步假时钟可复现 |
| 任务落库 | FR-4 删文件波及引用 | 删除前全仓 grep 零引用判据 + tsc |
| Dive 唤醒 | FR-5 动 wake 语义 | 既有 dive-rearm/autorun-rearm 用例 |
| 弹框确认 | FR-7 改催办组织 | design 成组确认先例 + 既有 pending-confirm 用例 |

## 验收判据（可复核）

```bash
# 核心套件（现状绿，交付时必须仍绿）
npx vitest run tests/advance-chain*.test.ts tests/decompose-tools.test.ts \
  tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts
# 全量：失败数 ≤ 文档基线 98
pnpm test
# 死代码零引用
grep -rn "StartSubtaskChain\|backgroundRunner\|CheckpointManager" src/ | wc -l  # → 0
```

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

> 本需求文档尚未定义功能点编号。

<!-- reqboard:marks:end -->
