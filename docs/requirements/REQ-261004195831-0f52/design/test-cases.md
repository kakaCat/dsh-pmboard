---
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 测试用例设计（REQ-261004195831-0f52） serves: FR-1, FR-2, FR-3, FR-4, FR-5

> 环境约束：本包 vitest 为 **node 环境、无 jsdom / happy-dom**，不新增依赖。
> 因此本需求的可测面**刻意设计成纯函数 + 可注入依赖**：取数编排走 `createReqDetailStore({fetchRequirement})`，
> 渲染断言直接调 `buildReqDetail` / `renderComments` / `buildDetail*` 这些返回字符串的纯函数。
> 新用例文件：`tests/req-detail-ondemand.test.ts`。

## 断言到用例的映射 serves: FR-1, FR-2, FR-3, FR-4, FR-5

| 需求条款 | 计划 key（拆分阶段落库） | 测试用例 | 覆盖状态 |
|---|---|---|---|
| FR-1 进详情按需取全文 | t1 | TC-2、TC-3 | ✅ 已设计 |
| FR-2 三态呈现 | t2 | TC-5、TC-6 | ✅ 已设计 |
| FR-3 刷新同步 / 去重 / 交互态 | t1 | TC-3、TC-4、TC-7 | ✅ 已设计 |
| FR-4 缺字段防御 | t3 | TC-1、TC-8 | ✅ 已设计 |
| FR-5 回归与构建纪律 | t4 | TC-1…TC-8 + 命令节 | ✅ 已设计 |

## 功能测试用例 serves: FR-1, FR-2, FR-3, FR-4, FR-5

### TC-1: 摘要形状不崩（本 bug 的回归锚点） serves: FR-4 covers: t3 validates: FR-4

**测试目标**：把 `/state` 的摘要记录喂给详情渲染时**不得抛异常**——这是 2026-10-04 实测崩溃路径的固化。
**前置条件**：无（纯函数）。
**测试步骤**：
1. 构造摘要形状对象：`{id:'REQ-x', title:'t', status:'implementing', blocked:false, createdAt:1, updatedAt:2, version:3, commentCount:0, artifactCount:0, category:'feature'}`（**无 `comments`**）。
2. `buildReqDetail(summary as unknown as RequirementRecord, [], Date.now())`。

**预期结果**：
- 不抛异常（当前实现抛 `TypeError: Cannot read properties of undefined (reading 'length')`——用例必须红转绿）。
- 返回字符串含「暂无评论」。

**覆盖场景**：正常流程（摘要形状）＋异常处理（缺数组）。

### TC-2: 进入详情恰发 1 次详情请求，且渲染输入是全文 serves: FR-1 covers: t1 validates: FR-1

**测试目标**：详情取数走 `GET /requirements/:id`，且交给渲染的是全文。
**前置条件**：`createReqDetailStore({fetchRequirement: 记录调用的桩})`。
**测试步骤**：
1. `store.ensure('REQ-x', 3, 10)`。
2. 等待桩 promise 结算（`await vi.waitFor(() => store.get('REQ-x')?.status === 'ready')`）。
3. 读 `store.get('REQ-x')`。

**预期结果**：桩被调用 **1 次**且入参为 `'REQ-x'`；条目 `status === 'ready'`，`record.comments` 为数组，`revision` 与桩返回一致。
**覆盖场景**：正常流程。

### TC-3: 同 tick 重复触发只发 1 次请求（在途去重） serves: FR-1, FR-3 covers: t1 validates: FR-3

**测试目标**：SSE 与轮询同一 tick 各触发一次 `ensure` 不叠加请求。
**前置条件**：桩返回一个**手动控制结算**的 promise。
**测试步骤**：
1. `store.ensure('REQ-x')`；`store.ensure('REQ-x')`；`store.ensure('REQ-x')`（均在结算前）。
2. 结算桩 promise。

**预期结果**：桩调用次数 === 1；条目最终 `ready`；`onChange` 通知次数 ≤ 2（状态变化次数，不是请求数）。
**覆盖场景**：边界值（并发）。

### TC-4: 版本未变不重取、版本变化重取 serves: FR-3 covers: t1 validates: FR-3

**测试目标**：失效判据（`summaryVersion` / `ledgerRevision`）生效，既不请求风暴也不陈旧。
**前置条件**：桩每次返回递增 `revision`。
**测试步骤**：
1. `ensure('REQ-x', 3, 10)` → 结算。
2. 再 `ensure('REQ-x', 3, 10)`（都不变）。
3. 再 `ensure('REQ-x', 4, 10)`（version 变）。
4. 再 `ensure('REQ-x', 4, 11)`（revision 变）。

**预期结果**：桩调用次数依次为 1 → 1（复用）→ 2 → 3；每次变化后条目 `revision` 为最新值。
**覆盖场景**：正常流程 + 边界值。

### TC-5: 404 → missing 态且仍停留详情 serves: FR-2 covers: t2 validates: FR-2

**测试目标**：`REQBOARD_NOT_FOUND` 不静默弹回看板。
**前置条件**：桩 reject 一个带 `code='REQBOARD_NOT_FOUND'` 的 `ApiError`。
**测试步骤**：
1. `ensure('REQ-gone')` → 等待结算。
2. 读条目并渲染：`buildDetailMissing('REQ-gone', entry.message)`。

**预期结果**：条目 `status === 'missing'`；渲染字符串含「未找到」与 `REQ-gone`，含 `data-detail-state="missing"`，且 `buildReqDetail` **未被**当作成功路径调用。
**覆盖场景**：异常处理。

### TC-6: 5xx → error 态（原因 + hint 原样） serves: FR-2 covers: t2 validates: FR-2

**测试目标**：失败可诊断。
**前置条件**：桩 reject `ApiError('HTTP 500', undefined, 'npx … 修复命令')`。
**测试步骤**：`ensure('REQ-x')` → 等待结算 → `buildDetailError('REQ-x', message, hint)`。

**预期结果**：条目 `status === 'error'`；渲染含服务端 `error` 原文与 hint 文本，含 `data-action="retry-detail"`；`hint` 为 `undefined` 时渲染结果**不含** hint 块（无空标签）。
**覆盖场景**：异常处理 + 边界值。

### TC-7: 重试强制取数 serves: FR-2, FR-3 covers: t2 validates: FR-2

**测试目标**：失败态可恢复。
**前置条件**：桩先失败一次、后成功。
**测试步骤**：`ensure` → 失败 → `retry('REQ-x')` → 等待结算。

**预期结果**：桩调用 2 次；条目由 `error` 变 `ready`；`retry` 期间连点 3 次仍只加 1 次请求。
**覆盖场景**：正常流程。

### TC-8: renderComments 对 undefined / 非数组降级 serves: FR-4 covers: t3 validates: FR-4

**测试目标**：评论渲染单点防御（详情与任务卡两处共用）。
**前置条件**：无。
**测试步骤**：分别调 `renderComments(undefined as unknown as CommentRecord[])`、`renderComments(null as unknown as CommentRecord[])`、`renderComments([])`。

**预期结果**：三者返回**逐字节相同**的空态字符串（含「暂无评论」）。
**覆盖场景**：异常处理 + 边界值。

## 手工验收（GUI） serves: FR-1, FR-2, FR-3

| 步骤 | 操作 | 期望 |
|---|---|---|
| M-1 | 看板 → 点任一需求卡 | 详情正常渲染；控制台无 `TypeError`；评论条数与台账一致 |
| M-2 | DevTools Network 过滤 `requirements/` | 打开详情**恰 1 条** `requirements/<id>`（200）；首屏加载**没有**该请求 |
| M-3 | 详情停在「时间线」Tab → 另一窗口给该需求加评论 | 评论自动出现；Tab 未跳回「概览」；评论输入框草稿仍在 |
| M-4 | DevTools 把 `requirements/<id>` 设为 offline / 500 后刷新详情 | 显示失败原因 + 重试；点重试（恢复网络后）→ 进入正常详情 |
| M-5 | 手改 URL 为已删除需求的 `?req=` | 显示「未找到」+ 返回看板按钮；**不**静默跳回看板 |

## 回归基线与命令 serves: FR-5

```bash
# ① 本次新增用例（必须全绿）
npx vitest run tests/req-detail-ondemand.test.ts

# ② 既有契约不许倒退：首屏 0 次详情请求
npx vitest run tests/state-payload-client.test.ts

# ③ 本仓 C 系列：类型检查（C-15，退出码 0）+ 重建 bundle（C-12）
pnpm typecheck
pnpm build:client        # 期望输出 [verify-client] OK

# ④ 全量测试与基线比对（C-14：基线 106 failed / 2807 passed，本次不得高于）
npx vitest run
```

**E2E 判定**：本次**不做**浏览器 E2E 自动化（本包无 jsdom/playwright 依赖，且 M-1…M-5 的手工路径
已覆盖端到端可观察行为）；失败判据 = 手工 M-1…M-5 任一条不达预期，或命令 ①③ 非零退出。
