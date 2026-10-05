---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 拆分计划（REQ-261003215944-9e04）

> **目标一句话**：把「一需求 = 一个独占窗口」换成「一需求 = 一个 owner + 若干席位」，
> 用 DSH 现成的会话 fork 给 pmboard 造新窗口、把 Dive 的八处散写收敛成一个方法、并把文档读根改回会话工作区。
> **做法一句话**：契约先行（席位表 + Dive 事件表）→ 两处接线（开窗/投递、读数根）→ 一张兼容卡兜底 → 一张验收卡收口。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | `requirement.md` 功能点表 | 需求条款（FR-1 … FR-11） |
| TC-x | `design/test-cases.md` 用例表 | 测试用例（TC-1 … TC-36） |
| UC-x | `design/use-cases.md` 场景总览 | 用户场景（UC-1 … UC-8） |
| t1 … t14 | 本文档任务表 | 任务（落库后回填 `t-xxxxxx`） |

**本需求无 `frontend.md` / `backend.md`**（`requirement.md` front-matter 未声明 `sides`，本仓是插件而非前后端分离应用），
故覆盖对照的「页面/模块」格**直接给文件路径**（取自 `design/architecture.md` 的改动清单），不造 `P-x`/`S-x` 编号。

## 决策点（已按设计默认裁定）

设计文档列的决策点按**选项 A** 落：保留「回退即解除自动链」这条既有不变量，
但把它变成显式事件 `disarm-rollback` 并**如实记录 actor**（人经看板 = `human`；agent 经 `reqboard_move` = `agent`）。
不收紧「只有人能触发回退」——那会拿掉 `docs/architecture/requirement-rollback.md` 刚补上的 agent 自纠错能力。
（若你不同意，请在批准时说明，我改计划；改动只影响 t10。）

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （回填） | 定义席位数据契约与读端折算 | FR-2 | `src/shared/protocol.ts`、`src/application/internal/window.ts` | implement | backend | — | S | `pnpm test -- tests/seat-fold.test.ts` 绿：`seats` 缺省折算为单 owner；`sourceSessionId` 缺失折算为空数组（不伪造 owner）；`pnpm typecheck` 退出码 0 | dev,review |
| t2 | （回填） | 把授权判定从"窗口绑定"改为"席位授权" | FR-3 | `src/application/internal/window.ts`、`src/application/internal/binding-read.ts`、15 个用例校验点 | implement | backend | t1 | M | `canWrite` 单测覆盖 6 个动作 × 3 个角色全绿；`grep -rn "bound\[0\]" src/` **零命中**；worker 推阶段被拒用例在场 | dev,review |
| t3 | （回填） | 新增 reqboard_bind 并让 status 暴露席位 | FR-2, FR-3 | `src/tools/BindTool/`、`src/application/use-cases/BindSeat.ts`、`src/tools/StatusTool/` | implement | backend | t1, t2 | M | 调 `reqboard_bind({role:'worker'})` 后 `record.json` 的 `seats` 长度为 2 且 owner 项逐字未变；解绑 owner 返回 `REQBOARD_INVALID_INPUT`；`reqboard_status.seats` 与台账一致 | dev,integrate,review,test |
| t4 | （回填） | 新增 reqboard_open_window 并走 DSH 会话 fork | FR-1, FR-8 | `src/tools/OpenWindowTool/`、`src/adapters/SessionWindowOpener.ts`、`src/application/use-cases/OpenWindow.ts` | implement | backend | — | M | 调 `reqboard_open_window({mode:'fork'})` 返回 `session-` 开头且 ≠ 源窗口的 `windowKey`；无完成回合时返回 `REQBOARD_OPEN_WINDOW_UNAVAILABLE`；返回文案 grep「已打开」零命中 | dev,integrate,review,test |
| t5 | （回填） | 跨窗口投递自署 kind 并修冷会话断点 | FR-7 | `src/adapters/AgentDeliverer.ts`、`src/application/use-cases/OpenWindow.ts` | implement | backend | t4 | M | 对已冷却会话席位投递：resume 成功、起一个回合、`source.kind === 'reqboard-open-window'`；`grep -rn "sessionController.prompt" src/` **零命中** | dev,integrate,review,test |
| t6 | （回填） | 让本窗口能接第二个项目 | FR-4 | `src/application/use-cases/CaptureRequirement.ts`、`src/tools/CaptureTool/`、`src/application/internal/support.ts` | implement | backend | t1, t4 | M | 已绑定需求时调 `reqboard_capture({onWindowBound:'second'})` → `success:true` 且新需求 `sourceSessionId` = 本窗口；`grep -rn "REQBOARD_WINDOW_BOUND" src/` 仅剩显式拒绝分支 | dev,integrate,review,test |
| t7 | （回填） | 把"自主预立项/预拆分不破门"写成红线断言 | FR-5, FR-6 | `tests/`（新增断言）、`src/application/use-cases/OpenWindow.ts`（底稿文本） | implement | backend | t5, t6 | S | 无 `source.kind==='user'` 的回合调 `reqboard_capture` 仍 `REQBOARD_DIRECT_HUMAN_REQUIRED`；未批准计划时 `reqboard_decompose` 仍 `REQBOARD_PLAN_NOT_APPROVED`；两条断言在 CI 里跑 | dev,review |
| t8 | （回填） | 实现 Dive 事件纯函数与八事件表 | FR-9 | `src/domain/dive/transition.ts`、`tests/dive-transition.test.ts` | implement | backend | — | M | 8 个事件各一单测全绿；非法事件矩阵 `changed:false` 且 `next` 与 `prev` 结构相等；`pnpm test -- tests/layer-boundary.test.ts` 绿（域层零 import 外层） | dev,review |
| t9 | （回填） | 实现 applyDiveTransition 唯一写盘入口 | FR-9 | `src/application/dive/applyDiveTransition.ts` | implement | backend | t8 | M | 幂等（同事件连调两次第二次 `changed:false`）；弹框在途时 `confirm-advance`/`recover-auto` 零写入；入口永不抛（用假 store 抛错验证被吞并留痕） | dev,review |
| t10 | （回填） | 收敛六处调用点到唯一入口 | FR-9 | `src/application/internal/support.ts`、`use-cases/ClearPause.ts`、`internal/rearm.ts`、`internal/token-usage.ts`、`dive/round-driver.ts`、`internal/rollback.ts` | implement | backend | t9 | M | 两条 grep 只命中 `src/domain/dive/transition.ts` 与其单测：`grep -rn "roundsInStage *= *0" src/ \| grep -v migrate-dive-state`、`grep -rn "activation *= *'" src/ \| grep -v migrate-dive-state`；回退路径 `disarm-rollback` 行为与改前逐字一致 | dev,integrate,review,test |
| t11 | （回填） | 把推进弹框与看板「继续」接到同一方法 | FR-10 | `src/application/use-cases/AskConfirm.ts`、`ConfirmArtifact.ts`、`src/http/routers/requirements.ts` | implement | backend | t10 | M | `round-limit` 暂停下确认推进 → `roundsInStage` 归零 + `driverHealth` 复位 `healthy` 且 `activation` 未变；`clear_pause` 后确认推进 → `activation` 仍 `disarmed` | dev,integrate,review,test |
| t12 | （回填） | 文档读根与会话同源（服务端 + 客户端） | FR-11 | `src/http/routers/artifacts.ts`、`src/http/routes.ts`、`src/index.ts`、`src/client/open-doc.ts`、`src/client/board-mount.ts` | implement | fullstack | — | M | `curl -s localhost:19387/dashboard/api/reqboard/state` 的 `workspaceRoot` == 会话工作区；`docs/resolve` 对 `README.md`、`docs/knowledge/INDEX.md` 均返回 `openable:true`；`pnpm build:client` 退出码 0（改了客户端必须重建） | dev,integrate,review,test |
| t13 | （回填） | 迁移与兼容：存量零改写 + 回滚开关 | FR-2, FR-9, FR-11 | `tests/`（存量夹具）、`src/index.ts`（配置）、`docs/` | implement | backend | t1, t10, t12 | S | 39 条存量需求读出折算单 owner 且 `record.json` 字节不变（前后 `shasum` 相等）；`REQBOARD_SCHEMA_VERSION` 仍为 9；`docs.rootSource='legacy-cwd'` 时 `docs/resolve` 行为回到改前 | dev,review |
| t14 | （回填） | 端到端验收与项目文档更新 | FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-9, FR-10, FR-11 | `docs/architecture/project-manual.md`、`README.md`、`docs/knowledge/` | test | fullstack | t1–t13 | M | `pnpm typecheck && pnpm test && pnpm build && pnpm kb:check` 四条退出码 0；人工走一遍 UC-1/UC-2/UC-7（侧栏出现新会话、右侧栏渲染 README 正文）；README 工具表含 `reqboard_open_window`/`reqboard_bind` | dev,review,test |

**工作量**：S×5 / M×9 / L×0 —— **无 L 卡**（按口径 L 不许直接落卡）。

## 覆盖对照

| 需求条款 | 接口（interfaces.md 章节） | 页面/模块（architecture.md 改动清单 + 文件路径） | 测试用例（test-cases.md） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 fork 开窗 | Agent 工具：reqboard_open_window | `src/application/use-cases/OpenWindow.ts`、`src/adapters/SessionWindowOpener.ts` | TC-1, TC-2, TC-5 | t4 | ✅ |
| FR-2 席位模型 | Agent 工具：reqboard_bind；reqboard_status（修改） | `src/shared/protocol.ts`、`src/application/use-cases/BindSeat.ts` | TC-6, TC-7, TC-34, TC-35 | t1, t3 | ✅ |
| FR-3 按席位授权 | 内部接口：applyDiveTransition 之外的授权判定（`canWrite`） | `src/application/internal/window.ts`、`src/application/internal/binding-read.ts` | TC-8, TC-9, TC-10 | t2, t3 | ✅ |
| FR-4 本窗口多项目 | Agent 工具：reqboard_capture（修改） | `src/application/use-cases/CaptureRequirement.ts` | TC-11, TC-12 | t6 | ✅ |
| FR-5 自主预立项 | Agent 工具：reqboard_capture（修改，`onWindowBound` 分支） | `src/application/use-cases/OpenWindow.ts`（底稿） | TC-13, TC-15 | t7 | ✅ |
| FR-6 自主预拆分 | Agent 工具：reqboard_submit（不变，红线断言） | `tests/`（计划未批准即拒的断言） | TC-14, TC-15 | t7 | ✅ |
| FR-7 自署 kind 投递 | 内部接口：Dive 状态转化（同层依赖 resolveAgent） | `src/adapters/AgentDeliverer.ts` | TC-3, TC-4 | t5 | ✅ |
| FR-8 诚实降级 | Agent 工具：reqboard_open_window 的 `degradedNote` | `src/tools/OpenWindowTool/` | TC-2, TC-5 | t4 | ✅ |
| FR-9 Dive 单一封装 | 内部接口：Dive 状态转化（transitionDive / applyDiveTransition） | `src/domain/dive/transition.ts`、`src/application/dive/applyDiveTransition.ts` | TC-16–TC-25 | t8, t9, t10 | ✅ |
| FR-10 推进弹框接线 | 内部接口：Dive 状态转化（调用方表） | `src/application/use-cases/AskConfirm.ts`、`src/http/routers/requirements.ts` | TC-26–TC-29 | t11 | ✅ |
| FR-11 读根同源 | HTTP：看板接口（修改）；客户端接口（修改） | `src/http/routers/artifacts.ts`、`src/client/open-doc.ts` | TC-30–TC-33 | t12, t13 | ✅ |
| **合计** | 9 个接口/章节 | 14 个模块落点 | 36 条用例（TC-1…TC-36） | 14 张任务 | **11/11 条款有主** |

## 覆盖完整性规则（自检）

1. **每行三格不空**：11 行全部填满；无一行使用"纯文档条款"豁免。
2. **反向无超范围**：`test-cases.md` 的 TC-1…TC-36 全部能在上表找到接收任务（TC-22b/22c 属 TC-22 家族，落在 t8/t10）；
   `architecture.md` 改动清单 19 行全部落在 t1–t14 内，无孤儿设计。
3. **每条款有主**：FR-1…FR-11 逐条有接收任务，无孤儿条款。

## 实施顺序（依赖决定）

```
第一批（可并行）      t1(席位契约)   t4(开窗)   t8(Dive 纯函数)   t12(读根)
                        │             │            │                │
第二批                t2(授权)      t5(投递)     t9(写入口)       (t12 自立)
                        │             │            │
第三批                t3(bind)  t6(多项目)      t10(收敛六处)
                        │             │            │
第四批                t7(红线断言)   t11(弹框接线)
                        └──────┬──────┴────────────┘
第五批                      t13(兼容兜底) ──▶ t14(端到端 + 文档)
```
