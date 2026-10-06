# 测试证据（REQ-261005143615-5ab1）

> 本文件是**可复核证据的索引**：每条判据给出命令、期望与实测。原始输出另存
> [../evidence/t5-reconcile.md](../evidence/t5-reconcile.md)。

## 一、单元 / 组件用例（覆盖 FR-1…FR-5）

| # | covers | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| T1 | FR-3, FR-4 | `npx vitest run tests/query-docs-contract.test.ts` | 枚举含 `unknown`、两字段可选、两口可选 | **4 passed** |
| T2 | FR-1, FR-2, FR-3 | `npx vitest run tests/query-docs-roots.test.ts` | TC-1 需求根命中且无缺失 / TC-2 会话根回退 / TC-3 诚实缺失 / TC-4 全 unknown 且无 absPath（+未登记行同规则、+旧接线缺省） | **6 passed** |
| T3 | FR-5 | `npx vitest run tests/query-docs-compat.test.ts` | 旧接线逐字段回旧、半装配也回旧、老形状读侧不抛错 | **3 passed** |
| T4 | FR-3, FR-4 | `npx vitest run tests/docs-panel-states.test.ts` | 有 absPath 的行显示并打开绝对路径；unknown 行不含 `line-through` / `dsh-pm-doc-missing`；file-missing 行仍含两者 | **6 passed** |
| T5 | 回归 | `npx vitest run tests/query-docs.test.ts tests/docs-panel.test.ts` | 既有文档聚合 13 例 + 面板渲染 35 例零回归 | **48 passed** |

合计：`6 files / 67 passed`。

## 二、真机对账（真实台账 + 真实磁盘）

| # | covers | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| E1 | FR-1 | `npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts` §① | `REQ-261005123641-3982` 不带会话：`file-missing` 计数 = 0（改前 25） | **0**（`confirmed:9, pending:16`） |
| E2 | FR-2, FR-4 | 同上 §② | 逐条 `state` 与 `os.path.exists(absPath)` 一致，分歧 = 0 | **0 分歧，25/25 带 absPath** |
| E3 | FR-3 | 同上 §③ | `REQ-260930094139-2d65`（文件真丢）仍 `file-missing` | **37/37 file-missing** |
| E4 | FR-3, FR-4 | 同上 §④ | 候选根全不可用 → 全 `unknown` 且无 `absPath` | **25 unknown / 0 absPath** |

## 三、门禁

| # | 条目 | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| G1 | C-15 类型检查 | `npx tsc --noEmit` | 退出码 0、错误数 ≤ 基线（HEAD 基线 0） | **0 error** |
| G2 | C-11 构建 | `pnpm build` | 退出码 0；`dist/index.mjs` 含新符号 | **退出码 0；`docRootsOf` 7 处 / `docsAt` 6 处** |
| G3 | C-12 客户端产物 | `pnpm build:client` | `[verify-client] OK` | **OK（bundle 591550 bytes）** |
| G4 | C-14 全量测试 | `pnpm test` | 失败数 ≤ 基线 | **68 ≤ 80**（基线 worktree `660973e`：80 failed / 4541 passed；本树 68 failed / 5375 passed） |

## 四、失败集合的如实交代

逐文件比对"本树 vs 基线"的 FAIL 列表：基线 42 个失败文件、本树 37 个；"只在现在失败"两处：

- `tests/apply-wiring.test.ts`：断言注册的工具个数（收到 26、期望 25）——同期窗口新增工具，本需求不加工具；
- `tests/move-rollback.test.ts`：`design_doc_incomplete`（design → decomposing 的设计文档集核验）——同期窗口在改的门禁链。

两处涉及模块均**不在本需求改动面**（protocol 加性字段 / contracts 两口 / QueryDocs 判定 / panels 注入 /
docs 面板与样式 / 4 份测试）。原始输出见 [../evidence/t5-reconcile.md](../evidence/t5-reconcile.md) 附录。

## 五、未覆盖与已知缺口

- **未做浏览器端到端**（本包无 jsdom、无 headless 驱动本次未接）：面板断言停留在**字符串级**
  （`data-open-doc` / 类名 / 文案），未验证真实点击后右侧栏能否打开绝对路径文件。
  理由：打开通道（`openDocInSidebar` + `dsh-resource` 绝对路径）是既有能力，本次未改；
  重启 GUI 后可人工点一次确认（已写进验收材料的已知边界）。
- **GUI 需重启才生效**：运行中的插件模块是启动时载入的，本次改动已进 `dist/` 与 `lib/client.js`。

## 六、任务覆盖（covers 标注）

> 逐张任务卡 ↔ 验证证据的对应关系。父卡与其子卡链指同一批证据（子卡是同一工作的分段执行记录）。

| covers | 任务 | 验证证据 |
|---|---|---|
| covers: t-25ebdf | 定契约：未判定态与 absPath 加性字段 + 多根读取口 | T1（`npx vitest run tests/query-docs-contract.test.ts` → 4 passed）+ G1（tsc 0 error） |
| covers: t-34ad53 | 同上 · 研发段 | T1 + G1 |
| covers: t-1f89c1 | 同上 · 联调段 | T1 + T5（既有消费方用例 48 passed） |
| covers: t-c09479 | 同上 · 复核段 | G1 + `npx vitest run tests/layer-boundary.test.ts` 的 3 处失败经 HEAD worktree 对照为存量 |
| covers: t-6bdebe | 同上 · 测试段 | T1 + T5 |
| covers: t-ac64a2 | 服务端按需求自身工作区判存在并给出绝对路径 | T2（`tests/query-docs-roots.test.ts` → 6 passed）+ E1…E4 |
| covers: t-b1d7c6 | 同上 · 研发段 | T2 |
| covers: t-8207ca | 同上 · 联调段 | T2 + T5 + G1 |
| covers: t-40d8cd | 同上 · 复核段 | 逐条对照 design/architecture.md、interfaces.md（自评审 §二） |
| covers: t-ab1cc8 | 同上 · 测试段 | T2 + T5 + G1 |
| covers: t-88ecd1 | 详情页路径格显示绝对路径、未判定不划线 | T4（`tests/docs-panel-states.test.ts` → 6 passed）+ G3（`[verify-client] OK`） |
| covers: t-7acec4 | 同上 · 研发段 | T4 |
| covers: t-f9f582 | 同上 · 联调段 | T4 + T5 + G3 |
| covers: t-ffa053 | 同上 · 复核段 | 逐条对照 design/frontend.md 呈现项（自评审 §二） |
| covers: t-5463c3 | 同上 · 测试段 | T4 + T5 + G3 |
| covers: t-1b4e66 | 兼容与回滚：两口缺省即回旧行为 | T3（`tests/query-docs-compat.test.ts` → 3 passed） |
| covers: t-108748 | 同上 · 研发段 | T3 |
| covers: t-d0993d | 同上 · 复核段 | 逐条对照 design/interfaces.md 兼容三条（自评审 §二） |
| covers: t-1e90c6 | 同上 · 测试段 | T3 + T5 |
| covers: t-9abc65 | 真机对账与全量门禁回归 | E1…E4 + G1/G2/G3/G4 |
| covers: t-3c907a | 同上 · 研发段 | E1…E4（对账脚本与原始输出落盘） |
| covers: t-3f9d76 | 同上 · 复核段 | 四条锚点与门禁读数逐条核对（自评审 §三） |
| covers: t-9f0415 | 同上 · 测试段 | 复跑对账脚本四组数一致 + T5 + G1/G2/G3 |
