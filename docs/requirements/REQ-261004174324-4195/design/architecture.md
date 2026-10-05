---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 设计 · 架构（REQ-261004174324-4195 知识层自动自举）

## 现状与目标 `serves: FR-1, FR-2`

**现状（已核实）**

| 事实 | 位置 |
|---|---|
| 读根按会话解析，插件激活时根**未知**（宿主 cwd 是 profile 目录，不是项目） | [shared.ts:183](src/http/routers/shared.ts#L183)、[FileDocRepository.ts:37-39](src/adapters/FileDocRepository.ts#L37-L39) |
| 根校正有两个入口：应用层 `applyWorkspaceRoot`、HTTP 层 `resolveDocRoot` | [support.ts:105-118](src/application/internal/support.ts#L105-L118)、[shared.ts:166-190](src/http/routers/shared.ts#L166-L190) |
| 生成器是脚本：`ROOT = process.cwd()`，逻辑与打印混在一处 | [kb-build.mts:23](scripts/kb-build.mts#L23) |
| 读取端口已够用：`exists/read/write/list/stat/resolve/workspaceRoot` | [ports.ts:556-573](src/application/ports.ts#L556-L573) |

**目标**：生成规则单点（用例），触发收敛为"根已确定"的通知；缺层时自动补，已存在则零写入。

**不做**：不改知识层语法（`domain/knowledge/**` 规则不动）、不改 `/kb` 路由与 `reqboard_kb`、不引入新运行时依赖。

## 模块划分与依赖方向 `serves: FR-4`

```
scripts/kb-build.mts（薄包装：argv + 打印 + 退出码）
        │
        ▼
src/application/use-cases/EnsureKnowledgeLayer.ts   ← 宿主启动路径也调它
   ├── 只依赖端口：DocRepository（读写/列举）、KbSourcePort（结构上就是 DocRepository）
   └── 调用 domain 纯渲染
        │
        ▼
src/domain/knowledge/generate.ts（纯函数：抽符号 / 渲染页面与 TSV / INDEX 骨架 / 生成区替换）
```

- **依赖方向只许向内**（C-01）：`domain/generate.ts` 零 IO、零 fs import；扫描与写入全部在用例层经端口。
- **单点**：`scripts/kb-build.mts` 不再含生成规则，只解析 `--write|--check|--backfill`、打印逐文件行、给退出码。
- **端口**：新增窄端口 `KbSourcePort { list(relDir), read(relPath) }`（`FileDocRepository` 已结构化满足，**零新适配器代码**）；用例只声明它需要的方法，测试可用内存假实现。

## 触发链：根确定的三个通知点 `serves: FR-2`

| # | 通知点 | 覆盖场景 | 时机 |
|---|---|---|---|
| 1 | 组合根激活末尾：`ensure(docs.workspaceRoot())` | 宿主启动目录就是项目（`legacy-cwd` 回落） | 异步、不阻塞 apply |
| 2 | `applyWorkspaceRoot(deps, root)` 之后 | Agent/工具路径：会话 cwd 校正根 | 异步、不阻塞用例 |
| 3 | `resolveDocRoot(...)` 命中 `source='session'` 后 | 纯看板路径：只开页面不跑工具的项目 | 异步、不阻塞请求 |

三处只做**一件事**：告诉协调器"这个根确定了"。生成逻辑一律在用例内，通知点不读不写文件。

**为什么不是只挂一处**：会话模式下根在激活时未知（事实表第 1 行），只挂激活等于永不触发；只挂 HTTP 则纯工具路径不触发；只挂应用层则"只看看板"的项目不触发。三处 + 进程内去重 = 覆盖两个入口且零重复开销。

## 幂等与去重 `serves: FR-2, FR-5`

- 协调器 `KnowledgeBootstrap` 持有 `Map<realKey, Promise<KbEnsureResult>>`：`realKey` = `realpath(root)` 归一（复用 `sameProjectRoot` 口径），**同根并发只跑一次**（第二个调用者 await 同一个 promise）。
- 用例内部再判一次存在性：`INDEX.md` 在 → `skipped{reason:'index-exists'}`，立即返回，**不读源码、不写任何文件**（已有知识层的项目开销 = 一次 `existsSync`）。
- 失败记在 `Map` 里（`status:'failed'`），进程内**不自动重试**；只有显式 `force:true`（测试 / CLI）才重跑。
- 写入前逐文件比对内容：相同 → 跳过（保 mtime）；不同且属生成物 → 写；手写页 → 不写。

## 失败语义 `serves: FR-5`

- 根不确定（`workspaceRoot()` 为空）→ `status:'skipped', reason:'root-unknown'`，不猜目录。
- 写入失败（权限/磁盘）→ `status:'failed'`，带 `{ root, failedPath, reason, written: string[], skipped: string[] }`；**不抛到宿主**（启动不中断），但宿主 `logger.warn` 打出完整结构化对象。
- **根漂移保护**：用例进入时捕获 `root`；每次写入前断言 `sameProjectRoot(docs.workspaceRoot(), captured)`，不等 → 中止并以 `reason:'root-drifted'` 报出（避免异步生成中途根被别的会话改掉而写错项目）。
- 生成物超预算（页 >200 行 / INDEX >8000 字符）→ 沿用既有预算规则截断并在页内标注（不静默裁）。

## 删除面与保留面 `serves: FR-1`

**删除（6 处，已核实无其他引用）**

| 文件 | 说明 |
|---|---|
| `src/client/views/knowledge.ts` | 视图（117 行） |
| `src/client/page/register-knowledge.ts` | 页面注册（68 行） |
| `src/client/styles/knowledge.ts` | 样式区段（30 行） |
| `src/client/index.ts` | 删第 18 行 import、第 79 行注册 |
| `src/client/styles.ts` | 删 `KNOWLEDGE_CSS` import 与拼接项 |
| `tests/kb-client-page.test.ts`、`scripts/knowledge-page-probe.mts` | 只服务于该页的测试与几何探针 |

**保留**：`src/domain/knowledge/**`、`src/adapters/KnowledgeRepository.ts`、`GET /dashboard/api/reqboard/kb`（含 `pages[]` 清点）、`reqboard_kb`、归档沉淀、`tests/kb-route.test.ts`、`tests/kb-repository.test.ts`、`tests/kb-archive-deposit.test.ts`。

**构建门禁安全性（已核实）**：`scripts/verify-client-build.mjs` 的 `must` 关键符号清单**不含**任何 `knowledge` 符号（[verify-client-build.mjs:33-47](scripts/verify-client-build.mjs#L33-L47)），删除不触发"缺关键符号"；归属章与分片校验只依赖 `styles.ts` 的拼接完整性。

## 迁移、灰度与回滚 `serves: FR-6`

- **迁移**：无数据迁移（知识库页无状态；自举只新增文件）。
- **灰度**：`knowledge.autoBootstrap`（默认 true）；`knowledge.enabled:false` 优先级更高 = 整层停用（工具空集 + 不自举）。
- **回滚**：① 关 `autoBootstrap` → 回到"手动跑 `pnpm kb:build`"；② revert 提交 → 入口与页面回来。
- **本仓自保**：本仓已有知识层 → 自举只做一次 `existsSync` 判定即返回，`pnpm kb:check` 前后零漂移（验收命令见 test-cases）。

## 门禁与回归口径 `serves: FR-7`

- **删除面**以"源码零命中"为准（`grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS" src/ scripts/ tests/` → 无输出），不靠人工记忆。
- **自举面**以四态断言为准（缺 / 在 / 不完整 / 只读失败）+ 幂等（内容与 mtime 双不变）+ 不覆盖手写（diff 为空）。
- **门禁阈值**：`pnpm build`、`pnpm build:client`（C-12 归属章与分片）、`pnpm kb:check`（C-13 零漂移）、`pnpm typecheck` ≤223、`pnpm test` ≤106。
- **口径落点**：用例表与命令清单在 `design/test-cases.md`；注意 **RTM 的设计覆盖度刻意排除 `design/test-cases.md`**（`vendor/reqboard/src/rtm/context.ts` 的 `TEST_DOC_NAMES`：测试策略类文档不是可实施设计单元），故本章与 interfaces.md 才是 RTM 认账的 serves 来源。

## 文档同步 `serves: FR-1`

| 文档 | 改什么 |
|---|---|
| `docs/architecture/project-manual.md:663` | 侧栏插槽表删掉 `pmboard-knowledge` 行（否则说明书指向一个不存在的页面） |
| `README.md`「项目知识层」节 | 补一句"缺层由插件自动自举"；工具表与产物表不变 |
| `docs/knowledge/INDEX.md` | 归档时沉淀本次结论（不在本需求内提前写） |
