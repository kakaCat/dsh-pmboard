---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 拆分计划（REQ-261004174324-4195 知识层自动自举）

## 目标 + 做法（一段人能读懂的）

**目标**：让 pm 插件在项目里没知识层时**自己长出来**（`docs/knowledge/`：索引骨架 + 代码地图 + 设计令牌 + 两份 TSV），并把「知识库」侧栏入口与页面**删掉**——知识层不再是给人点的门面，而是插件自动保障的 Agent 侧基础设施。

**做法**：把生成规则从脚本搬进领域纯函数（可测、无 IO）→ 用例 `ensureKnowledgeLayer` 负责"先算后写、只加不改手写内容、失败响亮"→ 脚本退化成薄包装（`pnpm kb:build` 行为不变）→ 宿主在"根确定"的三处通知点触发，配 `knowledge.autoBootstrap` 开关回退 → 客户端删除面清干净（保留 `/kb` 路由与 `reqboard_kb`）。

## 改动盘点

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/domain/knowledge/generate.ts` | 纯渲染：符号抽取 / 代码地图 / 设计令牌 / INDEX 骨架 / 生成区替换 |
| 新增 | `src/application/use-cases/EnsureKnowledgeLayer.ts` | 自举用例（端口注入、幂等、失败不抛） |
| 新增 | `src/application/internal/knowledge-bootstrap.ts` | 协调器：根的 realpath 去重、失败留存、force |
| 修改 | `src/application/ports.ts` | 增窄端口 `KbSourcePort` |
| 修改 | `src/plugin-config.ts` | 增 `knowledge.autoBootstrap`（默认 true；非布尔装配期抛错） |
| 修改 | `src/index.ts` | 激活末尾通知"根已确定" |
| 修改 | `src/application/internal/support.ts` | `applyWorkspaceRoot` 后通知 |
| 修改 | `src/http/routers/shared.ts` | `resolveDocRoot` 命中 session 后通知 |
| 修改 | `scripts/kb-build.mts` | 退化为薄包装（argv/打印/退出码；`--backfill` 留在脚本） |
| 删除 | `src/client/views/knowledge.ts`、`src/client/page/register-knowledge.ts`、`src/client/styles/knowledge.ts` | 知识库页三件套 |
| 修改 | `src/client/index.ts`、`src/client/styles.ts` | 删注册与样式引用 |
| 删除 | `tests/kb-client-page.test.ts`、`scripts/knowledge-page-probe.mts` | 只服务该页的测试与探针 |
| 修改 | `docs/architecture/project-manual.md`、`README.md` | 侧栏表删该行；知识层节补一句自举 |
| 新增 | `tests/kb-generate.test.ts`、`tests/kb-ensure.test.ts`、`tests/kb-bootstrap-hooks.test.ts`、`tests/kb-cli-parity.test.ts`、`tests/kb-bootstrap-compat.test.ts` | 回归锁 |
| 新增 | `docs/requirements/REQ-261004174324-4195/evidence/*` | 验收证据 |

## 任务表

| key | 标题（业务语言） | phase | side | depends_on | 需求条款 |
|---|---|---|---|---|---|
| t1 | 让「项目知识」能被机器算出来（领域纯函数） | implement | backend | — | FR-3, FR-4 |
| t2 | 缺层就补：一次自举该写什么、不该碰什么（用例） | implement | backend | t1 | FR-2, FR-5 |
| t3 | 手动命令与自动自举走同一条路（CLI 薄包装） | implement | backend | t2 | FR-4 |
| t4 | 插件在「根确定」时自己动手（宿主接线 + 开关） | implement | backend | t2 | FR-2, FR-6 |
| t5 | 把「知识库」入口和页面拿掉（含说明书同步） | implement | frontend | — | FR-1 |
| t6 | 老行为可回退：开关、兼容与基线（迁移验证） | test | backend | t4, t5 | FR-6, FR-7 |
| t7 | 端到端演练与交付证据 | test | backend | t3, t4, t5, t6 | FR-7 |

### 依赖图

```
t1 ──▶ t2 ──▶ t3 ─────────────┐
        └──▶ t4 ──┐            │
t5 ───────────────┴──▶ t6 ─────┴──▶ t7
```

### 容量核算

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 = 16 DU（本仓不写超容量标记即需 ≤16）。

| key | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 3 | 4 | 2500 | 6.25 | 通过 |
| t2 | 3 | 6 | 3500 | 7.75 | 通过 |
| t3 | 2 | 3 | 1800 | 4.40 | 通过 |
| t4 | 6 | 5 | 3200 | 10.10 | 通过 |
| t5 | 9 | 3 | 1600 | 11.30 | 通过 |
| t6 | 3 | 5 | 2000 | 6.50 | 通过 |
| t7 | 7 | 6 | 1500 | 10.75 | 通过 |

无超容量卡 → 不需要 `⚠️超容量(建议N批)` 标记。

## 每卡验收（可证伪）

### t1 · 领域纯函数

- **implementation**：新建 `src/domain/knowledge/generate.ts`，导出 `extractSymbols` / `renderCodeMap` / `renderDesignTokens` / `scaffoldIndex` / `replaceGeneratedSection`；口径**逐字沿用** [kb-build.mts](scripts/kb-build.mts) 现值（导出正则、`SRC_KINDS`、`GROUP_TOP=24`、TSV 表头）；零 IO、无时间戳。新增 `tests/kb-generate.test.ts`。
- **acceptance**：`npx vitest run tests/kb-generate.test.ts` 全绿（含两次渲染逐字节相等、符号数与现有 `code-map.md` 一致、INDEX 骨架含成对生成区标记与「待写」节）；`grep -c "node:fs" src/domain/knowledge/generate.ts` 输出 `0`。

### t2 · 自举用例

- **implementation**：`src/application/ports.ts` 增 `KbSourcePort { list, read }`；新建 `src/application/use-cases/EnsureKnowledgeLayer.ts`（根取自 `docs.workspaceRoot()`、先算后写、逐文件内容比对、手写页永不写、`markers-missing` 零写入、根漂移中止、失败不抛）；新增 `tests/kb-ensure.test.ts`。
- **acceptance**：`npx vitest run tests/kb-ensure.test.ts` 全绿，覆盖：空根 → `created` 且 5 产物齐备；二次调用 `created=[]` 且内容与 `mtime` 双不变；`index-exists` 时假端口 `read` 调用次数 = 0；手写页与手写行 diff 为空；`markers-missing` → 零写入；只读根 → `failed` 且 `failedPath`/`error` 非空、不抛。

### t3 · CLI 薄包装

- **implementation**：`scripts/kb-build.mts` 改为解析 argv（`--write` / `--check` / `--backfill` / 新增 `--root`）→ 构造 `FileDocRepository({ workspaceRoot })` → 调用例；打印格式与退出码语义不变；`--backfill` 保留在脚本。新增 `tests/kb-cli-parity.test.ts`。
- **acceptance**：`pnpm kb:build && git diff --stat docs/knowledge` 无输出；`pnpm kb:check` 退出码 `0`；`npx vitest run tests/kb-cli-parity.test.ts` 全绿（CLI 与直接调用用例对同一 fixture 根产物逐字节相等）。

### t4 · 宿主接线

- **implementation**：新建 `src/application/internal/knowledge-bootstrap.ts`（`Map<realKey, Promise>` 去重、失败留存不重试、`force`）；`src/plugin-config.ts` 增 `knowledge.autoBootstrap`（默认 true，非布尔装配期抛错）；三处通知点接线（`src/index.ts` 激活、`support.ts` 的 `applyWorkspaceRoot`、`shared.ts` 的 `resolveDocRoot` 命中 session）。新增 `tests/kb-bootstrap-hooks.test.ts`。
- **acceptance**：`npx vitest run tests/kb-bootstrap-hooks.test.ts` 全绿（三通知点各触发一次、同根并发只跑一次、`enabled:false` 与 `autoBootstrap:false` 都不触发、`autoBootstrap:"no"` 装配期抛错）；`pnpm typecheck` 错误数 ≤ 223。

### t5 · 客户端删除面

- **implementation**：删 `src/client/views/knowledge.ts`、`src/client/page/register-knowledge.ts`、`src/client/styles/knowledge.ts`、`tests/kb-client-page.test.ts`、`scripts/knowledge-page-probe.mts`；改 `src/client/index.ts`（import + 注册两行）与 `src/client/styles.ts`（`KNOWLEDGE_CSS`）；同步 `docs/architecture/project-manual.md` 侧栏表与 `README.md` 知识层节。
- **acceptance**：`grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS" src/ scripts/ tests/` **零命中**（退出码 1）；`pnpm build:client` 输出 `[verify-client] OK`；`npx vitest run tests/client-page-register.test.ts tests/client-page-panel.test.ts tests/host-panel.test.ts` 全绿。

### t6 · 迁移、兼容与基线

- **implementation**：新增 `tests/kb-bootstrap-compat.test.ts`：`autoBootstrap:false` / `enabled:false` / 不写配置三态；本仓影子副本自举后零写入；`legacy-cwd` 与 `session` 两种读根各作用于该根。证据落 `docs/requirements/REQ-261004174324-4195/evidence/baseline.txt`（`pnpm test` / `pnpm typecheck` 退出码与失败数）与 `evidence/kb-check.txt`。
- **acceptance**：`npx vitest run tests/kb-bootstrap-compat.test.ts` 全绿；`pnpm kb:check` 退出码 `0`；两份证据文件在场且含命令原文与实测数字。

### t7 · 端到端演练

- **implementation**：`mktemp -d` 空项目用 `npx tsx scripts/kb-build.mts --write --root <dir>` 跑一次 → 记录 5 产物；再跑一次比对 `mtime`；手写 `architecture.md` 与 INDEX 手写行后重跑验证保护；执行删除面 grep 与四条门禁；证据落 `evidence/e2e-bootstrap.txt`、`e2e-idempotent.txt`、`grep-deleted.txt`、`gates.txt`、`manual-protect.txt`。
- **acceptance**：5 份证据在场；`pnpm build` 退出码 `0`；`pnpm test` 失败数 ≤ 106 且新增用例全绿；`pnpm typecheck` ≤ 223；`pnpm kb:check` 退出码 `0`。

## 交付总口径（全部卡完成后）

1. 空项目启动一次 → `docs/knowledge/` 5 个产物出现；再启动零变化。
2. 侧栏无「知识库」；`grep pmboard-knowledge` 零命中；`/kb` 路由与 `reqboard_kb` 签名不变。
3. 四条门禁（build / build:client / typecheck / test+kb:check）达到上文阈值，证据落盘。
