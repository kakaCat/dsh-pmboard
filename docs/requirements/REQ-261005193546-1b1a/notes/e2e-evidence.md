# 端到端证据清单（REQ-261005193546-1b1a · 卡 t-848a93 / t13）

> 用途：把「已取消卡退出视图与分母」这条需求的**逆验证矩阵**与端到端读数串成**一份可复核清单**——
> 每条都给「命令 + 原始输出摘要 + 判据文件路径」，供验收材料直接引用。
> 纪律：**失败要响亮**；做不到 / 不适用的项如实写，不用"看起来没问题"顶替证据。
> 全部命令都在工作区根（`/Users/mac/Documents/ai/dsh/dsh-pmboard`）执行；跑 `canceled` 组期间不要改 `src/**`（见 §5 并发提醒）。

## 0. 一条命令复现（验收复核从这里开始）

| # | 命令 | 期望 | 本轮实得 |
|---|---|---|---|
| 0.1 | `npx tsx scripts/reverse-drill-matrix.mts --group canceled` | exit 0，14 条逐条「改坏 → 判据红 → 已还原（sha256 一致）」 | **exit 0**；14/14 ✅；每条 `点名命中` + `已逐字节还原，sha256 复核一致`；末行 `[通过]` |
| 0.2 | `npx tsx scripts/reverse-drill-matrix.mts --group canceled --json` | 输出可 `JSON.parse`，含 14 条 | **exit 0**；`JSON.parse` 成功；`group=canceled`、`allOk=true`、`count=14`、`expectedCount=14`、`sourceAnchorCount=2`、`results.length=14`、14 条 `restored=true`、退出码集合 `{1}` |
| 0.3 | `npx vitest run tests/canceled-reverse-drill-coverage.test.ts` | 全绿，且断言条目数 `=== 14` | **7 passed**（条目数 / target 集合 9 文件 / 判据文件存在 / 判据类型 / 改坏点非空 / `git checkout` 0 命中 / 范围自检与 vitest 守卫） |
| 0.4 | `grep -c 'git checkout' scripts/reverse-drill-matrix.mts` | 命中 `=== 0` | **0**（`grep` 退出码 1 = 无命中；脚本注释里的历史事故也改写为「按路径检出的还原命令」以免误命中） |
| 0.5 | `pnpm typecheck` | exit 0 | **exit 0**（`tsc --noEmit -p tsconfig.json`；矩阵脚本已被用例 import ⇒ 也进了类型检查图，`--listFiles` 命中 1 次） |
| 0.6 | 范围自检：把 C12 的 `target` 临时改成 `src/client/stage-panel-NOT-EXIST.ts` 后跑 0.1 | **exit 1**，不进入演练 | **exit 1**；`[范围自检失败] 所选组有 target 不在盘上…`+`· C12 → src/client/stage-panel-NOT-EXIST.ts`；**零演练输出**（未改任何文件）；脚本随即按 sha256 还原（`a8b8f84f83f7…` 前后一致） |
| 0.7 | 反查覆盖度用例（把 C12 的 `target` 改成同一条不存在路径后跑 0.3） | 必红 | **1 failed**：`② 每条的 target 都在盘上，且 target 集合 === 实施说明点名的 9 个文件（不多不少）` |
| 0.8 | `git status --porcelain src/` 与开工前快照逐行比对 | 逐行一致（证明逐字节还原、且本卡没把 `src/**` 改动留在工作区） | **一致**（`diff` 空；两侧均 148 行——这 148 行是**开工前就存在**的其它窗口未提交改动，本卡一行没加） |
| 0.9 | 独立复核 9 个 target 的 sha256（不经脚本） | 与脚本打印的还原后缀一致 | **9/9 一致**（见 §3 表） |

> 本清单记录的实跑对应脚本版本：`scripts/reverse-drill-matrix.mts` sha256 = `a8b8f84f83f756d4ed03ed6460f77783f77a1058a1896628433a29876f7e148c`（前 12 位 `a8b8f84f83f7`）；`--group canceled` 与 `--group canceled --json` 两个变体在**同一版本**上各跑一遍，结果一致（exit 0 / 14 条）；§0 的 0.6 / 0.7 两条破坏性检查也在这同一版本上复跑（改坏点临时改路径 → 还原后 sha 仍是上值）。

## 1. 逆验证矩阵 14 条（改坏点 → 判据 → 结果）

**判据类型**：`behavior` = 行为断言真的会红；`source-anchor` = 改坏与修复**行为等价**、行为断言抓不住，
**只有源码锚点会红**（引用时不得当成行为断言的覆盖力）。

| # | 类型 | 改坏点（真改工作区文件） | 判据文件 | 结果 |
|---|---|---|---|---|
| C1 | behavior | `QueryStageDetail.assemble()` 的活卡收敛**整段改直通**（`liveLedger = ctx.ledger` / `liveCtx = ctx`，= 改前真实行为） | `tests/canceled-projection-single-source.test.ts` | exit 1，红例 5，点名 `拆分 body：tasks === 106 且取消卡条数 === 0` |
| C2 | **source-anchor** | 基类收敛改回 `ctx.ledger.tasks.filter(t => t.status !== 'canceled')`（**行为等价**） | `tests/canceled-projection-single-source.test.ts` | exit 1，红例 1，点名 `基类 assemble() 的活卡收敛用的是 liveTasksOf` |
| C3 | **source-anchor** | 拆分 / 实施两个 body **各自手写**一遍取消 filter（基类不动） | `tests/live-tasks-single-source.test.ts` | exit 1，红例 1，点名 `基线之外的新手写命中 === 0` |
| C4 | behavior | `QueryDag` 退回 `buildDagNodes(tasks, 落盘 layer 索引)`（全量 + 转发历史派生值） | `tests/canceled-projection-single-source.test.ts` | exit 1，红例 3，点名 `节点数组 === 106，每张活卡 layer === liveLayers(台账) 且 === 手算链号` |
| C5 | behavior | `handleState`：`const live = liveTasksOf(tasks)` → `const live = tasks` | `tests/canceled-ready-unlock.test.ts` | exit 1，红例 1，点名 `⑤ /state 载荷本身：tasks 只含活卡…` |
| C6 | behavior | `handleState` 的 ready 退回改前「只认 done」的手写筛（不再走单点现算） | `tests/canceled-ready-unlock.test.ts` | exit 1，红例 3，点名 `①②③⑤ 四处集合逐元素相等…` |
| C7 | behavior | `shared/protocol.readyTasks` 退回改前的 `doneIds` 实现 | `tests/live-tasks-ready-single-source.test.ts` | exit 1，红例 2，点名 `readyTasksOf / readyTasks / computeReady 输出逐字相等，且都含 t-l` |
| C8 | behavior | `computeReady` 退回 `task.status !== 'todo'` + `byId.get(dep)?.status === 'done'` | `tests/canceled-ready-unlock.test.ts` | exit 1，红例 2，点名 `①②③⑤ 四处集合逐元素相等…` |
| C9 | behavior | V-5 假就绪判据退回 `byId.get(dep)?.status !== 'done'` | `tests/live-tasks-ready-single-source.test.ts` | exit 1，红例 2，点名 `validateQueueFile：passed === true，且 issues 里没有 V-5` |
| C10 | behavior | V-5「漏就绪」那条 `add(...)` 去掉 `'warning'`（退回 issue） | `tests/canceled-legacy-read.test.ts` | exit 1，红例 3，点名 `读取路径给出 ≥ 1 条 warning，且「漏就绪」以 warning 级上报（两档的第一档）` |
| C11 | behavior | 读取路径插回改前 `if (!validateQueueFile(onDisk).passed) return undefined`（整条判不可用） | `tests/canceled-legacy-read.test.ts` | exit 1，红例 1~2（两次实跑 1 / 2；**点名那条恒定**），点名 `对象根但内容不合规（字段全缺）→ 宽容返回，不抛错` |
| C12 | behavior | 客户端 `topoLevels` 的 `byId` 由活卡集合退回**全量**（剪边失效 ⇒ 幽灵前置复活） | `tests/canceled-layer-parity.test.ts` | exit 1，红例 3，点名 `A（唯一前置已取消）的层号 === 0，不是 1…` |
| C13 | behavior | 阶段详情 `artifacts` 换回 `artifactsForStage(req, this.stage)`（追溯链 26 个取消卡节点复活） | `tests/canceled-hidden-view.test.ts` | exit 1，红例 5，点名 `装配出口：取消卡名下的 tasks/<id>.md === 0 条…` |
| C14 | behavior | `syncRTMYamlWithSnapshot` 顶部 `liveTasksOf(tasks)` → `tasks`（只接一个 RTM 入口） | `tests/rtm-yaml-live-tasks.test.ts` | exit 1，红例 2，点名 `① 同标本两入口读数逐字段相等：分母 106 / 100% / 通过 / 0 缺口…` |

### 1.1 原始输出摘录（`--group canceled`，逐条 4 行：判据退出码 / 还原 / 证据）

```
✅ [C1] 阶段详情基类收敛整段删掉（改前真实状态：各 body 直接吃全量台账）
     退出码 1（期望 1） ｜ 红例 5（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（2641e43466d3…）
     证据：× ① 阶段详情：取消卡不进任何 body（基类一次收敛） > 拆分 body：tasks === 106 且取消卡条数 === 0
✅ [C2] 阶段详情基类收敛改回行为等价的手写 filter（行为抓不住，源码锚点必红）
     退出码 1（期望 1） ｜ 红例 1（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（2641e43466d3…）
     证据：× ⑤ 逆验证锚点：收敛必须落在单点上（否则本文件必红） > 基类 assemble() 的活卡收敛用的是 liveTasksOf（改回手写 filter ⇒ 本用例红）
✅ [C3] QueryStageDetail 两个 body 各自手写 filter（对照 C1 的整段删除：行为不红、源码锚点红）
     退出码 1（期望 1） ｜ 红例 1（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（2641e43466d3…）
     证据：× ⑤ 新增即红：实测命中集合 ⊆ baseline > 基线之外的新手写命中 === 0（失败时点名 文件 + 行号 + 行原文）
✅ [C4] QueryDag 节点数组退回全量 + 转发落盘 layer（掉层与 132 张一起复活）
     退出码 1（期望 1） ｜ 红例 3（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（d7347f6e3b97…）
     证据：× ② DAG：节点数组过活卡、层号现算（INV-1 / INV-5 ③） > 节点数组 === 106，每张活卡 layer === liveLayers(台账) 且 === 手算链号
✅ [C5] handleState 去掉 tasks 收敛（取消卡重回 /state 载荷）
     退出码 1（期望 1） ｜ 红例 1（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（9eebdbd55140…）
     证据：× REQ-261005193546-1b1a TC-3：五处就绪判定都含 A（唯一前置已取消的那张），四处集合两两相等 > ⑤ /state 载荷本身：tasks 只含活卡、ready[reqId] 含 A，且容器里没有取消态行
✅ [C6] handleState 去掉 ready 现算（退回改前「只认 done」的手写筛）
     退出码 1（期望 1） ｜ 红例 3（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（9eebdbd55140…）
     证据：× REQ-261005193546-1b1a TC-3：五处就绪判定都含 A（唯一前置已取消的那张），四处集合两两相等 > ①②③⑤ 四处集合逐元素相等，且 === {A, PLAIN}；取消卡一张都不进 ready
✅ [C7] shared readyTasks 退回只认 done（改前实现逐字复活）
     退出码 1（期望 1） ｜ 红例 2（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（69317ab56682…）
     证据：× 三处就绪判定同源：同一标本逐字相等（FR-1 / D-8） > readyTasksOf / readyTasks / computeReady 输出逐字相等，且都含 t-l
✅ [C8] computeReady 退回只认 done（写路径判据与读侧再次分叉）
     退出码 1（期望 1） ｜ 红例 2（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（da5c3b097a5a…）
     证据：× REQ-261005193546-1b1a TC-3：五处就绪判定都含 A（唯一前置已取消的那张），四处集合两两相等 > ①②③⑤ 四处集合逐元素相等，且 === {A, PLAIN}；取消卡一张都不进 ready
✅ [C9] V-5 假就绪退回只认 done（刚按新口径写出的 ready[] 被自己判成假就绪）
     退出码 1（期望 1） ｜ 红例 2（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（c97d40df3aaa…）
     证据：× 写盘校验：新语义载荷不被 V-5 判成假就绪（同批改的理由） > validateQueueFile：passed === true，且 issues 里没有 V-5
✅ [C10] V-5「漏就绪」从 warning 退回 issue（存量陈旧 ready[] 把队列判成没有任务）
     退出码 1（期望 1） ｜ 红例 3（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（c97d40df3aaa…）
     证据：× 旧分片读取：读侧宽容 + 内存重算（FR-6 / migration §风险 ④） > 读取路径给出 ≥ 1 条 warning，且「漏就绪」以 warning 级上报（两档的第一档）
✅ [C11] 读取路径把校验失败退回 return undefined（改前形态：不宽容 ⇒ 队列被判不可用）
     退出码 1（期望 1） ｜ 红例 2（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（eaea3596dd29…）
     证据：× 读路径绝不抛错 + 宽容的边界（别把降级变成崩溃 / 别把垃圾交给上层） > 对象根但内容不合规（字段全缺）→ 宽容返回，不抛错
✅ [C12] 客户端 topoLevels 去掉剪边（byId 退回全量 ⇒ 幽灵前置把活卡抬一层）
     退出码 1（期望 1） ｜ 红例 3（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（0f98a07e2703…）
     证据：× REQ-261005193546-1b1a TC-2：三处层号同台比对（服务端 / 手工删边重算 / 客户端 topoLevels） > ① 三处逐卡相等；A（唯一前置已取消）的层号 === 0，不是 1；A 仍在活卡集合里
✅ [C13] 阶段详情 artifacts 换回 artifactsForStage（追溯链 26 个取消卡节点复活）
     退出码 1（期望 1） ｜ 红例 5（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（2641e43466d3…）
     证据：× ⑦ 追溯链不出现取消卡：阶段详情产物投影按活卡口径剔卡（FR-5 / A3） > 装配出口：取消卡名下的 tasks/<id>.md === 0 条；活卡 106 条**逐 id**一条不少（防一刀切删空）
✅ [C14] 只接一个 RTM 入口（syncRTMYamlWithSnapshot 不剔卡 ⇒ 看板三条路由漏接）
     退出码 1（期望 1） ｜ 红例 2（期望 ≥1） ｜ 点名命中
     还原：已逐字节还原，sha256 复核一致（2d6235ee403e…）
     证据：× 两个 RTM 公开入口收敛为活卡（t4） > ① 同标本两入口读数逐字段相等：分母 106 / 100% / 通过 / 0 缺口（返回体与盘上 YAML 同源）
canceled 组：14 条（其中源码锚点 2 条——行为等价、只有源码锚点会红，引用时不得当成行为断言的覆盖力）

[通过] 所选组全部演练如预期变红，且每一处的还原都过了 sha256 核对。
```

## 2. 判据文件路径清单（本矩阵用到的全部判据）

| 判据文件 | 承载的条目 | 说明 |
|---|---|---|
| `tests/canceled-projection-single-source.test.ts` | C1 / C2 / C4 | 阶段详情基类收敛、DAG 节点数组与层号（含第 ⑤ 组源码锚点） |
| `tests/live-tasks-single-source.test.ts` | C3 | 全仓「新增手写即红」+ 收编点复读（点名文件 + 行号 + 行原文） |
| `tests/canceled-ready-unlock.test.ts` | C5 / C6 / C8 | 五处就绪判定同源、`/state` 载荷、展示面可开工 |
| `tests/live-tasks-ready-single-source.test.ts` | C7 / C9 | 三处就绪判定同源、写盘校验不被 V-5 判成假就绪 |
| `tests/canceled-legacy-read.test.ts` | C10 / C11 | 读侧宽容（陈旧 `ready[]` 不把队列读空）+ V-5 两档（漏就绪 warning / 假就绪 issue） |
| `tests/canceled-layer-parity.test.ts` | C12 | 三处层号同台比对（服务端 / 手工删边重算 / 客户端 `topoLevels`） |
| `tests/canceled-hidden-view.test.ts` | C13 | 追溯链剔卡（服务端产物投影，26 → 0） |
| `tests/rtm-yaml-live-tasks.test.ts` | C14 | 两个 RTM 公开入口同分母（看板三条路由直调入口 ②） |
| `tests/canceled-reverse-drill-coverage.test.ts` | —（矩阵自身的结构判据） | 条目数 14 / target 集合 / 判据文件存在 / 判据类型 / `git checkout` 0 命中 |
| `scripts/reverse-drill-matrix.mts` | —（矩阵本体） | `--group canceled` 的 14 条定义、`--json`、范围自检、并发写入检测、sha256 还原 |

## 3. 逐字节还原凭据

脚本对每条 `file` 模式演练都做：**读入备份（含 sha256）→ 写坏 → 跑判据 → 写回备份 → 与备份 sha256 比对**；
若演练期间该文件被别的窗口改写（当前内容 ≠ 我们写下的坏版本）**放弃还原并中止**（绝不覆盖他人改动）。
下表的 sha256 由**脚本之外**的命令独立复核（`shasum -a 256`）：

| 改坏目标 | 独立复核 sha256（前 12 位） | 脚本打印的还原后缀 |
|---|---|---|
| `src/application/query/QueryStageDetail.ts` | `2641e43466d3` | `2641e43466d3…` ✅ |
| `src/application/query/QueryDag.ts` | `d7347f6e3b97` | `d7347f6e3b97…` ✅ |
| `src/http/routers/stages.ts` | `9eebdbd55140` | `9eebdbd55140…` ✅ |
| `src/shared/protocol.ts` | `69317ab56682` | `69317ab56682…` ✅ |
| `src/domain/queue/topology.ts` | `da5c3b097a5a` | `da5c3b097a5a…` ✅ |
| `src/domain/queue/validateQueue.ts` | `c97d40df3aaa` | `c97d40df3aaa…` ✅ |
| `src/repositories/QueueRepository.ts` | `eaea3596dd29` | `eaea3596dd29…` ✅ |
| `src/client/stage-panel.ts` | `0f98a07e2703` | `0f98a07e2703…` ✅ |
| `src/application/internal/rtm-yaml.ts` | `2d6235ee403e` | `2d6235ee403e…` ✅ |

外加两道闸（0.8 / 0.9）：

- `git status --porcelain src/` 与开工前快照**逐行一致**（diff 空）⇒ 本卡没在 `src/**` 留下任何改动；
- 全仓**禁用** `git checkout` 类还原（0.4 = 0 命中）——2026-10-04 事故（把多个窗口的未提交改动一起回退）的防线。

## 4. 两条限定语（引用本需求读数时必须一起引用）

### 4.1 追溯读数只对「**新触发过 RTM 的需求**」成立

按活卡口径的**追溯**（RTM YAML 里的 `task_to_tests` / 覆盖度分母）是**触发时写下的派生快照**：
它由 `syncRTMYaml` / `syncRTMYamlWithSnapshot` 这两个公开入口在触发那一刻按活卡收敛写出。
因此，**存量需求**若在本需求上线后**再没触发过 RTM**，它的追溯读数可以仍然停在含取消卡的旧快照上
（实证：`rtm-implementing.yml:8` = 132、`rtm-accepting.yml:1451` = 106）——这是**接受的已知边界**，
不是未修完的缺陷：

- **不回填、不重写**（FR-6 零写回：读一遍存量目录不产生任何写盘）；
- 本需求**不主动重算**任何需求的历史快照（主动重算会大面积改写派生文件与审计面）；
- **自愈路径**：该需求**下一次触发 RTM 就会按新口径重写**，读数即与活卡一致。

一句话：**追溯读数按活卡只对「新触发过 RTM 的需求」成立**；判据（`tests/rtm-yaml-live-tasks.test.ts`、
`tests/canceled-four-faces.test.ts`）只对**真触发过**的标本断言数值，对存量标本只断言
「不出现取消卡行 / 不泄漏进其余三面」。其余三面（DAG 分层 / 甘特 / 卡面计数）走 `/state` 或本地现算，
**不受此限定语影响**。

### 4.2 落盘 `layer` 与 `liveLayers` 允许不一致（**刻意差异**）

队列文件里的 `tasks[].layer` / `layers` 是按**全量节点**（含取消卡）算的历史派生值；
读路径与显示侧一律用 `liveLayers`（= `computeLayers(layerInputOf(tasks))`，删掉指向取消卡的边后重算）**现算**。
两者**允许不等**，这是**刻意差异**（设计 §关键决策 B 方案 + migration §与常规做法的差异）：

- 落盘值**仅历史派生值**，不参与任何显示读数（判据：`tests/canceled-projection-single-source.test.ts`
  断言「落盘 layer 仍是全量口径 ⇒ 现算值不等于转发值」；`tests/canceled-layer-parity.test.ts` 用同一份台账
  给出可分辨的两组层号）；
- 为什么不去同步写回：写回存量队列会引入迁移与审计风险，与 FR-6「不回填、零迁移」直接冲突
  （`QUEUE_VERSION` 1 / `REQBOARD_SCHEMA_VERSION` 9 一字不动）；
- 代价如实登记：**看到落盘 `layer` 与界面上层号不一致是预期行为**，不是 bug。

## 5. 假红防线与已知边界（如实声明）

1. **C2 / C3 是源码锚点，不是行为断言**：这两条的改坏与修复**行为等价**（读数一字不差），
   行为用例全绿，红的是源码锚点（`liveTasksOf(` 在位、以及「基线之外的新手写命中 === 0」）。
   脚本把 `criterion` 打进正常输出与 `--json`，覆盖度用例第 ④ 条把它钉死——
   **不得把这两条算成"行为断言守住了收敛点"**。
2. **C6 的实测备注**：只把 `handleState` 的调用换回 `readyTasks(tasks, r.id)` **不足以变红**
   （`readyTasks` 已是 `liveReadyTasks` 的薄封装 ⇒ 判据已收敛）；故 C6 退回的是**判据本身**
   （手写 `dep.status === 'done'`）。这条备注反过来证明"单点收敛"是有效的：改调用点改不掉口径。
3. **C11 的适用范围**：读取路径退回改前那句后，**只有「落盘视图本身就不通过」的标本**变红
   （`对象根但内容不合规`）；陈旧 `ready[]`（漏就绪 = warning）在分档后 `passed === true`，
   它那一档由 C10 负责。两条合起来覆盖「读侧宽容 + V-5 两档」。
4. **观察到的既有测试脆弱性（不属于本卡范围，仅留痕）**：`tests/canceled-legacy-read.test.ts` 的
   `畸形 JSON：null / 数组 / 标量根 → undefined…` 在**先跑「零写回」那一组**之后、且
   `QueueRepository.load` 被改坏时才失败（单跑该 describe 或整文件原始态均绿）。
   **同一条 C11 两次实跑的红例数因此是 1 / 2**（`内容不合规` 恒定红、`畸形 JSON` 时红时绿）。
   本矩阵因此把 C11 锚在确定性的 `对象根但内容不合规…` 上，不引用该行；覆盖度用例也只看「点名命中」，不看红例数。建议另立小卡排查该用例的跨组状态耦合。
5. **并发提醒（工作树是多窗口共享的）**：跑 `--group canceled` 期间会对 §3 的 9 个文件做**短暂的**
   真实改坏。脚本已带并发写入检测（他人改过就不回写、立即中止）。本轮期间**台板侧**（`queue.json` /
   `rtm-*.yml` / `tasks/*.yml`，01:28:35）被别的窗口写过——与本卡无关，本卡一行没碰 `docs/requirements/**`
   的既有文件。
6. **不覆盖的项**：`cardDoc` 打开卡文档（C-9）、`layer-boundary` / `size-budget` 两条基线本就红的门禁
   （与本需求无关，见设计 §边界）。

## 6. 与设计不一致 / 需拍板的点（证据侧留痕）

1. **`design/architecture.md` §逆验证清单是 14 条，本卡实施说明也是 14 条，但两串 14 条不是同一串**：
   设计清单里的 `board-mount.ts:563` 去掉过滤 / `isLiveTask` 改成看三字段 / 界面重新引入 `canceled` 档位 /
   读取落盘 `ready[]` 这 **4 条未进本矩阵**；本矩阵改用了实施说明点名的
   **①「基类收敛整段删掉」（改前真实状态）** 与 **⑬「`artifacts` 换回 `artifactsForStage`（追溯链泄漏复活）」**。
   本卡按实施说明的编号落地（条目数 14 与覆盖度用例的 `=== 14` 一致）。
   **需拍板**：是否把这 4 条补成 15~18 条（那会把覆盖度用例的 `=== 14` 断言同步改掉），
   或确认它们已由 t8 / t9 / t12 的常驻用例覆盖、不必进矩阵。
2. **C2 / C3 的"必红"性质**与其它 12 条不同（源码锚点），已在脚本、覆盖度用例与本文件三处标出；
   验收材料引用 14 条时**请连同「其中 2 条是源码锚点」一起引用**。
3. **`--group` 默认仍是 `hard`**（未改成 `canceled`）：默认组是上一张已归档卡（REQ-3b02）的交付物，
   改默认会动到那条需求的验收复现命令。本卡命令一律显式 `--group canceled`，未动默认值。
