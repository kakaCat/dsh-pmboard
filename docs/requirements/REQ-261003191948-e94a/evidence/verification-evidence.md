# 验收证据 · REQ-261003191948-e94a

> 采集时间：2026-10-03（本地 19:4x） ｜ 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 采集时的运行态：宿主 **19:38:10 重启过**（热重载不加载新宿主代码，已用标记实验证实——见文末 §4）。

## §1 三条回归命令（t7 验收项 ①）

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/reqboard/migration-gate.test.ts` | ✓ 7 passed |
| `npx vitest run tests/reqboard/degraded-startup.test.ts` | ✓ 11 passed（t2 信封 5 + t3 handler 3 + t4 接线 3） |
| `npx vitest run tests/api-client.test.ts` | ✓ 8 passed（既有 3 + t5/t6 新增 5） |
| `npx vitest run tests/reqboard/task-read-root-sync.test.ts` | ✓ 2 passed（计划外修复的回归，见 §5） |

三者合并运行：`Test Files 4 passed / Tests 28 passed`。

**修前必红（t1 的机械证明）**：把 `TaskTree.ts` 的 `agentIdFromExec(...)` 临时回退成
`deps.session.windowKey(exec)` → `task-read-root-sync.test.ts` **1 failed**；还原即绿。
（同法用于 t2：`envelope.ts` 不存在时该文件 import 失败，本层全红。）

## §2 兼容性核验（t7 验收项 ②，A7 / FR-9）

| 夹具 | `preflightLedger` | 说明 |
|---|---|---|
| 单册在、`meta.json` 不在 | `ok:false`（code=`REQBOARD_REQUIRES_MIGRATION`） | 相 2「未就绪」：注册降级路由后 return，不抛 |
| 单册在、`meta.json` 在 | `ok:true` | 相 1「正常」：装配逐字节不变 |
| 两者皆无（全新安装） | `ok:true` | 同上 |

- **旧调用方零回退**：`assertLedgerMigrated` 仍是抛错入口，`code` 与 `message` 逐字不变，
  只多一个 `hint` 字段；`tests/reqboard/migration-gate.test.ts` 既有 4 条用例未改动即全绿。
- **不带 hint 的错误响应体逐字节不变**：`degraded-startup.test.ts` 有一条显式断言
  「`REQBOARD_BRIDGE_NOT_READY` 的响应体**不含** `hint` 键」。
- **`apply` 的分叉只看 `preflight.ok`**：静态断言 `src/index.ts` 中不出现字面量
  `REQBOARD_REQUIRES_MIGRATION`（防止"只覆盖迁移门"的边界被悄悄放宽 → A7）。

## §3 纪律命令（C-12 / C-14 / C-15）

```
pnpm build            → 退出码 0；host dist 1.32 MB；client `[verify-client] OK  bundle=336415 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整`
npx tsc --noEmit      → 150 error（基线 223）→ 不高于基线；**改动文件零错误**
npx vitest run（全量）  → 98 failed / 3337 passed（基线 106 failed / 2807 passed）→ 失败数不高于基线
```

**改动文件类型错误 0 的核验方式**：对 `src/http/envelope.ts`、`src/http/not-ready.ts`、
`src/wiring/not-ready.ts`、`src/client/api.ts`、`src/client/render/dom-utils.ts`、
`src/client/board-mount.ts`、`src/application/use-cases/TaskTree.ts`、`src/tools/AdvanceTool/*`、
`src/tools/RunStatusTool/*`、`tests/reqboard/*`、`tests/api-client.test.ts` 过滤 `tsc` 输出为 0 条。
唯一命中 `src/index.ts` 的是 `ctx.emit` 重载报错（历史既有，行号随本次插入而后移）。

**关于基线的诚实说明**：C-14 记录的基线是 106/2807（较早快照），本次全量为 98/3337——
通过用例多出 530 条说明仓库已前进；"失败数不高于基线"这一条判据仍成立，但**不是**同一 commit 的逐项比对。

**定向核验**：把所有 import 到我改动面的用例文件（`createReqboardHandler` / `http/routes` /
`client/api` / `dom-utils`，共 40 个文件）一起跑：`357 passed / 9 failed`。
9 条失败分属 `design-completeness-gate.test.ts`（5）、`routes-rollup.test.ts`（2）、
`plan-mode.test.ts`（1）、`size-budget.test.ts`（1）——均为**设计门 / 状态 rollup / 尺寸门**，
与本次改动的面（信封、503 映射、根校正、客户端错误体）无关；
把 `routes.ts` 精确回退到 HEAD 后这 3 个文件反而变成 **19 failed**（工作区含未提交 WIP），
即这些失败**不是**本次改动引入。

## §4 热重载不加载新宿主代码（实验记录）

在 `dist/index.mjs` 的 `/health` 响应里插入临时标记 `probe:"RELOAD-BUSTS-CACHE"` →
按既有手法热重载插件 → `curl /health` **未出现**该标记 → 判定：插件热重载只重组 loader 树，
**不会重新 import 宿主模块**（ESM 模块缓存）。
标记随后已还原（`grep -c RELOAD-BUSTS-CACHE dist/index.mjs` = 0），并由 `pnpm build` 重建。

→ 结论：宿主侧任何修复都必须**重启 App**才生效；`reqboard_task_run` 的自动链也一样。

## §5 计划外改动（如实申报，不在已批准的 7 张卡里）

本次实施期间实测暴露两处真缺陷，均为**阻塞性**（不修则看板任务页为空、子卡链无法推进）。
两处都超出 `decomposition.md` 已批准范围，且 `implementing` 态下无法重交计划（`reqboard_submit(kind=plan)`
要求 `decomposing`）、也无法再 `reqboard_decompose`（已有任务会被拒），故在此显式申报而非塞进某张卡。

### 5.1 任务读取入口绕过工作区根收敛点（**已修并验证**）

- 现象：插件热重载后 `reqboard_task_tree` / `reqboard_task_run` 恒报
  「任务不存在」，而 `queue.json` 里 10 张卡完好；看板「任务」页空白。
- 根因：启动时 `workspaceRoot = process.cwd()`（desktop 下是 `~/.dsh/profiles/desktop`，
  重启后更是 `/`），而仓库既有的**唯一收敛点** `agentIdFromExec()`（用会话 cwd 校正
  docs 与 queueRepo）只在写入类用例里被调用；三个任务读取入口直连
  `deps.session.windowKey(exec)`，绕过了它。旧实例之所以正常，只是此前写入调用顺手校正过根。
- 修法：`TaskTree.ts`、`AdvanceTool.ts`、`RunStatusTool.ts` 三个入口改走 `agentIdFromExec`。
- 证据：新增 `tests/reqboard/task-read-root-sync.test.ts`（正例 + 反例），**修前必红已证**；
  重启后 `reqboard_task_tree` 立即读到 1 父卡 + 3 子卡（修复前恒为 `REQBOARD_TASK_NOT_FOUND`）。

### 5.2 子卡执行引擎取不到 —— **已定性为 DSH 架构约束（不是取法问题）**

- 现象：子卡链每一次 `RUN_SUBTASK` 都失败于 `子卡凭证不过：workflow run 未完成
  （stopReason=engine_unavailable）`。共 4 次：11:25:05、11:35:45（首次重启后）、
  11:38:29（二次重启后）、11:45:13（三次重启后，带探针）。

- 第 4 次的 stopReason 由 `engine_unavailable` 变为
  **`run 异常：cannot get property "workflowEngine" without inject`** ——
  这是 cordis 对"未声明 inject 就访问服务属性"的硬拒绝。即：`ctx.get('workflowEngine')`
  恒 `undefined`，而 `ctx.workflowEngine` 属性访问会被守卫直接拒掉。

- **配置级证据（决定性）**：`packages/bundle/web-app/presets/cordis.patch.yml`（agent preset）：

  ```yaml
  - id: delegation
    name: cordis:group
    group: true
    isolate:
      workflowEngine: true        # ← 引擎被刻意隔离在 delegation 组内
    config:
      - id: workflow-ptc   ; name: '@deepseek-ai/dsh-workflow-ptc'
      - id: tool-workflow  ; name: '@deepseek-ai/dsh-tool-workflow'
  ```

  `isolate: { workflowEngine: true }` 把引擎**圈定在 agent 的 delegation 组内**，
  profile 级插件按设计就看不见它。这一条解释了全部观察：
  - `workflow` 工具（在 agent 作用域内）能正常起 run；
  - pmboard（profile 级 bundle）的 `inject(['workflowEngine'])` 回调**永不触发**；
  - `ctx.get('workflowEngine')` 恒 `undefined`。

- **结论**：pmboard 代码注释里那句「workflow-worker-thread provider，**已在位**」
  在本 DSH 版本下不成立；且**不是取法写错**——改多少次 `ctx.get` / `inject` 都不会好。
  需要架构层改动（另立需求）。

- **本次止损**：新增 `ENGINE-PROBE` 诊断（仅在解析失败时写一行，含对照组
  `tools`/`agents`/`webServer`），并**移除**探针里对 `ctx.workflowEngine` 的属性访问——
  那是我在定位过程中引入的回归：属性访问抛异常，会把 runner 原本优雅的
  `engine_unavailable` 变成 run 异常（`byProp=` 在 src 与 dist 中均为 0，已核验）。

- **影响**：**t1 的三张子卡无法取得凭证 → t1 父卡无法收尾 → 卡片勾稽整体停摆**。
  代码交付不受影响（t1–t6 的实现与用例都已落盘并自证）。

- **建议的后续需求方向**（三选一，需人裁定）：
  1. 子卡执行改走 pmboard **确实可达**的端口（`agents` / `subagents` / `ctx.jobs` 直接驱动），
     彻底去掉对 `workflowEngine` 的依赖；
  2. 在 profile 层另起一个工作流引擎实例（与 preset 的 `isolate` 设计相冲突，需评估）；
  3. 把子卡的"凭证"改为接受**本窗口自证**（`reqboard_task_report` + 文件 mtime），
     即不再要求 workflow run 证据。

## §6 未完成的验收项（不冒充完成）

- t7 的「与 HEAD 基线逐项比对」只做到**总数比对**（98 ≤ 106），未做到同 commit 逐项 diff；
  上表 §3 已如实标注该局限。
- 7 张卡的 `reqboard_task_report` / `reqboard_task_move` 勾稽**未完成**：受 §5.2 阻塞，
  t1 子卡无法取得凭证（`REQBOARD_SUBTASK_GATE`），父卡随之无法收尾。
