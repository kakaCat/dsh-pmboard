---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 架构设计（REQ-261003222428-3556）

> refactor 重档。纪律：一次只改一类东西（分批见末节）；行为等价面逐批给验证设计；
> 不夹带新功能（跨需求调度/模型路由属后续业务设计需求，不进本设计）。

## 目标 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

一句话（可证伪）：自动实施链的**名义能力 = 实际行为**——锁只在真死时被接管、
并发额度真实兑现、计划依赖不丢、仓里只有一代实现、三条已知缺口各有可验证的终点。

## 总体方案 `serves: FR-1, FR-2, FR-4`

```
                 ┌────────────── 现役：AdvanceChain ──────────────┐
 task_run ─▶ 认领锁(lockAt,runId)                                 │
                 │                                                │
                 ▼                                                │
          jobs.start(run)                                         │
                 │  ┌─ 新增：续租心跳（FR-1）每 30s 刷新 lockAt ─┐ │
                 ▼  │   （仅当 adv.runId 仍=自己）              │ │
          driveChain 循环                                        │ │
                 │  └────────────────────────────────────────────┘ │
                 ▼                                                │
          selectAdvanceBatch → 批次                               │
                 │                                                │
                 ▼  改造（FR-2）：按写集冲突分组                    │
          无冲突组 → Promise.all 真并行                            │
          有冲突/未声明写集 → 保守串行                             │
                 └────────────────────────────────────────────────┘
  ── 死代码（FR-4）：StartSubtaskChain / background-runner /
     checkpoint-manager 删除；batch-scheduler 的写集逻辑移植进 advance 路径后删旧壳
```

## 依赖与调用方清单（refactor 必填） `serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-7`

| 改动点 | 谁调用它 | 它调用谁 | 漏改验证 |
|---|---|---|---|
| `advanceRequirement` / `driveChain`（AdvanceChain.ts） | TaskExecuteTool/TaskRunTool、看板「继续」、scanAndResume | executeSubtask、selectAdvanceBatch、taskStore/requirementStore | `grep -rn "advanceRequirement\|driveChain" src/ tests/` |
| `selectAdvanceBatch`（advance-select.ts） | 仅 driveChain | — | 纯函数，冻参用例 |
| `batch-scheduler.ts` / `background-runner.ts` / `StartSubtaskChain.ts` / `checkpoint-manager.ts` | 生产 0 引用（仅各自单测） | — | 删除后 `grep` 零命中 + tsc |
| `domain/write-set.ts` `detectConflict` | batch-scheduler（待删）→ 新消费方 advance 路径 | — | FR-2 用例 |
| wake 端口（ReqboardDiveManager / wake-heartbeat） | round-driver / 心跳兜底 | agents 注册表（新增只读依赖） | FR-5 死窗口用例 |
| `sourceSessionId` 写入点 | createRequirementDirect / bind / 改绑（待收编） | — | 静态断言：直接赋值仅限留痕助手 |
| 产物催办（artifact-gates / notifyArtifactRegistered） | submit/report 各登记点 | ask 通道 | FR-7 聚合用例 |

## FR-1 · 推进锁续租 `serves: FR-1`

**问题**：`lockAt` 投递时认领后不再刷新；单卡 >15 min → 锁被判残留（AdvanceChain.ts:515-523），
二次投递收锁 → 同需求双链并跑。

**设计**：
- 在 `advanceRequirement` 投递成功后的 job `run` 包装里启动续租定时器：
  每 `LIMITS.heartbeatIntervalMs`（30s）执行一次 `requirementStore.mutate`——
  **仅当 `adv.runId === 本次 runId`** 时刷新 `adv.lockAt = now`（绝不覆盖别人的锁）。
- `driveChain` 的 `finally` 停定时器后再清锁（先停心跳，再释放，顺序不可逆）。
- 进程死亡 → 心跳自然停 → 15 min 后 stale 接管逻辑**原样保留**（崩溃不丢链的既有语义不变）。
- 同步兼容路径（无 jobs 端口）不认领锁，无需心跳——行为不变。

**行为等价面**：除「锁不再假死」外，所有停止原因/回执形状/留痕格式不变。

**验证设计**（假时钟）：
- 心跳开着 + 推进假时钟越过 `advanceLockStaleMs` → 二次 `advanceRequirement` 返回 `locked` 且原 run 不被接管；
- 心跳停掉（模拟进程死）+ 越过 stale → 二次投递成功接管（既有行为等价）；
- 心跳写锁时 `runId` 已被他人替换 → 不覆写（守卫用例）。

## FR-2 · 批内真并行 `serves: FR-2, FR-4`

**问题**：`driveChain` 对 `selectAdvanceBatch` 选出的批次 `for…await` 串行执行，
`maxParallelParents=10` 从未兑现；写集冲突检测闲置在死代码里。

**设计**：
- 把 `domain/write-set.ts` 的 `detectConflict` + 贪心分组逻辑从 batch-scheduler **移植**为
  advance 路径的内部模块（`internal/advance-parallel.ts`），batch-scheduler 随之删除（FR-4）。
- 批次内按事件类型分层：
  - `OPEN_PARENT` / `FINALIZE_PARENT`：台账操作（ms 级）→ 保持串行先执行（便宜且要顺序留痕）；
  - `RUN_SUBTASK`：重活 → 按**父卡写集**分组：两父卡写集冲突 → 不同组（串行）；
    **任一父卡未声明写集（scope.files / filesPlanned 为空）→ 视为与一切冲突（保守串行）**——
    计划落库目前 `scope: asScope({})` 全空，故默认行为 = 现状串行，只有声明了写集的卡才提速
    （宁可慢、不可错；同时为计划侧补写集声明留好接口）。
- 并行执行 = `Promise.all` 同组事件；任一失败 → 沿用既有暂停语义
  （首个失败触发 pauseRequirement + 告警；同组其余已完成的如实记 history，不回滚别人的成功）。
- 留痕：每个事件的 AdvanceRecord 不变；并行批次在 history 里共享同一 `batchId`（新增可选字段，便于事后还原"这批是一起跑的"）。

**行为等价面**：批次选择规则（advance-select）不动；单卡执行/凭证门/失败分类不动；
唯一变化是「同批事件的执行重叠度」。默认配置下（写集未声明）行为 ≡ 现状。

**验证设计**：
- 两张声明了无冲突写集的父卡：桩 `executeSubtask`（deferred）→ 断言两张子卡**同时在跑**（重叠窗口非空）；
- 写集冲突对 / 未声明写集对 → 断言严格串行（第二张的开始 ≥ 第一张的结束）；
- 并行组内一张失败 → 链暂停、成功卡 history 保留、失败卡 rollbackSubtask 语义不变。

## FR-3 · depends_on 端到端复现 + 构建新鲜度 `serves: FR-3`

**定性**（分析阶段已查）：现行 src 解析/存储/映射三段正确、落库成链用例绿——
疑似事故时运行的是修复前旧构建。本卡给**确定性结论**，不猜。

**设计**：
- **端到端复现**（tests/ 新用例，走真实端口不留残渣）：
  seed 需求 + 批准计划（t1→t2→t3 链式 depends_on）→ 走 `landApprovedPlan` →
  断言父卡 `dependsOn` 逐环成链（key 已映射为真实 id）。
  通过 → 定性为「陈旧构建」，关闭调查；失败 → 按 bug 三步走就地修（根因候选清单见风险节）。
- **构建新鲜度**：插件装配时计算构建指纹（`sha256(dist/index.mjs)[0:12]`，与客户端构建戳同思路），
  ① 写 diag 启动日志；② `reqboard_status` 回执新增声明字段 `plugin_build`
  （schema 同步——按 REQ-261003204143-3219 的三方同源纪律：先改 schema 再改回执）。
  陈旧判据：指纹 ≠ 仓库当前 dist 指纹时，看板/回执如实显示（不自动重载）。

**验证设计**：复现用例绿 + status 回执含指纹字段且过自身 schema。

## FR-4 · 死代码清偿 `serves: FR-4`

**删除清单**（FR-2 移植完成后执行）：`use-cases/StartSubtaskChain.ts`、
`internal/background-runner.ts`、`internal/checkpoint-manager.ts`、`internal/batch-scheduler.ts`，
及其专属测试 `tests/unit/{start-subtask-chain,background-runner,batch-scheduler}.test.ts`。
`domain/checkpoint.ts` 与 `DshJobsAdapter` 删除前先全仓 grep，有引用则保留并登记理由。

**验证设计**：`grep -rn` 四符号零命中 + tsc 无新错 + `pnpm test` 失败数 ≤ 基线 98。

## FR-5 · N-1 死窗口不再静默停摆 `serves: FR-5`

**问题**：wake 端口"受理即算成功"（恒返 true）——绑定窗口已死也照刷 `lastWakeAt`、
`driverHealth=healthy`，需求永远停在原地（实测 armed 两分钟 roundsInStage 恒 0）。

**设计**：
- wake 受理前加**活性校验**：绑定窗口 id 能在 agents 注册表解析到 live agent 才受理
  （只读依赖，经端口注入，application 层不直接碰宿主）。
- 叫不动 → 不刷 `lastWakeAt`、`driverHealth=paused`（复用既有「停下等人」语义，零新字段）、
  需求评论留诊断（窗口码 + 失败原因 + 时间）。
- 恢复沿用既有通道：`armExplicit`（人按「继续」）/ `recoverHealth`（窗口复活后心跳后置）。

**验证设计**：死窗口桩 → wake 返回不受理 + paused + 诊断留痕；活窗口 → 行为同现状。

## FR-6 · N-2 绑定改写必须留痕 `serves: FR-6`

**设计**：
- 收编 `sourceSessionId` 的全部写入点到**单一留痕助手**（`bindWindowToRequirement`）：
  每次变更写评论（actor/at/from 窗口/to 窗口）+ statusHistory 不动。
- 静态断言（layer-boundary 同款思路）：`src/` 内对 `sourceSessionId` 的直接赋值
  只允许出现在该助手文件（防新写入点绕开留痕）。
- 显式改绑能力：看板/工具入口「改绑到本窗口」（**仅人发起**，与 armExplicit 同纪律；
  agent 调用代码级拒绝）——把 N-2 里"仓外脚本改写"的正当需求给一条有留痕的活路。

**验证设计**：改绑用例断言留痕字段齐备；静态断言用例红绿演练（临时在别的文件加一处赋值 → 红）。

## FR-7 · N-3 催办聚合 + 成组确认 `serves: FR-7`

**设计**：
- 催办聚合：`notifyArtifactRegistered` 侧按（requirementId, kind）合并同 kind 待确认为**一条**
  催办（「N 份 task_detail 待确认」），不再逐份弹。
- 成组确认：`artifact-gates.ts` 目前仅 `design` 成组确认——把 `task_detail` / `task_output`
  纳入同一成组机制（一次确认 = 该 kind 全部落章）；确认回执如实列出落章清单。
- 不改确认门语义：仍需人点，只是人从「点 39 次」变「点 1 次」。

**验证设计**：登记 5 份 task_detail → 1 条催办；一次成组确认 → 5 份全 confirmed；
design 既有成组用例零回归。

## 分批（一次只改一类） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 批 | 卡 | 内容 | 独立验证 |
|---|---|---|---|
| 1 | t1 | FR-1 锁续租 | 假时钟三用例 |
| 2 | t2 | FR-2 真并行（含写集移植） | 重叠/串行/失败语义用例 |
| 3 | t3 | FR-3 复现 + 构建指纹 | 复现用例 + status 回执 |
| 4 | t4 | FR-4 删死代码（depends t2） | grep 零命中 + tsc |
| 5 | t5 | FR-5 wake 活性（Dive 域） | 死/活窗口用例 |
| 6 | t6 | FR-6 绑定留痕 + 改绑入口 | 留痕 + 静态断言演练 |
| 7 | t7 | FR-7 催办聚合 | 聚合 + 成组用例 |
| 8 | t8 | 全量回归 + 契约文档更新（automation-chain-contract §5 摘缺口） | pnpm test ≤ 基线 |

批间边界：t1/t2 同文件但不同类（锁语义 vs 调度语义），按两张卡顺序做、各带独立验证；
t4 必须晚于 t2（写集逻辑先移植再删壳）；t5/t6/t7 三个域互不依赖。

## 风险与根因候选 `serves: FR-2, FR-3`

| 风险 | 对冲 |
|---|---|
| FR-3 复现若仍丢 → 根因候选：① 批准路径存的是 snake 投影 ② 分片存储 round-trip 丢键 ③ 某入口绕过 landApprovedPlan | 复现用例按真实路径逐段插桩，一次定位到段 |
| FR-2 并行后跨卡写同一文件（写集声明说谎） | 保守默认（未声明=串行）+ 既有 detectCrossCardOverwrite 运行期防线不动 |
| FR-1 心跳写锁放大 revision | 心跳仅在值变化时落盘（lockAt 本就变，接受）；revision 推高频率 30s/次，与既有心跳同档 |
