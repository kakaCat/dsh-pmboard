---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [backend]
---

# 需求说明（REQ-261005123641-3982 修写盘根守卫误判：共享单例根被别的窗口/看板改写 → 立项与批准落库假失败）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。

## TL;DR

- **是什么**：写盘前的「项目根守卫」把**进程共享单例**的当前根当成「本次要写入的根」。多窗口并行时，
  别的窗口（甚至只读的 `reqboard_status`、看板渲染）一改单例，本窗口的写入就被判成「要写到别的项目去」→ 响亮拒绝。
- **为什么**：`docs` / `queueRepo` 是宿主级单例，根会被**任何**窗口的用例入口（`agentIdFromExec`）
  与看板路由（`applyRequirementWorkspaceRoot`）覆写；**读侧写前都校正、写侧只核验不校正**，两侧口径不一致。
- **得到什么**：守卫按「本次调用自己的根」判定；写前把共享仓储校正到该需求声明的根；
  立项不再出现「记录已建却报立项失败」的半截态；真错配仍然响亮拒绝。

## 产品定义

守卫本身是对的（不许静默写到别的项目去，REQ-261001203710-0fbf FR-2）。错的是它**问错了对象**：
它问「共享单例现在指向哪」，而不是「本次调用属于哪个项目」。

```
窗口 A（dsh-pmboard）12:28:41 调 reqboard_capture
  └─ 入口校正：单例根 = A 项目 ✓（弹框问话 ~34 秒）
        窗口 B（dsh-notice-webhook）12:29:05 调 reqboard_status
          └─ QueryState:34 → agentIdFromExec → applyWorkspaceRoot
                └─ 单例根 := B 项目        ← 一个只读工具，却改了全局状态
  12:29:15 窗口 A 走到写前守卫：读单例 → B 项目
        └─ 记录声明 A ≠ 实际会写 B → REQBOARD_PROJECT_ROOT_MISMATCH
             ├─ 但 ④create + ⑤draft→brainstorming 已经落库
             └─ RTM 创建同步 / 回执 / used_project_root 全部丢失 → 人以为没立项
```

现场读数（本机实测，可复核）：

| 时刻（+08:00） | 事件 | 读数 |
|---|---|---|
| 12:29:15.337 | 窗口 A 的 `reqboard_capture` 回执 | `Error: 写盘被拒…记录声明的根=/Users/mac/Documents/ai/dsh/dsh-pmboard；实际会写的根=/Users/mac/Documents/ai/dsh/dsh-notice-webhook` |
| 12:29:05.158 | 窗口 B 调 `reqboard_status` | 只读调用，却把单例根改成 B 项目 |
| 12:29:15.304 / .326 | 台账 `history.jsonl` | `draft` → `brainstorming` **已落**（= 立项其实成功了） |
| 12:31:35.611 | 窗口 C 批准拆分计划的回执 | 「已落章…自动拆分/开跑失败：…PROJECT_ROOT_MISMATCH（声明 dsh-pmboard / 实际 dsh-notice-webhook）」→ **计划已批准，任务卡一张都没落** |

三类受害者（同一根因）：`reqboard_capture`（立项假失败）、批准计划后的自动落库（批准了但没卡）、
其它写盘点（RTM / 完工记录 / 验收文档 / 接收标记）。

## 用户与角色

- **窗口 agent**：多窗口并行干活的人。需要「我这一笔写到哪」只由**我自己**决定，不被邻居窗口的调用改写。
- **人工决策者**：在看板上批准计划 / 确认产物的人。需要「已批准」一定对应「已落库」，
  不需要去分辨「批准了但没有卡」这种半截态。
- **后续维护者**：需要根判定只有**一处**口径（读侧写侧同源），而不是各写盘点各自探单例。

## 边界

**做**（三条）：

1. 修**守卫的判定口径**：判定用的「实际会写的根」取自本次调用自身，不取进程共享单例的当前值；
2. 写路径**写前校正**共享仓储的根到该需求声明的根（复用读侧唯一实现），使「声明根 = 写入根」成为构造性事实；
   只在「本次调用自己的根 ≠ 记录声明根」时才拒绝；
3. 消除**半截失败**：守卫前置到副作用之前（或失败回执如实带已建 REQ id + 半截状态），并补并发回归用例。

**不做**（三条）：

1. 不改「写侧不许静默重定向到别的项目」这条设计取舍：真错配必须响亮拒绝，文案仍给两个绝对路径；
2. 不改台账 / 队列 schema，不改任何对外 HTTP 协议与工具入参形状（成功路径回执形状不变）；
3. 不做「`docs` / `queueRepo` 每窗口一个实例」的架构级改造（本次只修判定口径与校正时机；
   若实施中发现不动架构就修不掉 → 按轻档 L3 停手升级重档）。

## 功能点

- **FR-1: 守卫判定所用的「实际会写的根」必须来自本次调用自身，不得来自共享单例的当前值**
  `ensureWritableProjectRoot(deps, record)` 与 `assertWritableRequirementProject(deps, reqId)` 目前都读
  `deps.docs.workspaceRoot()`（宿主级单例，会被任何窗口 / 看板覆写）当作「即将写入的根」。
  判定输入必须换成**本次调用自己的根**（调用窗口会话 cwd，或经写前校正后的根）；
  「单例此刻指向别处」本身**不构成**错配证据。

- **FR-2: 写路径写前必须把共享仓储校正到该需求的根，且校正与核验共用读侧同一实现**
  读侧已有唯一实现 `applyRequirementWorkspaceRoot(deps, record)`；写侧缺这一步，
  于是「记录声明 pmboard、单例此刻是 notice-webhook」被判成错配。
  各写盘点（`plan-landing.ts:123`、`CaptureRequirement.ts:300`、`CreateRequirement.ts:63`、`ReportTask.ts:85`、
  `SyncRequirementMarks.ts:44`、`verification-doc-writer.ts:44`、`rtm-yaml.ts:156`）必须在守卫前按该记录校正根；
  校正后仍不一致（= 本次调用自己的根与记录声明的根真的不同）才抛 `REQBOARD_PROJECT_ROOT_MISMATCH`。

- **FR-3: 守卫不得晚于副作用；禁止出现「台账已有记录 + 回执说未立项」的半截失败**
  `CaptureRequirement.ts:300` 的守卫在 ④`create`（`:277`）+ ⑤`draft→brainstorming`（`:291`）之后才执行：
  一旦拒绝，记录与状态已落库，而回执是 Error，RTM 创建同步（`:301`）、bind 同步、`used_project_root`、note 全丢。
  要求二选一并被测试锁死：**守卫前置到 create 之前**；或拒绝时回执如实给出 `requirement_id` 与半截状态说明
  （不得谎报「未立项 / 未写入」）。批准计划路径（`confirm-settle` 的自动落库）同口径。

- **FR-4: 根判定收敛到同一入口，写盘点清单与 t8 门禁同步**
  所有工作区相对写盘点必须走同一判定实现（不得各自探单例）；
  `tests/project-scope.test.ts:313` 的 `PROTECTED_WRITERS` 清单要么守卫函数名不变、要么同步更新，
  「新出现未保护写盘点即红」这条门禁不得被削弱，也不得用豁免清单绕过。

- **FR-5: 并发窗口回归用例**
  构造两个不同 `workspaceRoot` 的会话夹具，交替调用：A 写 → B 调 `reqboard_status`（触发单例校正）→ A 再写。
  断言：A 前后两次写入**都成功**，A 的产物只落在 A 项目目录、B 目录零新增；
  真错配（调用方根为 A、记录声明根为 B）仍抛 `REQBOARD_PROJECT_ROOT_MISMATCH`，文案含两个绝对路径。

## 接口与契约（本次新增/变更）

- **对外协议零变更**：不新增 / 不改 HTTP 路由，不改任何工具入参形状与错误码集合；
  成功回执形状与既有一致（含 `used_project_root` / `usedProjectRoot`）。
- **错误码语义收紧**（唯一语义变更）：`REQBOARD_PROJECT_ROOT_MISMATCH` 只在
  「本次调用自己的根 ≠ 记录声明的根」时报；「共享单例当前值 ≠ 记录声明根」不再单独触发（先校正再核验）。
- **内部契约**：守卫新增「调用方自己的根」这一输入（新增可选形参或新函数均可，命名由设计定）；
  `assertWritableRequirementProject` 与 `ensureWritableProjectRoot` 必须同口径，不得一个校正一个不校正。
- **兼容与迁移**：加性修复，无数据迁移；存量半截态（如 REQ-261005122347-e07a「已批准但没卡」）
  在修复后可手动 `reqboard_decompose` 重试复位。

## 验收口径（可跑）

1. `npx vitest run tests/project-scope.test.ts` → 全绿（既有「错配必拒」「零写入」「写盘覆盖 t8」用例
   不得为了让本改动通过而放宽）；
2. **并发回归（本需求核心判据）**：A 窗口写入 → B 窗口 `reqboard_status` → A 窗口再写入 → 两次均成功；
   断言 A 项目目录内产物存在、B 项目目录**零新增**；
3. **真错配仍拒**：调用方根 = A、记录 `workspaceRoot` = B（人为错配）→ 抛 `REQBOARD_PROJECT_ROOT_MISMATCH`，
   文案含两个绝对路径，且 B 目录零写入；
4. **半截失败消除**：守卫拒绝时台账**没有**该需求的记录（守卫前置）；或回执携带 `requirement_id` +
   半截状态说明（事后守卫）——二选一被用例锁死，不得两边都没有；
5. `pnpm test` 失败数 ≤ 开工前基线；`npx tsc --noEmit` 错误数 ≤ 基线。

## 立据

- 现场台账：`~/.dsh/reqboard/requirements/REQ-261005122915-9f90/history.jsonl`
  （`draft` @1791174555304、`brainstorming` @1791174555326 已落，而该次 capture 的回执是 Error）；
- 会话证据（本机）：窗口 `session-2b5a64a9` @1791174555337 的 tool 回执含两个绝对路径；
  同刻窗口 `session-df00704c` @1791174545158 调 `reqboard_status`；
- 第二现场（批准即落库）：窗口 `session-4d4d23e8` @1791174695611 的批准回执
  「已落章 + 自动拆分/开跑失败（同上错配）」→ 计划已批准、任务卡未落库；
- 第三现场：quantsys-v2 窗口 `session-e4214a80` @1791080475922 的 `reqboard_capture` 被同因误拒；
- 前置发现（他需求已记录、明确不夹带）：`docs/requirements/REQ-261005122915-9f90/requirement.md:143-146`；
- 关键实现锚点：`src/application/internal/support.ts:50,80,116,307,348`；
  `src/application/use-cases/CaptureRequirement.ts:277,291,300`；
  `src/application/use-cases/CreateRequirement.ts:63`；`src/application/internal/plan-landing.ts:123`；
  `src/application/internal/rtm-yaml.ts:156`；`src/application/query/QueryState.ts:34`；
  `src/http/routers/requirements.ts:62,382`；`src/adapters/FileDocRepository.ts:30,43`；
  写盘点门禁 `tests/project-scope.test.ts:313`。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |

> 🔴 **未被接收（5 条）**：FR-1、FR-2、FR-3、FR-4、FR-5

<!-- reqboard:marks:end -->
