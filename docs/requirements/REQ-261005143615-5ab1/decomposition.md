# 拆分计划（REQ-261005143615-5ab1） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

## 目标与做法

详情页判「登记文档在不在盘上」改按**需求自己声明的 workspaceRoot**，并新增「未判定」态；
响应加性带 `absPath` 供显示与打开。五张卡：契约 → 服务端判定 → 客户端渲染 → 兼容回滚 → 真机对账。

## 改动盘点（对照设计文档）

| 文件 | 新增/修改 | 承接 | 卡 |
|---|---|---|---|
| `src/shared/protocol.ts` | 修改 | FR-3、FR-4 | t1 |
| `src/application/query/contracts.ts` | 修改 | FR-1、FR-2 | t1 |
| `tests/query-docs-contract.test.ts` | 新增 | FR-3、FR-4 | t1 |
| `src/application/query/QueryDocs.ts` | 修改 | FR-1、FR-2、FR-3、FR-4 | t2 |
| `src/http/routers/panels.ts` | 修改 | FR-1、FR-2 | t2 |
| `tests/query-docs-roots.test.ts` | 新增 | FR-1、FR-2、FR-3 | t2 |
| `src/client/views/panels/docs.ts` | 修改 | FR-3、FR-4 | t3 |
| `tests/docs-panel-states.test.ts` | 新增 | FR-3、FR-4 | t3 |
| `tests/query-docs-compat.test.ts` | 新增 | FR-5 | t4 |
| `docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md` | 新增 | FR-1、FR-3、FR-4 | t5 |

删除：无（纯加性）。

## 任务表

| key | 标题 | phase | side | depends_on |
|---|---|---|---|---|
| t1 | 定契约：未判定态与 absPath 加性字段 + 多根读取口 | implement | backend | — |
| t2 | 服务端按需求自身工作区判存在，并给出绝对路径 | implement | backend | t1 |
| t3 | 详情页路径格显示绝对路径，未判定不划线 | implement | frontend | t1 |
| t4 | 兼容与回滚：两口缺省即回旧行为 | test | fullstack | t2 |
| t5 | 真机对账与全量门禁回归 | test | fullstack | t2, t3 |

## 逐卡细化

### t1 · 定契约：未判定态与 absPath 加性字段 + 多根读取口

- **实施方案**：`src/shared/protocol.ts` 的 `DocPanelState` 加 `'unknown'`、`DocPanelEntry` 加可选
  `absPath`、`generated[]` 加可选 `absPath`（都带「为什么加性」注释）；
  `src/application/query/contracts.ts` 的 `PanelQueryDeps` 加可选 `docRootsOf?(req)` 与
  `docsAt?(root)`（注释写明缺省 = 旧单根行为）；新增 `tests/query-docs-contract.test.ts`
  断言枚举含 `'unknown'`、两字段可选、两口存在（类型级 + 运行级）。
- **验收**：`npx vitest run tests/query-docs-contract.test.ts` 全绿；
  `pnpm typecheck` 退出码 0（错误数不高于 223）；旧 `tests/query-docs*.test.ts` 仍全绿（加性未破坏旧形状）。

### t2 · 服务端按需求自身工作区判存在，并给出绝对路径

- **实施方案**：`QueryDocs.ts` 取 `req` 后调 `deps.docRootsOf?.(req)` 建根表（缺省回旧单根），
  逐条产物按序命中即定 `state` 与 `absPath = repo.resolve(path)`；候选非空而全不命中 → `file-missing`，
  候选为空 → `unknown`；`generatedOf` / `prototypeRolesOf` / `unregistered` 行同根同类判定；
  `src/http/routers/panels.ts` 的 `depsForSession` 注入两口（候选序 = 需求根 → 会话根 → cwd，
  去空去重 + `existsSync` 过滤；`docsAt` = `new FileDocRepository({workspaceRoot: root})`）；
  新增 `tests/query-docs-roots.test.ts` 覆盖 TC-1…TC-4（假根 + 假仓储，不碰真盘）。
- **验收**：`npx vitest run tests/query-docs-roots.test.ts` 全绿，且四个用例名分别对应
  TC-1 需求根命中（absPath 以需求根开头、无 file-missing）、TC-2 会话根回退命中、
  TC-3 根可用而文件不在 → `file-missing`、TC-4 根全不可用 → 全 `unknown` 且无 `absPath`。

### t3 · 详情页路径格显示绝对路径，未判定不划线

- **实施方案**：`src/client/views/panels/docs.ts` 路径格优先渲染 `absPath`（`data-open-doc = absPath`，
  小字给台账相对路径 `data-doc-relpath`）；`stateText`/`stateNote` 加 `unknown`（「未判定」/
  「读根不可得…」）；`unknown` 行**不套** `dsh-pm-doc-missing` 内联划线；`generated` 行同规则；
  新增 `tests/docs-panel-states.test.ts` 断言 TC-5/TC-6。
- **验收**：`npx vitest run tests/docs-panel-states.test.ts` 全绿（含：unknown 行 HTML 不含
  `line-through` 与 `dsh-pm-doc-missing`；file-missing 行仍含两者）；
  `pnpm build:client` 输出 `[verify-client] OK`（C-12）。

### t4 · 兼容与回滚：两口缺省即回旧行为

- **实施方案**：新增 `tests/query-docs-compat.test.ts`：不注入 `docRootsOf`/`docsAt` 时
  复用既有单根判据，断言响应里**无** `absPath`、**无** `unknown`（逐字段与旧行为一致）；
  再断言老形状读侧（未知 state 字符串）不抛错。**不新增**src 改动；若发现旧行为被破坏，
  回滚 = 不注入两口。
- **验收**：`npx vitest run tests/query-docs-compat.test.ts` 全绿 + 既有
  `tests/query-docs*.test.ts` 集合全绿（零回归）。

### t5 · 真机对账与全量门禁回归

- **实施方案**：用真实端点跑对账脚本并把输出写进
  `docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md`：
  ① 不带 `?session=` 拉 `REQ-261005123641-3982/docs` 统计 `state` 分布；
  ② 带 `?session=<本仓会话>` 逐条 `os.path.exists(absPath)` 比对；
  ③ `REQ-260930094139-2d65` 回归必须仍 `file-missing`；
  ④ 门禁：`pnpm typecheck` / `pnpm test`（与基线比对）/ `pnpm build` + `pnpm build:client`。
- **验收**：evidence 文件含四条命令的原始输出；①的 `file-missing` 计数 = **0**（改前 25）；
  ②比对 0 分歧；③ 2d65 全 `file-missing`；④ 命令退出码与基线要求全部满足（C-11/C-12/C-14/C-15）。

## 超容量检查

`detailUnits = files×1 + anchors×0.5 + chars/2000`（容量 16 DU）：t1≈5.0、t2≈6.3、t3≈4.6、
t4≈2.9、t5≈4.5 —— **均未超容量**，无需分批。
