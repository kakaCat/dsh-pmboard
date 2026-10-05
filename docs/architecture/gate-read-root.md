# 读盘闸门的根解析（L2 领域篇）

> **TL;DR**：**读文档的闸门必须按「被核验需求自己的 `workspaceRoot`」读盘**。
> `deps.docs` / `deps.queueRepo` 是**宿主级、跨窗口共享**的单例，根会被别的窗口（另一个会话工作区）改掉；
> 若读盘前不按需求根再校正一次，同一条需求的两类操作就不同根——后果是**两个相反方向**的坏结果：
> 完整性门**误拦**（报「文件不存在」，需求卡死、只能人工绕过），其余读类门**静默放行**（漏放、零告警）。
> 修法只有一个：读盘前调用唯一收敛入口 `applyRequirementWorkspaceRoot(deps, req)`。

## 为什么需要它（根因备忘）

```
   用例入口 agentIdFromExec
        │  syncWorkspaceRootFromExec(exec)        ← 会话 cwd = A
        ▼
   deps.docs.root = A            deps.queueRepo.root = A
        │
        ├── 写侧：SubmitArtifact / SubmitDesignArtifacts
        │        syncWorkspaceRootForRequirement(req)   ← 需求 workspaceRoot = B  ✔ 早已正确
        │
        └── 读侧：两个读盘闸门共 7 处调用点
                 必须 rd 前先 applyRequirementWorkspaceRoot(deps, req)  ✘ 曾经漏掉
```

**事故形态（两次真实发生）**：

| 时点 | 现象 | 证据 |
|---|---|---|
| 2026-09-30 18:4x（REQ-260930183951-eb6c） | 设计确认落章成功，自动推进被拦，报「requirement.md 不存在」——文件在盘上且 5 份设计产物章齐全，最后靠人工 `reqboard_move` 绕过 | 台账状态评论原文 |
| 2026-09-30 19:45（REQ-260930193929-897b **自身**） | 同一文案；该需求 `workspaceRoot` 与会话 cwd **相同**，仍复现 → 触发条件不是「跨工作区立项」，而是「单例根被别的窗口改过」 | 磁盘实测 requirement.md 13283 bytes 在盘上 |

## 契约：唯一收敛入口

| 项 | 内容 |
|---|---|
| 入口 | `applyRequirementWorkspaceRoot(deps, requirement)`（`src/application/internal/support.ts`） |
| 语义 | `requirement.workspaceRoot` 非空 → 同时校正 `docs` 与 `queueRepo` 的根（两者必须同根）；否则 **no-op** |
| 依赖面 | 结构化最小面 `WorkspaceRootTargets`（`docs` + `taskStore?: unknown`）——看板路由的 `ctx.deps` 只有 `docs`，不为一次鸭子探测伪造整个 `UseCaseDeps` |
| 容错 | 不抛错：`setWorkspaceRoot` 缺失（内存替身）由既有鸭子探测跳过 |
| 写侧 | `syncWorkspaceRootForRequirement` 委托同一实现——**读写只有一处校正逻辑** |

**必须接线的 7 处读盘调用点**（少一处即为旁路，静态断言会红）：

| 闸门 | 调用点 |
|---|---|
| G2 完整性门 | `AskConfirm.ts` 早返回 · `confirm-settle.ts` 自动推进 · `ConfirmArtifact.ts` · 看板 `g2CompletenessFailure` |
| 拆分内容硬门 | `confirm-settle.ts` 落章前扫描 · `ConfirmArtifact.ts` · 看板确认前扫描 |

## 根错时各类门禁的行为（**方向不一致**是这条备忘的重点）

| 门禁 | 根错误时 | 性质 |
|---|---|---|
| G2 完整性门 | 报「requirement.md 不存在」 | **误拦**（fail-closed，需求卡死） |
| 拆分内容硬门 | `list(design/)` 读到空数组 → 扫描不到任何文档 | **静默放行**（fail-open） |
| FR 覆盖门 | 读不到 `requirement.md` → 提前 `return undefined` | **静默放行**（fail-open） |
| 需求文档格式门 | 同上 | **静默放行**（fail-open） |

⇒ **一处根因，三个门禁会静默失效**。「失效」比「误拦」危险：误拦会喊，静默放行不会。

## 回归门（改这里前后都要跑）

```
npx vitest run tests/design-gate-workspace-root.test.ts                 # 13 例：正反双向 + 存量 + 防旁路
npx vitest run tests/design-gate-workspace-root.test.ts -t "E2E"        # 2 例：真实 HTTP → 仓储 → 状态机，断言可观察终态
npx tsc --noEmit -p tsconfig.json                                       # 改动文件零新增错误
```

**判别力自证（重要）**：停用任一接线点，对应用例必须变红——否则用例是空过的。
实测：停用 `confirm-settle` 的校正 → 拆分内容硬门用例复现 fail-open；停用 `ConfirmArtifact` 的校正 →
静态断言精确点名「读盘前缺少根校正」。**该静态断言必须排除注释行**，否则「把调用注释掉」也能通过（实测踩过）。

## 变更须知（改这些地方会连带破坏什么）

- **新增任何读盘类闸门** → 必须先在读盘前调用收敛入口，并把调用点登记进上表；防旁路静态断言会拦漏。
- **用无根替身写这条链路的测试** → `tests/application/harness.ts` 的 `FakeDocs` **没有根概念、也没有 `setWorkspaceRoot`**，
  根校正会被鸭子探测静默跳过 → 断言**空过**（测试全绿但什么都没验证）。必须用「可换根」的读取器（真实 `FileDocRepository` 指向临时目录）。
- **为省事去掉反向用例** → 只验正向时，「把 `exists` 短路成 true」的假修复也能绿；反向用例是唯一防线。
- **改 `requirement.md` 的测试策略表** → E2E 覆盖读数（`e2eCoverageOf`）只认那一张表；但该文档已确认，
  平台**禁止在 implementing 阶段重交**（`REQBOARD_BAD_STATUS`，回退 brainstorming 会作废既有确认）——
  所以「补 E2E」要在 brainstorming 阶段就把行写进去，事后只能靠验收项写明理由。

## 写入侧的收口（REQ-261001203710-0fbf，2026-10-04）

上面那条「写入侧未校正」**已收口**，做法与读侧刻意不同——**只核验，不代为校正**：

| 问题 | 收口方式 |
|---|---|
| 写盘前根不对 | `ensureWritableProjectRoot(deps, record)` 核验「即将写入的根 = 记录声明的根」，不一致即抛 `REQBOARD_PROJECT_ROOT_MISMATCH`（**同时给两个绝对路径**），绝不静默写别处 |
| 判定散落在各调用点 | 下沉到「知道需求是谁」的共享写入器：文档侧 8 个（plan-landing / rtm-yaml / ReportTask / AmendTaskAcceptance / AdvanceChain / verification-doc-writer / SubmitVerification / SyncRequirementMarks）；队列侧 2 个收口包装 `mutateQueue` / `createManyQueue`（12 处队列写点已迁入） |
| 改造后再漏 | 静态门禁：`tests/project-scope.test.ts` 的「写盘覆盖」扫出所有工作区相对写盘点，名单外的新裸写**直接变红并点名 `文件:行`**（白名单与待偿清单都不许腐烂） |
| 记录的项目根本身是错的 | `capture` / `create` 的工作区回落由 `process.cwd()` 改为**优先取实际在用的工作区**——否则记录一出生就归属错项目，下游「按记录自己的项目写」必然写错 |

**为什么不代为校正（本需求踩过的坑，别再犯）**：第一版实现成「先按记录声明的根校正、再核验」，一次测试就把文件**重定向写进真实仓库**（51 个污染目录，已清理）。结论：读侧可校正（最坏读空、可重试），**写侧只许拒绝**——拿一个可能算错的声明去搬动写入，只会把错误放大。

## 已知缺口（2026-10-04 更新）

| 缺口 | 现状 | 影响 |
|---|---|---|
| ~~写入侧未校正~~ | ✅ **已收口**（见上节） | — |
| **单例并发** | 仍是全局可变根；本需求让**每次写入核验**（错配即拒）而非安全切换 | 并发下写入会**响亮失败**而不是写错地方——比静默污染好，但仍需重试/人工介入（架构级改造未做） |
| 真机交叉演练 | 只验证到「宿主重启加载新产物后，看板可见任务数 0 → 73」 | 未构造「在 A 项目会话里对 B 项目需求发起落库」的完整演练 |

## 来源

- REQ-260930193929-897b（读盘闸门按需求级 `workspaceRoot` 二次校正；含本需求自身 19:45 的现场复现）
- **REQ-261001203710-0fbf（写入侧收口：唯一口径 + 写盘守卫「只核验不重定向」+ 判定下沉 + 静态覆盖门禁；由 20:21 现场事故立项——`queue.json` 与任务卡被写进另一个工作区）**
- 前置事故与留痕：REQ-260930183951-eb6c；写侧先例：REQ-260929210741-30ae FR-6
- 物证：`docs/requirements/REQ-260930193929-897b/notes/evidence-misplaced-decomposition.md`
