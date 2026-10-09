---
doc: design/data-model
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-3, FR-5, FR-6
---

# 数据模型（REQ-261007223647-da5d · 轻档）

## DM-1 宿主弹框内容契约（只读事实，D-9） · serves: FR-3

| 字段 | 类型 | 约束 |
|---|---|---|
| question.question | string | GFM Markdown 渲染；长文内部滚动，仍建议 ≤60 字/句 |
| question.options[].label | string | **答案值原样回传**；首项带 `（推荐）` 后缀 → 宿主预选并自绘推荐标记（后缀不显示） |
| question.options[].description | string | 纯展示，不参与推荐判定 |
| answer.selected | string[] | 含**原始 label（带后缀）**——消费方必须剥后缀 |

## DM-2 PendingConfirmation（既有，不改动结构） · serves: FR-1, FR-5

ticket(pc- 前缀) / windowKey / requirementId / target(artifact|plan) / kind? / createdAt / interruptedAt?；
TTL = LIMITS.pendingConfirmTtlMs（30min），中断后以 interruptedAt 为过期基准再获完整 TTL（既有）。
**本期新增仅派生投影**：remaining_ms（client 推导，不落库）；结构零变更（B2 边界）。

## DM-3 capture-interactions.json（新增 state 文件） · serves: FR-2

```json
[{ "windowKey": "session-…", "kind": "reject | cancel | timeout", "at": 1791383807882 }]
```

- ring buffer 200 条；原子写；读失败/损坏按无记录降级（留痕是增强不是门槛，沿用拒绝粘滞纪律）；
- 兼容：启动读时合并 `capture-rejections.json`（旧条目 kind=reject）；旧文件只读不写，自然淘汰。

## DM-4 CaptureMapping 变更 · serves: FR-3

```ts
CAPTURE_QUESTION_IDS = { name, category, difficulty, location }        // 5→4：workspace 删除并入 location
CAPTURE_ANSWER_KEYS  = ['title', 'category', 'difficulty', 'location'] // 三处同源（常量→类型→schema 生成）
CaptureMapping += { acceptAllRecommended: boolean; docBasePath: string; workspaceRoot: string }
```

location 作答 → (workspaceRoot, docBasePath) 的拆分规则见 interfaces.md IF-2。

## DM-5 看板 pending 票载荷 · serves: FR-5

`pending_confirms[]` 元素 = { ticket, requirement_id, target, kind?, created_at, interrupted: boolean }；
空 = `[]`（不省略键）；client 倒计时字段为展示派生，不进协议。

## DM-6 open-doc 根诊断（运行态，不落盘） · serves: FR-6

rootSource ∈ req-root | session-root | server-root | none；每次 absolutizeDocPath 调用刷新，
只读读出（peekLastRootSource）；无持久化、无台账影响。

## 兼容矩阵 · serves: FR-2, FR-3, FR-5

| 旧形态 | 新行为 |
|---|---|
| capture-rejections.json | 只读合并进 DM-3，kind=reject；不删 |
| 无（推荐）后缀的答案 | 剥后缀幂等 → 映射行为逐字不变 |
| 老服务端（无 pending_confirms 键） | client 按 `[]` 渲染（不报错、不画空块） |
| 老 client 连新服务端 | 多出的 pending_confirms 键被忽略（宽松解析现状） |
