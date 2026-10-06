---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 拆分计划（REQ-261005123641-3982 修写盘根守卫误判）

> 需求：`docs/requirements/REQ-261005123641-3982/requirement.md`（FR-1~FR-5）
> 设计：同目录 `design/`（architecture / interfaces / data-model / test-cases / use-cases / backend）
> 现场：REQ-261005122915-9f90 立项回执 @1791174555337（声明 pmboard / 实际 notice-webhook）；
> REQ-261005122347-e07a 批准后未落库 @1791174695611（同因）

## §1 改动盘点（逐份对照设计）

| 设计文档 | 被哪张卡兑现 | 改动性质 |
|---|---|---|
| `design/architecture.md` | t1（根权威链 + 校正时机）、t2（守卫前置） | 1 处判定逻辑重写 + 2 处调用点前置 |
| `design/interfaces.md` | t1（新签名与判定顺序表）、t2（调用点清单核对） | 1 处签名加可选参 + 1 条错误码语义收窄 |
| `design/data-model.md` | t1（权威/缓存口径落代码注释）、t4（口径落文档） | 零 schema 改动、零迁移 |
| `design/test-cases.md` | t1（单测）、t3（并发与真错配用例） | 新增 1 个测试文件 + 重写 1 条失效用例 |
| `design/use-cases.md` | UC-1/UC-2 → t2；UC-3 → t1；UC-5 → t3 | 用例即验收脚本 |
| `design/backend.md` | t1（端口零变更）、t2（时序约束）、t4（口径文档） | application 两文件 + 两处调用点 |

**零改动项（设计明确要求不动的）**：台账 schema 与 `queue.json`（无迁移）、对外 HTTP 与工具入参形状、
客户端（无 UI 改动）、`tests/project-scope.test.ts` 的 t8 写盘点门禁三份清单。

⚠️ **唯一「改既有测试」的说明（不是放宽）**：`tests/project-scope.test.ts:452` 的用例
「零写入：错配时拒绝落盘…（守卫只核验、**不代为重定向**）」编码的正是**被本次设计推翻的旧契约**
（记录声明 B、当前根 A → 拒绝）。新契约下记录是权威 → 校正到 B 才正确。t3 **重写**该用例为等强度断言
（校正到记录声明根 + 调用方根零写入 + 返回值 = 声明根），并**保持** 414/430/443/448 四条与 t8 门禁用例逐字不动。

## §2 RTM 覆盖对照表（每条 FR 的落点）

| 条款 | 承载卡 | 说明 |
|---|---|---|
| FR-1 判定输入取自本次调用自身 / 记录，不取单例当前值 | t1, t3 | t1 重写判定；t3 用并发夹具钉死 |
| FR-2 写前校正共享仓储到记录声明根，校正与核验同源 | t1, t2 | t1 实现校正；t2 在立项两条路径前置调用 |
| FR-3 守卫不得晚于副作用，禁半截失败 | t2, t3 | t2 前置；t3 断言拒绝时台账零写入 |
| FR-4 判定收敛到同一入口 + t8 门禁不削弱 | t1, t3 | t1 一处实现（by-id 复用）；t3 跑门禁用例 |
| FR-5 并发窗口回归用例 | t3 | 新增 `tests/project-root-concurrency.test.ts` |
| 口径沉淀（单例仅缓存） | t4 | 更新 `docs/architecture/gate-read-root.md` 姊妹篇 |

## §3 任务表

| key | 标题 | phase | side | depends_on | template | 体量 DU |
|---|---|---|---|---|---|---|
| t1 | 守卫改为按需求记录声明根判定，并在写前校正共享仓储根 | implement | backend | — | change-only | 3.9 |
| t2 | 立项两条路径（capture / create）守卫前置到建档之前 | implement | backend | t1 | change-only | 4.3 |
| t3 | 并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例） | test | backend | t1, t2 | — | 5.6 |
| t4 | 写侧口径落文档：记录声明根为唯一权威、共享单例仅缓存 | doc | doc | t1 | change-only | 4.2 |

无超容量卡（单卡上限 16 DU，最大 5.6）。

## §4 逐卡实施与验收

### t1 守卫改为按需求记录声明根判定，并在写前校正
- **实施**：改 `src/application/internal/support.ts`：
  ① `ensureWritableProjectRoot(deps, record, caller?)` 增加可选第 3 参 `{ callerRoot?: string }`；
  ② 判定顺序按 `design/interfaces.md` 的六行表：先探针（无 `workspaceRoot` 探针 → 返回 `undefined`，不判）→
  `declared` 非空：`!isAbsoluteRoot` 或 `docs.exists(declared) === false` → 抛 `REQBOARD_INVALID_WORKSPACE`；
  否则 `applyWorkspaceRoot(deps, declared)` 校正 → 复核探针值：相同 → 返回声明根，仍不同 → 抛
  `REQBOARD_PROJECT_ROOT_MISMATCH`；
  ③ `declared` 为空：有 `callerRoot` → 校正到它并返回；否则 `undefined`；
  ④ `assertWritableRequirementProject(deps, reqId, caller?)` 保持「按 id 取记录 → 调同一实现」。
  函数名不变（t8 门禁 `GUARD_CALL` 依赖）；`exists` 用既有 `DocRepository.exists`（绝对路径直通），
  不新增端口方法。
- **验收**：`npx vitest run tests/project-scope.test.ts -t "守卫"` → 414/430/443/448 四条**未修改即绿**；
  `npx tsc --noEmit` 错误数 ≤ 基线；`grep -n "export function ensureWritableProjectRoot" -A 6 src/application/internal/support.ts`
  → 可见第 3 参 `caller?`；`grep -rc "ensureWritableProjectRoot(\|assertWritableRequirementProject(" src --include=*.ts`
  → 调用点数与基线一致（本卡不动调用点）。

### t2 立项两条路径守卫前置
- **实施**：`src/application/use-cases/CaptureRequirement.ts`：在 ④`createRequirementDirect`(:277) **之前**
  用已解析的 `workspaceRoot` 调 `ensureWritableProjectRoot(deps, { workspaceRoot }, { callerRoot: sessionCwd })`
  （拒绝 → 台账零写入）；`:300` 既有调用保留为护栏。
  `src/application/use-cases/CreateRequirement.ts`：把 :63 的守卫**前置**到 `createRequirementDirect`(:52) 之前，
  并传 `callerRoot: sessionCwd`。
  （顺序约束：校正与紧随的写盘之间不插入新的 `await`。）
- **验收**：`grep -c "ensureWritableProjectRoot" src/application/use-cases/CaptureRequirement.ts` → ≥2（前置 + 护栏）；
  `grep -n "ensureWritableProjectRoot" src/application/use-cases/CreateRequirement.ts` → 行号 < `createRequirementDirect` 调用行；
  `npx vitest run tests/project-scope.test.ts tests/application` → 全绿。

### t3 并发窗口回归 + 新契约用例
- **实施**：新增 `tests/project-root-concurrency.test.ts`：
  TC-1 A 写 → B 调 `reqboard_status`（触发单例校正）→ A 再写（两次都成功；B 目录零新增）；
  TC-2 记录声明 B、调用方根 A → 校正到 B 并返回 B（A 目录零新增）；
  TC-3 声明根不存在 / 相对写法 → `REQBOARD_INVALID_WORKSPACE` + 调用方根零写入；
  TC-5 记录无 `workspaceRoot` → 回落调用方根并标注，不误拒。
  重写 `tests/project-scope.test.ts:452` 那条失效用例到新契约（等强度断言，改标题与期望）。
- **验收**：`npx vitest run tests/project-root-concurrency.test.ts tests/project-scope.test.ts` → 全绿；
  `npx vitest run tests/project-scope.test.ts -t "写盘覆盖"` → 绿（t8 三份清单零改动）；
  `git diff --stat tests/project-scope.test.ts` → 仅 1 个用例块变动；
  `pnpm test` 失败数 ≤ 开工前基线。

### t4 写侧口径落文档
- **实施**：更新 `docs/architecture/gate-read-root.md`：补「写侧」姊妹篇——写入根的唯一权威 =
  该 REQ 记录的 `workspaceRoot`（**按需求 id 定位记录**）；进程共享根仅作缓存，任何判定不得读其当前值；
  写侧不降级（声明根不可用即拒）。并在 `docs/architecture/project-manual.md` 对应篇章挂接该页（不留孤儿页）。
- **验收**：`grep -n "唯一权威\|仅作缓存\|按需求 id" docs/architecture/gate-read-root.md` → 命中；
  `grep -n "gate-read-root" docs/architecture/project-manual.md` → 命中（页面被挂接）；
  `pnpm kb:probe` → 无死链；`pnpm kb:check` → 退出码 = 开工前基线（未新增漂移）。
