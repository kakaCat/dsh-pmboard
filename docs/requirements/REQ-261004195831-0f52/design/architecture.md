---
serves: FR-1, FR-2, FR-3, FR-4
---

# 架构设计（REQ-261004195831-0f52） serves: FR-1, FR-2, FR-3, FR-4

> 一句话目标：把「需求详情」的数据源从 `state.requirements`（`/state` 的**摘要**）切到
> `api.fetchRequirement(id)`（`GET /requirements/:id` 的**全文**），并为取数过程补上
> 加载 / 未找到 / 失败三态与缺字段防御——详情页恢复可用，且首屏仍是 0 次详情请求。
>
> 可证伪的达成判据：用摘要形状调 `buildReqDetail` 不再抛 `TypeError`；进入一次详情
> 恰好发出 1 次 `GET /requirements/<id>`；404 时仍停留在详情态并显示「未找到」。

## 目标与总体方案 serves: FR-1, FR-2

**问题**：`/state` 自 B12 阶段⑥-①（REQ-261002161439-277d）起只下发 `RequirementSummary`
（`id / title / status / blocked / commentCount / artifactCount / category / sourceSessionId /
workspaceRoot / version / createdAt / updatedAt`），而 `render()` 的 `case 'req'` 仍从
`state.requirements` 里取记录直接交给 `buildReqDetail` → `renderComments(req.comments)`
对 `undefined` 取 `.length`，详情页整块不渲染（FR-4 的直接回归面）。

**当前状况**：

```
 render() case 'req'（src/client/board-mount.ts:260）
    const req = state.requirements.find(r => r.id === cur.reqId)   ← 摘要（本体字段全缺）
    viewEl.innerHTML = buildReqDetail(req, state.tasks, ...)       ← 读 req.comments ✗ 抛错
    if (!req) mode = { kind: 'board' }                             ← 静默弹回看板
```

**设计方案**：把「详情取数」从视图中抽成一个**纯逻辑模块**（无 DOM、可单测），视图只消费它的状态。

```
                    点击卡片 / 深链 / 定位（open-req）
                                 │
                                 ▼
                 mode = { kind: 'req', reqId }  ──▶  render()
                                 │
                                 ▼
              reqDetailStore.ensure(reqId)        ← 新增模块（纯逻辑）
                                 │
             ┌───────────────────┼────────────────────┐
             │                   │                    │
      已有同 id ready        在途去重（同 id）      需要取数
      且 version 未变             │                    │
             │                   └────────┬───────────┘
             │                            ▼
             │              api.fetchRequirement(id)  GET /requirements/:id
             │                            │
             │        ┌───────────────────┼────────────────────┐
             │        ▼                   ▼                    ▼
             │     loading              ready                missing / error
             │   （骨架占位）      （全文 RequirementRecord）  （未找到 / 失败+重试）
             └────────┴───────────────────┴────────────────────┘
                                 │
                                 ▼
                 buildReqDetail(record, tasks, now, archived)   ← 签名不变
```

**不这么做的后果**：
- 若只在 `renderComments` 里加 `?? []` 兜底：详情页**不崩了但还是空的**——评论永远 0 条、产物/验收/归档区段永远空态，等于把「崩」换成「静默失数据」，比崩更坏（人以为需求真没材料）。
- 若每次 `render()` 都无脑重取全文：SSE + 轮询 + 手动刷新会把详情变成请求风暴（B12 刚治理掉的读放大原地复活）。
- 若把全文塞回 `state.requirements` 或落盘缓存：等于推翻 B12 ⑥-① 的载荷契约，超出本需求边界（requirement.md 边界 1/2）。

## 模块改动地图 serves: FR-1, FR-2, FR-3, FR-4

```
 src/client/
   board-mount.ts        ── 改：case 'req' / case 'task' 的数据来源与三态渲染
        │                    （删掉「找不到就静默回看板」）
        │
   req-detail-store.ts   ── 新增：ensure / get / invalidate（纯逻辑，无 DOM）
        │        │
        │        └──▶ api.fetchRequirement(id)      （src/client/api.ts，已存在）
        │
   views/detail-states.ts ── 新增：loading / missing / error 三种占位 HTML
        │
   views/stage-detail.ts ── 改：req.comments / 本体字段防御（?? []）
   render/dom-utils.ts   ── 改：renderComments 接受 undefined
        │
   board-scroll.ts       ── 复用既有「重绘前取值 / 重绘后回填」范式（评论草稿）
        │
   dag/view-state.ts     ── 复用（不改）：详情内 DAG 视图状态记忆
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/client/req-detail-store.ts` | 新增 | 详情全文内存态：`ensure(reqId)`（在途去重 + version 失效）、`get(reqId)`、`invalidateAll()` | FR-1 / FR-3 | 仅详情视图消费；不写存储、不入台账 |
| `src/client/views/detail-states.ts` | 新增 | `buildDetailLoading` / `buildDetailMissing` / `buildDetailError` 三个纯函数 | FR-2 | 详情页占位呈现 |
| `src/client/board-mount.ts` | 改 | `case 'req'`：改用 store 状态渲染；`case 'task'`：`req` 仅用于摘要级展示（不改数据源） | FR-1 / FR-2 / FR-3 | 看板详情入口 |
| `src/client/views/stage-detail.ts` | 改 | `buildReqDetail` 对 `comments/artifacts/plan/verification/archive/statusHistory/docLinks` 全部按缺失兜底；`req.comments.length` → 兜底计数 | FR-4 | 详情页全部区段 |
| `src/client/render/dom-utils.ts` | 改 | `renderComments(comments: CommentRecord[] \| undefined)` → 空态字符串 | FR-4 | 详情评论、任务卡评论 |
| `src/client/views/stage-panel.ts` | 改 | 任务卡详情的评论渲染同步走兜底（`task.comments` 同风险） | FR-4 | 任务详情页 |
| `tests/req-detail-ondemand.test.ts` | 新增 | store 单测 + 摘要形状渲染单测 + 三态单测 | FR-5 | 测试 |

## 数据结构变更 serves: FR-1, FR-3

**服务端**：无变更（`GET /requirements/:id` 与 `RequirementRecord` 均为既有事实源）。
**台账**：无变更（不新增/不修改任何落盘字段，本需求全部状态只在页面内存里）。

**客户端新增内存态**（详见 data-model.md）：`ReqDetailEntry` 四态判别联合
（`loading / ready / missing / error`）+ 一个按 `reqId` 索引的 `Map`（容量上限 16，超出淘汰最旧，
与 `dag/view-state.ts` 的同款纪律）。

## 质量与回归锚点 serves: FR-5

本需求的「修好了」由**三条锚点**证明（逐条用例设计见 `design/test-cases.md`；该文档属测试类文档，
不参与设计覆盖度 RTM，故锚点在此显式声明）：

| 锚点 | 载体 | 判据 |
|---|---|---|
| ① 本 bug 复现路径固化 | `tests/req-detail-ondemand.test.ts`（新增） | 用 `RequirementSummary` 形状调 `buildReqDetail` **不抛异常**（当前必红） |
| ② 首屏不倒退 | `tests/state-payload-client.test.ts`（既有，不放宽） | 首屏只打 `/state`，详情端点 **0 次** |
| ③ 详情取数正确 | `tests/req-detail-ondemand.test.ts`（新增） | 进详情恰 1 次 `GET /requirements/<id>`；在途去重；404/500 落三态 |

**构建与检查纪律**（本仓 C 系列，逐条可跑）：

```
pnpm typecheck      # C-15：改动文件零错误（本仓基线 223 个历史错误另计，不得增加）
pnpm build:client   # C-12：期望输出 [verify-client] OK（改了 client 源码必须重建 bundle）
npx vitest run      # C-14：失败数 ≤ 基线 106 failed / 2807 passed，新增用例全绿
```

**可测性设计**：取数编排做成可注入依赖的纯逻辑（`createReqDetailStore({ fetchRequirement })`），
渲染做成返回字符串的纯函数——本包 vitest 无 jsdom，不引入新依赖即可覆盖上述三条锚点。

## 兼容与回滚 serves: FR-2, FR-3

- **兼容**：不改 `/state`、不改分页、不改 SSE、不改点评工具与台账格式；旧 bundle（未含本修复）
  行为与今天一致（仍崩），无数据迁移。
- **首屏不倒退**：`fetchAll()` 仍只打 `/state`；详情请求只在 `mode.kind === 'req'` 且该需求
  未就绪时发出（现有 `tests/state-payload-client.test.ts` 继续守着）。
- **回滚路径**：还原 `board-mount.ts` 的 `case 'req'` + 删除新增两个文件 + 重建 bundle
  （`pnpm build:client`）即回到现状；本需求不产生需要清理的持久化痕迹。
- **降级**：旧服务端没有 `/requirements/:id`（404/405）→ 走 FR-2 的失败态，**不假装有数据**。
