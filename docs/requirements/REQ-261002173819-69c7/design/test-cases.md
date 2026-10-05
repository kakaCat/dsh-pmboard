---
serves: FR-1, FR-2, FR-3, FR-4
---

# 测试策略与用例（四类断言 · 七条命令） serves: FR-1, FR-2, FR-3, FR-4

> 本需求全部改动都在**错误路径**与**显式人工入口**上，因此测试的全部价值在于：把"错误路径真的走了、并且走对"钉死。正常路径靠既有回归兜底。

## 策略 serves: FR-1, FR-2, FR-3, FR-4

| 层 | 手段 | 覆盖 |
|----|------|------|
| 应用层单测 | 注入**必失败的 Jobs 端口** / **记录 owner 的 Jobs 端口**，直接调 `advanceRequirement` | FR-1、FR-2 |
| 纯函数/变更器单测 | 直接调 `armExplicit`、`dispatchOwnerOf` | FR-2、FR-3 |
| 路由级单测 | `createReqboardHandler` + 假 req/res（与 `board-plan-approve.test.ts` 同款）打 `POST /req/autorun` | FR-3 |
| 结构性质测试 | 扫 `src/tools/**` 源码，断言**每个工具都声明 `output.render`** | FR-4 |
| 回归 | `pnpm test` 与基线比对（失败数 ≤ 106） | 全部 |

三个"必须有"的测试纪律：① 失败注入端口必须**真的被调用过**（断言 `start` 调用次数 ≥ 1，防"没走到投递就绿"）；② 断言里不得只看 `dispatched`，必须同时看**台账**（锁是否回收）；③ 性质测试要有"守卫本身可变红"的证据（临时插一个无 render 的工具 → 用例变红）。

## FR-1 / FR-2 用例：`tests/advance-dispatch-owner.test.ts`（新增） serves: FR-1, FR-2

夹具：`makeHarness()`（`tests/application/harness.ts`）+ 自建 Jobs 端口三种：

```ts
const thrower: JobsPort = { available: () => true, get: async () => null,
  start: async () => { throw new Error('session "[object Object]" has no live agent (background job owner must be live)') } }
const recorder: JobsPort = { available: () => true, get: async () => null,
  start: async (spec) => { seen.push(spec); return 'job-1' } }
```

| # | 用例 | 断言 | 对应需求断言 |
|---|------|------|--------------|
| D-1 | 投递抛错 → 锁被回收 | `out.dispatched === false`；`out.stopped === 'dispatch_failed'`；台账 `advance.lockAt === undefined` 且 `advance.runId === undefined` | A1 |
| D-2 | 失败后立刻可重试 | 继 D-1 把 `deps.jobs` 换成 `recorder` 再调一次 → `dispatched === true` 且拿到 `job_id` | A1 |
| D-3 | 失败原因可读 | 台账新增一条 `advance.history`：`event==='DISPATCH_FAILED'`、`outcome==='failed'`、`detail` 含 `owner_unresolvable`；新增 comment 正文含 requirementId 且**不含 `[object Object]`** | A2 |
| D-4 | owner 传的是 id 不是对象 | `recorder` 捕获的 `spec.owner === 'session-8c9338a3'`（字符串），且 `typeof === 'string'` | A2 |
| D-5 | owner 取不到 → unowned 投递 | `exec = {}` → 捕获 `spec.owner === undefined` 且 `out.dispatched === true`（**不降级同步、不报错**） | A3（修正后语义） |
| D-6 | `dispatchOwnerOf` 与 `agentIdOf` 同源 | 对 `{id}` / `{session:{id}}` / `{}` / `null` 四种输入，两函数返回值逐例相等 | A2 |
| D-7 | 不误清别人的锁 | 台账锁属于**另一个** runId（新鲜）→ 走 `locked` 早退分支，`runId` 原样保留 | A1 的反向保护 |

`deps.jobs` 未装配的分支不新增用例（既有 `advance-stale-lock.test.ts` 已覆盖同步路径）。

## FR-3 用例：`tests/dive-rearm.test.ts`（扩写）+ `tests/reqboard/autorun-rearm.test.ts`（新增） serves: FR-3

`armExplicit` 行为矩阵逐格一条（沿用该文件既有的 `makeReq` / `repoOf` 夹具）：

| # | 进入形态 | 断言 |
|---|----------|------|
| R-1 | `disarmed + idle`（= 人 clear_pause） | 返回 `true`；`activation==='armed'`、`phase==='active'`；新增 comment 含 `[Dive 重新武装]` 且 `createdBy.kind==='human'` |
| R-2 | 幂等：已是 `armed` + healthy | 返回 `false`；`version` 不变（零写入） |
| R-3 | `driverHealth=paused`（reason=`wake-undeliverable`） | 返回 `true`；`driverHealth.state==='healthy'`、`attempts===0` |
| R-4 | `driverHealth=paused`（reason=`round-limit:implementing`） | 返回 `true`；额外 `roundsInStage===0` |
| R-5 | `dialogInFlight===true` | 返回 `false`；台账零写入（**不越权**） |
| R-6 | 自动路径仍不碰 `disarmed+idle` | `recoverHealth(...)` 对该形态返回 `false` 且零写入（既有行为不能被本次改坏） |
| R-7 | 武装后即可驱动 | `isDrivableRequirement(after) === true`，且 `createWakeHeartbeat` 的 `isStalledWake(after, now) === true`（下一拍即会被叫醒） |

路由级（新文件，同 `board-plan-approve.test.ts` 的假 req/res 写法）：

| # | 请求 | 断言 |
|---|------|------|
| R-8 | `POST /req/autorun {id, on:true}` 打向 `disarmed+idle` 需求 | 响应 200；台账 `activation==='armed'`；响应体键集合与改动前**逐键相同**（不新增返回键）；`advanceNote` 文案含「已重新武装」 |
| R-9 | `POST /req/autorun {id, on:false}` | 行为逐字不变（`autoRun=false`、`pausedReason='manual'`），**不改** `dive` 任何字段 |

## FR-4 用例：`tests/tools-render-coverage.test.ts`（新增）+ `clear-pause-lossless` 扩写 serves: FR-4

| # | 用例 | 断言 |
|---|------|------|
| T-1 | 全工具渲染覆盖（性质） | 扫 `src/tools/*/`*`Tool.ts`：凡出现 `defineTool(` 的文件必须出现 `render:`；白名单只有 `TaskExecuteTool.ts`（委托别名，运行时继承），且白名单带注释说明原因 |
| T-2 | 守卫可变红（自测） | 用同一扫描函数扫一份内存里的"缺 render"样例源码 → 断言报出该文件（防扫描器失效导致假绿） |
| T-3 | clear_pause 首行可读 | 对 `ClearPauseTool` 的 `output.render(args, value)` 输出：`[0].text` 首行为中文摘要（含 `REQ-`），第二段是合法 JSON 且含四键 |
| T-4 | 副作用与回执一致 | 调 `clearPause` 用例后：返回 `success===true`、`previous_activation==='armed'`，且台账 `activation==='disarmed'`、`phase==='idle'`（回执与台账不打架） |

## 既有测试的行为变更（必须显式声明） serves: FR-2

| 文件 | 变更 | 原因 |
|------|------|------|
| `tests/unit/dsh-jobs-adapter.test.ts:194` | `const owner = { id: 'agent-1' }` → `const owner = 'session-agent-1'`；`expect(captured.owner).toBe(owner)` 不变 | 该用例原本把"透传对象"钉成合同；宿主契约要字符串 id，**这条旧断言正是漏掉线上故障的那条**。改夹具后仍验证"透传不改写"这一真实语义 |
| `tests/dive-rearm.test.ts` 头注释 | "不可恢复的三种有意停手（含 disarmed+idle）" → 补一句"disarmed+idle 仅可由 `armExplicit`（人）恢复" | 语义补充，不删任何既有断言 |

除以上两处，**不得**修改任何既有测试的断言；若发现必须改，按"失败要响亮"在实现卡里逐条登记原因。

## 验收命令 serves: FR-1, FR-2, FR-3, FR-4

```
# ① 目标用例（本次新增 + 扩写）
npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts \
               tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts \
               tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts

# ② 受影响的既有契约（工具 schema / 返回体不许动）
npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts tests/task-run-contract.test.ts

# ③ 类型（C-15：不高于基线 223）
pnpm typecheck

# ④ 全量（C-14：失败数 ≤ 基线 106，且新增用例全绿）
pnpm test

# ⑤ 构建（C-11）
pnpm build

# ⑥ 端到端（人工一次）
#   对 REQ-261002161439-277d 点看板「继续」→ 60s 内读台账：
#   dive.activation=armed / phase=active；dive.roundsInStage 由 0 变 1（Dive 真起轮）

# ⑦ 故障注入（证明守卫非空转）
#   临时新增 src/tools/__probe/ProbeTool.ts（defineTool 且无 render）→ ① 中的 T-1 变红并打印该文件；
#   删除探针后复跑全绿，git status 无残留
```
