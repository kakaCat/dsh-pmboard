---
requirement_refs: [RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8]
---

# 架构设计（REQ-261008020617-088f）

## 目标与总体方案 `serves: RF-1`

**问题**：`tests/layer-boundary.test.ts` 的 application/ 用例 15 处越界恒红（四族，见需求文档「现状」）。

**当前状况**：application/ 里三份同构 RTM 门直接 `fs.readFile(path.join(...))`；`rtm-health` / `diag-log`
直接读写宿主文件；两处用例判定用 `isAbsolute` + `statSync`；Dive Service 外壳（`extends Service`）放在
application/。层门只有禁止项正则，**没有豁免出口** ⇒ 任何一处"当期不修"的越界只能让用例永久红。

**设计方案**：四族各自收敛到"**I/O 落 adapters、application 只经端口或纯函数**"，再给层门补一条
**显式豁免面**（台账 + 理由必填 + 只减不增 + 过期即红）。本次 15 处全部真修，豁免台账落地即为 0 条。

| 族 | 收敛到 | 一句话做法 |
|---|---|---|
| ① 三份 RTM 门 | 端口 `DocRepository`（已存在） | 合并成一份实现 `gate/rtm-gates.ts`，读取走 `docs.read()`；三个旧名字保留为薄壳 |
| ② 宿主态与日志 | 新端口 `HostFsPort` + 新端口 `DiagSinkPort` | `rtm-health` 的同步 I/O 全部经 `HostFsPort`；`diag-log` 变**无 I/O 门面**，文件实现落 `adapters/FileDiagSink` |
| ③ 两处路径判定 | 纯函数 `isAbsolutePath` + `HostFsPort.cwd()/isDirectory()` | 判定语义逐字保留，`node:path` / `node:fs` 从 application 消失 |
| ④ Dive Service | 物理外移到 `src/adapters/` | 外壳（框架耦合）落适配层，application 只留 round 逻辑 |

**不这么做的后果**：这 15 处会继续与"每批结束必须可验证"对抗——门恒红则无人看，下一次重构又会长出
第二批克隆（三份 RTM 门本身就是前一次"红了没人看"的产物）。

## 现状修正（设计阶段勘察，与需求文档/交接底稿不一致处） `serves: RF-4, RF-7`

| 编号 | 需求文档/底稿的说法 | 复核实测 | 处置 |
|---|---|---|---|
| D-4 | 「`diag-log.ts` 在 application/ 里只剩一个引用方（`ReqboardDiveManager`），故只迁移实现即可」 | **6 个** application 文件 import `captureDiag`：`dive/{session-driver,round-driver,ReqboardDiveManager}.ts`、`internal/{capture-section,support}.ts`、`use-cases/ExecuteTask.ts` | 改取**端口门面**方案（本文件 §接口与数据契约）：`diag-log.ts` 留在 application 但**零 I/O**，文件实现落 `adapters/FileDiagSink`。需求文档 RF-4 的原判据「`ls src/application/internal/diag-log.ts` → 不存在」据此**修订为**「`grep -n "node:" src/application/internal/diag-log.ts` → 0 命中；文件 I/O 实现在 adapters」 |
| D-5 | 底稿建议「新增 host state / log port 覆盖 diag-log 与 rtm-health」 | `diag-log` 的落点由组合根绝对路径决定（`dshHomePath(config, CAPTURE_DIAG_REL)`），与任何工作区根无关 ⇒ 不需要"宿主态端口" | 只在 `diag-log` 用**一个 sink 端口**（`DiagSinkPort`），不引入通用宿主态端口 |

（勘察纠正我上一轮自己写进需求文档的一条事实——发现即记在此处并在设计门一并请人确认，
不改已确认的需求文档本体，避免"确认后又改基线"。）

## 模块改动地图 `serves: RF-2, RF-3, RF-4, RF-5, RF-6`

```
  application/（只依赖 domain / shared 类型 / 端口）
    gate/rtm-gates.ts（新·单一实现） ──▶ DocRepository.read()        [族①]
    internal/rtm-health.ts ──────────▶ HostFsPort（新端口）          [族②]
    internal/diag-log.ts（无 I/O 门面）─▶ DiagSinkPort（新端口）      [族②]
    internal/paths.ts（新·纯函数）                                     [族③]
    use-cases/{Capture,Create}Requirement.ts ─▶ HostFsPort.cwd/isDirectory  [族③]
    internal/rtm-yaml.ts / query/QueryState.ts ─▶ HostFsPort（调用方同步改）
                    │
                    │ 端口实现一律落下面
                    ▼
  adapters/（宿主侧实现）
    FileDocRepository（已存在，本需求不动）
    FileHostFs.ts（新）        → node:fs + node:path，根**逐次显式**传入
    FileDiagSink.ts（新）      → 512KB 轮转 + append + console 双写 + 静默容错
    ReqboardDiveManager.ts（迁移）→ 自 application/dive/ 外移（框架 Service 外壳）

  删除：application/gate/{acceptance,design,task-coverage}-gate.ts（三份克隆 → 合并为 rtm-gates.ts）
  保留：application/gate/index.ts（barrel 改指向新模块，旧导出名不变）
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条） | 影响范围 |
|---|---|---|---|---|
| `src/application/gate/rtm-gates.ts` | 新增 | 三份克隆合并为一份 `rtmGateCheck(spec, req, docs)` + 三个同名薄壳 | RF-2 | 3 份单测、`gate/index.ts` |
| `src/application/gate/{acceptance,design,task-coverage}-gate.ts` | 删除 | 内容等价迁入 `rtm-gates.ts` | RF-2 | 同上 |
| `src/application/ports.ts` | 修改 | 新增 `HostFsPort` / `DiagSinkPort`；`UseCaseDeps` 增必填 `hostFs` | RF-3, RF-5 | 5 个 deps 装配点 |
| `src/adapters/FileHostFs.ts` | 新增 | `HostFsPort` 的 node 实现（同步） | RF-3, RF-5 | — |
| `src/application/internal/rtm-health.ts` | 修改 | 去掉 `node:fs`/`node:path`，I/O 经 `host`；纯判据原样保留 | RF-3 | 4 份测试、`rtm-yaml`、`QueryState` |
| `src/application/internal/diag-log.ts` | 修改 | 变为无 I/O 门面：`initCaptureDiag(sink)` / `captureDiag(msg)` | RF-4 | 6 个 application 调用方（**调用点不变**）、组合根、2 份测试 |
| `src/adapters/FileDiagSink.ts` | 新增 | 文件 sink（轮转/append/静默） | RF-4 | — |
| `src/application/internal/paths.ts` | 新增 | 纯函数 `isAbsolutePath`（POSIX + win32 口径） | RF-5 | 2 个用例 |
| `src/application/use-cases/CaptureRequirement.ts` | 修改 | `isAbsolute`→纯函数；`statSync`/`process.cwd()`→`deps.hostFs` | RF-5 | capture 系测试 |
| `src/application/use-cases/CreateRequirement.ts` | 修改 | 同上 | RF-5 | create 系测试 |
| `src/adapters/ReqboardDiveManager.ts` | 迁移 | 自 `application/dive/` 外移，相对 import 重算 | RF-6 | `src/index.ts`、2 份测试 |
| `tests/layer-boundary.test.ts` + `tests/fixtures/layer-boundary-exempt.json` | 修改/新增 | 豁免面（理由必填/只减不增/过期即红），本次台账 0 条 | RF-7 | 门禁自身 |

## 接口与数据契约变更 `serves: RF-2, RF-3, RF-5`

### 新增端口 `HostFsPort`（`ports.ts`） `serves: RF-3, RF-5`

```typescript
/**
 * 宿主文件面端口（同步）——application 不得 node:fs / node:path，一切宿主文件读写经它。
 *
 * 根**逐次显式**（不是构造期绑定）：同进程里每条需求有自己的根（`deps.docs` 是会被别的窗口
 * 改掉的宿主级单例，见 docs/architecture/gate-read-root.md 的两次误拦事故）。绑定单例根 =
 * 把那条事故重新种进类型里，故每个方法都要求调用方给出「这次读/写的根」。
 *
 * 为什么同步：既有调用点分布在同步路径上（syncRTMYamlWithSnapshot 及其 HTTP 调用方），
 * 改异步的爆炸半径远大于一个窄同步口；与 DocRepository 的 exists/list/stat 同步口径一致。
 */
export interface HostFsPort {
  /** 宿主进程 cwd（capture 弹框「宿主默认工作区」哨兵的解析源；**是 process.cwd()，不是任何需求根**）。 */
  cwd(): string
  /** 绝对路径是否为存在的目录（不存在 / 不可读 → false，不抛）。 */
  isDirectory(absPath: string): boolean
  /** `<root>/<relPath>` 是否存在。 */
  exists(root: string, relPath: string): boolean
  /** 读 `<root>/<relPath>` 文本；不存在 / 读失败 → undefined（不抛）。 */
  readText(root: string, relPath: string): string | undefined
  /** 读 `<root>/.dsh-data/state/<name>` JSON；不存在 / 坏文件 → undefined（不抛）。 */
  readStateJson(root: string, name: string): unknown | undefined
  /** 原子写 `<root>/.dsh-data/state/<name>`（临时文件 + rename，目录按需创建；失败抛）。 */
  writeStateJsonAtomic(root: string, name: string, data: unknown): void
}
```

### 新增端口 `DiagSinkPort`（`ports.ts`） `serves: RF-4`

```typescript
/** 诊断日志 sink（REQ-f6307c 的落点由组合根决定，与工作区根无关）。实现必须**永不抛**。 */
export interface DiagSinkPort {
  /** 追加一行（含时间戳由门面加）。任何失败静默——诊断通道不得反过来影响主流程。 */
  write(line: string): void
}
```

### 修改的接口 `serves: RF-2, RF-3, RF-5`

```typescript
// 【族①】Before：三个文件各一份，读盘写死在函数体里
function designGateCheck(req: RequirementRecord, workspaceRoot: string): Promise<GateResult>
function taskCoverageGateCheck(req: RequirementRecord, workspaceRoot: string): Promise<GateResult>
function acceptanceGateCheck(req: RequirementRecord, workspaceRoot: string): Promise<GateResult>

// After：一份实现 + 三个同名薄壳（导出名/返回结构/GateResult 形状不变）
interface RtmGateSpec { field: 'design_refs' | 'task_refs' | 'acceptance_status'; code: string; /* … */ }
async function rtmGateCheck(spec: RtmGateSpec, req: RequirementRecord, docs: DocRepository): Promise<GateResult>
// 薄壳签名：workspaceRoot: string  →  docs: DocRepository
```

**改动原因**：读盘从"函数体里自己 `fs.readFile`"改为"吃注入的文档端口"。
**影响范围与前提纪律**：端口是**宿主级单例**，故调用方必须先按 `docs/architecture/gate-read-root.md`
的唯一收敛入口 `applyRequirementWorkspaceRoot(deps, req)` 校正根，再调门；三个单测用
`new FileDocRepository({ workspaceRoot: tmpDir })` 构造"需求自己的根"来钉住这一点。

```typescript
// 【族②】Before → After（rtm-health：stateDir 字符串换根显式端口）
recordRTMFailure(stateDir: string, reqId, trigger, error)
  → recordRTMFailure(host: HostFsPort, root: string, reqId, trigger, error)
checkRTMHealth(workspaceRoot: string, stateDir: string, req, opts?)
  → checkRTMHealth(host: HostFsPort, root: string, req, opts?)
syncRTMYamlWithSnapshot(workspaceRoot, snapshot, tasks, reqId, trigger, payload?)
  → syncRTMYamlWithSnapshot(host, workspaceRoot, snapshot, tasks, reqId, trigger, payload?)
// 纯函数零改动：expectedRTMFiles / prototypesSectionPresent / prototypeSectionVerdict / PROTOTYPE_RULES_SINCE

// 【族②-日志】Before → After（调用点全部不变，只有初始化点与 2 份测试改）
initCaptureDiag(absPath: string): void        →  initCaptureDiag(sink: DiagSinkPort): void
captureDiag(message: string): void            →  不变（门面内：console.log + sink?.write）
CAPTURE_DIAG_REL: string                      →  不变（纯常量）

// 【族③】Before → After
resolveWorkspaceAnswer(answer, sessionCwd)                  → (answer, sessionCwd, host: HostFsPort)
resolveManualWorkspaceRoot(raw, sessionCwd)                 → (raw, sessionCwd, host: HostFsPort)
isAbsolute(answer) /* node:path */                          → isAbsolutePath(answer) /* 纯函数 */
```

## 批次划分与验证（一次只改一类） `serves: RF-1, RF-8`

| 批 | 改什么 | 验证（跑什么 / 看到什么算过） | 期望读数 |
|---|---|---|---|
| B1 | 族①：合并三个 RTM 门 + 走 `DocRepository` | `npx vitest run tests/unit/gate` → 3 份全绿；`npx vitest run tests/layer-boundary.test.ts` → 越界清单剩 9 条 | 15 → 9 |
| B2 | 族②：`HostFsPort` + `FileHostFs` + `rtm-health` 端口化；`DiagSinkPort` + `FileDiagSink` + `diag-log` 门面 | 上面两条 + `npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/rtm-trigger-prototype.test.ts tests/submit-prototype.test.ts tests/reqboard/degraded-startup.test.ts tests/dive-wake-wiring.test.ts` → 全绿 | 9 → 5 |
| B3 | 族③：`paths.ts` 纯函数 + 两个用例走 `hostFs` | 追加 `npx vitest run tests/create-doc-location.test.ts tests/capture.test.ts tests/create-delegated-owner.test.ts` → 与改前读数一致 | 5 → 1 |
| B4 | 族④：Dive Service 外移 | 追加 `npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts` → 全绿 | 1 → **0**（RF-1 达成） |
| B5 | RF-7：豁免面落地（台账 0 条 + 两条新判据） | `npx vitest run tests/layer-boundary.test.ts` → application 用例绿、豁免用例绿；整文件仍剩 tools/http 1 条红 | 越界 0，门仍 1 红（另一条腿） |

每批收尾固定两条：`npx tsc --noEmit` → 0 错误；`npx vitest run <本批触及的测试文件>` → 与改前读数比对
（不新增红）。**批间不追求整文件绿**——本轮豁免台账不给自己开条目，故 15 处清零前层门必然还是红的，
"批间可独立验证"落在**越界清单条数**这个可数读数上（上表第 3 列）。

## 层门豁免面设计 `serves: RF-7`

台账 `tests/fixtures/layer-boundary-exempt.json`（照 `tests/fixtures/error-code-exempt.json` 的口径）：

```jsonc
{
  "_note": "层边界豁免台账。准入：只收「当期确不修、另有用例/需求承接」的越界；清出：实现修好后必须同步删除本条，否则 tests/layer-boundary.test.ts 的豁免用例变红。棘轮：frozenCount 只减不增（测试里另有硬上界常量，单改本文件数字会红）。reason/plan 必须非空。",
  "frozenCount": 0,
  "entries": [
    // { "file": "http/routers/x.ts", "import": "node:fs", "reason": "…", "plan": "…" }
  ]
}
```

门禁侧（`tests/layer-boundary.test.ts`）四条判据，逐条可证伪：

1. **双向相等**：每条 `entries` 必须命中一处真实越界（`file` + `import` 前缀）——不命中 = 过期豁免 → 红；
2. **残量归零**：把已豁免项剔除后，未豁免的越界必须为空（沿用既有用例的同一份扫描结果）；
3. **理由非空**：`reason` / `plan` 各 ≥ 20 字（空话也算有，但空串/空白即红）；
4. **只减不增**：`frozenCount === entries.length` 且 `≤ EXEMPT_CEILING`（测试内硬上界常量，本次 = 0）。

**可证伪**：把判据 1 的逻辑抽成导出的纯函数 `unusedExemptions(bad, entries)`，另加一条用例用**合成输入**
断言"台账指向已修好的文件 → 返回该条 + 判红"——不必真去改产线文件就能证明这条判据有效。

## 依赖与调用方清单（改前逐处登记，防漏改） `serves: RF-2, RF-3, RF-4, RF-5, RF-6`

| 被改函数 / 文件 | 生产调用方 | 测试调用方 | 验证没漏 |
|---|---|---|---|
| `designGateCheck` / `taskCoverageGateCheck` / `acceptanceGateCheck` | **无**（`gate/index.ts` barrel 零引用；生产走 vendor `AcceptanceGate`） | `tests/unit/gate/*.test.ts` 3 份 | `npx tsc --noEmit`（签名变更必编译报错）+ 3 份单测全绿 |
| `recordRTMFailure` / `clearRTMFailure` / `recordRTMTriggerTrace` | `rtm-yaml.ts`（4 处） | `tests/unit/rtm-health.test.ts`、`tests/rtm-trigger-prototype.test.ts`、`tests/submit-prototype.test.ts`、`tests/canceled-*` 3 份、`tests/rtm-yaml-live-tasks.test.ts` | 同上（编译期 + 用例） |
| `readRTMTriggerTraces` | 无生产调用方 | `tests/submit-prototype.test.ts`、`tests/rtm-trigger-prototype.test.ts` | 同上 |
| `checkRTMHealth` | `query/QueryState.ts`（1 处） | `tests/unit/rtm-health.test.ts`、`tests/rtm-health-legacy.test.ts` | 同上 |
| `syncRTMYamlWithSnapshot` | `http/routers/requirements.ts`（2 处）、`tasks.ts`（1 处）、`rtm-yaml.ts`（1 处） | `tests/canceled-audit-holds.test.ts`、`canceled-four-faces.test.ts`、`canceled-coverage-gate.test.ts` 等 | 同上 |
| `captureDiag` | `src/index.ts`、`src/gate-wiring.ts`、`src/wiring/{not-ready,pm-capture-root}.ts` + application 内 6 个文件 | `tests/dive-wake-wiring.test.ts`、`tests/reqboard/degraded-startup.test.ts`（只用 `initCaptureDiag`） | **调用点签名不变** ⇒ 只有 2 处 `initCaptureDiag` + 组合根改；6 个调用方零改动 |
| `ReqboardDiveManager` | `src/index.ts:128`（`new ReqboardDiveManager(ctx, ports)`） | `tests/dive-wake-wiring.test.ts`、`tests/dive-manager-wiring.test.ts`（后者按**路径字符串**读文件） | `npx tsc --noEmit` + 2 份单测 |
| `UseCaseDeps.hostFs`（新必填） | `src/index.ts` 装配 | 4 个 deps 字面量：`tests/application/harness.ts`、`tests/helpers/tool-deps.ts`、`tests/queue/v9-harness.ts`、`tests/e2e-design-handoff.test.ts` | 编译期报错即清单（**全仓只有 5 处** deps 字面量） |

## 行为不变式的验证设计 `serves: RF-2, RF-3, RF-4, RF-5, RF-6`

| INV | 怎么验（改前先记，改后比对） |
|---|---|
| INV-1 三个门结论逐字不变 | `tests/unit/gate/*.test.ts` 的 passed / code / gaps / message 断言原样保留，只改构造（`tmpDir` → `FileDocRepository`） |
| INV-2 rtm-health 落盘形状不变 | `tests/unit/rtm-health.test.ts`（键、100 条上限、文件内容）原样断言；新增一条"state 目录不存在时也能落盘"（见「刻意变更」） |
| INV-3 原型判据不变 | `tests/unit/rtm-health.test.ts` + `tests/rtm-health-legacy.test.ts` + `tests/rtm-trigger-prototype.test.ts`（纯函数零改动，用例即证） |
| INV-4 日志行为不变 | `tests/dive-wake-wiring.test.ts`（读日志文件断言 `[WAKE-FAIL]`）、`tests/reqboard/degraded-startup.test.ts`（断言一条失败一行） |
| INV-5 两处路径判定行为不变 | `tests/create-doc-location.test.ts`（传 `docs/rfcs/` 的降级路径）、`tests/create-delegated-owner.test.ts`（非绝对路径 → `REQBOARD_INVALID_WORKSPACE`）、`tests/capture.test.ts`（哨兵与自定义落点） |
| INV-6 Dive Service 装配不变 | `tests/dive-wake-wiring.test.ts`（Service 名/inject/订阅分组/失败留痕）、`tests/dive-manager-wiring.test.ts` |
| INV-7 层门口径不变 | `git diff tests/layer-boundary.test.ts` 中 `LAYER_RULES.forbidden` 零改动（评审可核） |

**刻意变更（不是不变式，写在这里防"悄悄变"）**：`rtm-failures.json` 的写从「写临时文件 + 复制」
统一为「目录按需创建 + 原子 rename」，且 `finally` 里的 `require('fs')`（ESM 下必抛 ⇒ **临时文件残留**）
换成适配器里 import 的 `unlinkSync`。差异只落在"state 目录不存在"与"临时文件是否残留"两条边：
改前失败留痕会因目录缺失而抛（被调用方 try/catch 吞掉）并残留 `.tmp-*`，改后落盘成功且不留残留。
门禁结论、文件名、键、100 条上限一律不变。新增一条用例钉住新行为。

## 关键决策与取舍 `serves: RF-2, RF-3, RF-5, RF-7`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 三个门的去留 | 直接删死码（生产零引用，只有 3 份单测钉着） | 合并为一份 + 端口化 + 保留同名导出 | 一次只改一类东西：删码会同时改接口与结构（需求文档 D-3）。旧路径仍可用 ⇒ 无"改了没人编译到"的静默 |
| 根的传递 | 端口构造期绑定单例根（`new FileHostFs(workspaceRoot)`） | 每个方法**逐次显式传根** | `docs/architecture/gate-read-root.md` 记着两次真实事故：宿主级单例根被别的窗口改掉 ⇒ 完整性门误拦/其余门静默放行。类型里逐次显式 = 让"用哪个根"无处可藏 |
| 端口同步 vs 异步 | 改异步复用 `DocRepository.read`（async） | 新开**同步**窄口 `HostFsPort` | `syncRTMYamlWithSnapshot` 及其 3 个 HTTP 调用点在同步路径上；改异步要连带改 ~13 个调用点与测试，爆炸半径远大于一个端口 |
| 目录探测挂哪 | 给 `DocRepository` 加 `isDirectory/cwd` | 挂在新 `HostFsPort` 上 | `DocRepository` 全仓有 ~11 处测试替身，扩它会连带改一圈；新口只需 5 个 deps 装配点。且"文档库"与"宿主路径探测"是两件事 |
| 日志半边 | 也给 diag-log 造一个"宿主态端口" | 复用现有调用形状，只把**初始化**改成吃 sink | 6 个 application 调用点 `captureDiag(msg)` 一字不改；`dshHomePath` 的落点与工作区根无关，通用宿主态端口是空转（D-5） |
| 豁免面的存在意义 | 不做豁免面，逼所有越界都必须真修 | 做豁免面，但**本需求自身 0 条** | 门恒红的结构原因就是"没有合法出口"；同时用"双向相等 + 只减不增 + 过期即红 + 硬上界常量"堵死当垃圾桶。本次 15 处全真修，正是为了证明这条出口没有被用来偷懒 |
| 中间批次是否临时登记豁免 | 允许 B1–B4 临时登记、B5 清空（每批都能绿） | 不登记；批间以**越界条数**（15→9→5→1→0）为读数 | 临时条目会让"本次 0 条"这句承诺在过程里失真；而越界条数同样是机械可核的量 |

## 风险与遗留 `serves: RF-1, RF-8`

| 风险 / 遗留 | 影响 | 处置 |
|---|---|---|
| 共享工作树（262 个在途改动） | 全量测试失败集合在两次运行之间会变 | 判据取"相关用例集差集 ⊆ 改前基线"；`pnpm baseline:check` 若报差集非空，逐条确认归属后再决定是否 refresh |
| `docs/knowledge/code-map.*` 是**生成物**且正被他人在途改写 | 重跑生成器会覆盖别人的产物（REQ-261008011831-3735 已踩过） | 只做新增符号的最小手改 + 在验收材料里如实申报"未重跑生成器"；不 `pnpm kb:build` 全量重写 |
| tools/ 与 http/ 那条红仍在 | 层门文件不是全绿 | 验收材料点名它是另一条腿（RF-8），**不进豁免台账** |
| 三个门在**生产**无人调用 | 端口化的收益当期不可见（只有测试面） | 如实记在遗留问题：是否需要复活/删除这三个门，另立项裁定 |
| `HostFsPort` 成为新必填依赖 | 任何新的 deps 装配点必须给 | 编译期即拦（TS 必填字段）；这正是要的——比"可选 + 运行期兜底"早一步暴露 |

## 文档更新清单 `serves: RF-1, RF-7`

| 文档 | 更新内容 | 何时 |
|---|---|---|
| `docs/architecture/project-manual.md` | 说明书：端口面新增 `HostFsPort` / `DiagSinkPort`（附"根逐次显式"的理由）；层门新增豁免台账机制与四条判据 | 归档前 |
| `docs/knowledge/code-map.md` + `code-map.symbols.tsv` | 新增/迁移的文件与导出符号（最小手改，不重跑生成器） | 实施期收尾 |
| `docs/architecture/gate-read-root.md` | 在"唯一收敛入口"契约里点一句：RTM 门自本次起也吃 `deps.docs`，故同样受该纪律约束 | 实施期收尾 |

## 测试策略 `serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8`

| 层 | 文件 | 断言什么 |
|---|---|---|
| 机械门禁 | `tests/layer-boundary.test.ts` | application/ 越界 = 0；豁免台账四条判据；`LAYER_RULES` 零改动 |
| 单元（族①） | `tests/unit/gate/{design,task-coverage,acceptance}-gate.test.ts` | 三门的 passed/code/gaps/message 语义（INV-1） |
| 单元（族②） | `tests/unit/rtm-health.test.ts`、`rtm-health-legacy.test.ts` | 落盘形状 / 期望文件清单 / 原型节判据 / `legacy` 豁免（INV-2、INV-3）+ 新增"目录缺失也能落盘" |
| 集成（族②） | `tests/rtm-trigger-prototype.test.ts`、`tests/submit-prototype.test.ts`、`tests/reqboard/degraded-startup.test.ts` | 触发留痕落盘、日志一条失败一行（INV-2、INV-4） |
| 集成（族③） | `tests/create-doc-location.test.ts`、`tests/create-delegated-owner.test.ts`、`tests/capture.test.ts` | 哨兵 / 自定义落点 / 错误码与文案（INV-5） |
| 集成（族④） | `tests/dive-wake-wiring.test.ts`、`tests/dive-manager-wiring.test.ts` | Service 装配、订阅分组、失败留痕（INV-6） |
| 交叉 | `tests/canceled-*.test.ts`、`tests/rtm-yaml-live-tasks.test.ts` | RTM 同步签名变更后无回归 |

**验收命令（终态）**：

1. `npx vitest run tests/layer-boundary.test.ts` → application 用例绿 + 豁免用例绿；tools/http 仍 1 红（另一条腿）
2. `npx tsc --noEmit` → 退出码 0、0 错误
3. `grep -rn "node:\|@deepseek-ai/" src/application` → 0 命中
4. `pnpm baseline:check` → 差集为空，或逐条确认非本次引入
5. 相关用例集（上面 6 组）→ 失败集合 ⊆ 改前基线

## 技术方案与亮点 `serves: RF-1, RF-7`

**技术栈与关键依赖**：不引入任何新依赖（`node:fs` / `node:path` 只是从 application 挪到 adapters）。

**模块划分**：端口（`ports.ts`，application 拥有）/ 实现（`adapters/*`，宿主拥有）/ 门禁（`tests/`，机器兜底）
三层各有唯一归属；`HostFsPort` 的根**逐次显式**，把 `gate-read-root.md` 的纪律写进类型。

**设计模式**：端口-适配器（既有模式，本次只新增两个端口）；豁免台账沿用 `error-code-exempt.json`
的"棘轮 + 双向相等 + 理由必填"既成惯例，不发明第二套。

**关键实现手法**：

1. 三份克隆合并后，**差异只剩一张规格表**（查哪个字段 / 哪个错误码 / 哪句消息），读盘与错误兜底单点；
2. `diag-log` 门面保留 `console.log` 在门面内 ⇒ "sink 未装配 = 老行为（只进控制台）"逐字保持；
3. 豁免面把"扫出越界"抽成一个纯函数，让"过期豁免即红"可用**合成输入**证伪，不必真改产线文件。

**攻克的难点**：把"恒红的门"变成"可推进的门"——难点不在改 15 处 import，而在**让红的原因可数**
（越界条数）与**让合法的例外可登记**（豁免台账），二者缺一，门就会再次退化成"没人看的红"。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向 |
|---|---|---|---|---|
| 端口根 | 端口构造期绑定单例根 | 方法逐次显式传根 | 单例根被别的窗口改过 ⇒ 两次真实事故 | `docs/architecture/gate-read-root.md`；`ports.ts` 的 `HostFsPort` 注释 |
| 层门豁免 | 直接 red 到底 / 或在测试里硬编码白名单 | 台账化 + 理由必填 + 只减不增 + 过期即红 | 白名单会变垃圾桶，red 到底会被无视 | `tests/fixtures/layer-boundary-exempt.json` + `tests/layer-boundary.test.ts` 新用例 |
| 中间批次 | 每批都要求整文件绿 | 以**越界条数**为批间读数 | 本次不给自己开豁免，故清零前不可能全绿 | 本文「批次划分与验证」表 |
