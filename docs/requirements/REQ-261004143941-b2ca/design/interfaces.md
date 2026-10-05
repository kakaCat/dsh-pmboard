---
serves: FR-1, FR-2
---

# REQ-261004143941-b2ca 设计 · 接口（进度接口新增 tokenTotal + 渲染契约）

## GET /dashboard/api/reqboard/session/:sessionId/progress（变更）（serves: FR-1）

**调用方**：客户端会话头部流程图组件 `RequirementProgressAction`（15s 轮询 + 挂载即拉）。

**请求**：路径参数 `sessionId`（会话窗口码，`session-<uuid>`）；无 body、无 query、无鉴权头。

**返回（信封不变）**：`{ success: true, data: ProgressPayload }`。

```ts
interface ProgressPayload {
  hasRequirement?: boolean
  closed?: boolean
  sessionId?: string
  requirement?: {
    id?: string; title?: string; description?: string; status?: string
    category?: string | null; blocked?: boolean; paused?: boolean
    promptDifficulty?: string | null
    sourceSessionId?: string | null; updatedAt?: number
    tokenTotal?: number          // ← 本次新增，可选
  }
  progress?: { total?: number; done?: number; active?: number; percentage?: number; byStatus?: Record<string, number> }
  nodes?: Array<{ key?: string; tokens?: { total?: number } }>
  timeline?: Array<{ status?: string; at?: number; by?: { kind?: string; sessionId?: string }; reason?: string | null; inferred?: boolean }>
}
```

**新增字段 `requirement.tokenTotal`**：

| 项 | 值 |
|---|---|
| 类型 | `number`（整数，四桶之和，≥ 0） |
| 必填性 | **可选**——`0`（无任何快照）时**不发该键**，不是发 0 |
| 取值 | `totalTokens(assembleRequirementToken(target, { tasks }).totals)`（与 `nodes` 同源） |
| 输出条件 | 仅当计算结果 `> 0` |
| 单位 | token（不是字符估算值；不含提示词成本折算） |

**错误语义（本次不改）**：需求不存在 / 会话无锚定需求 → `{ success: true, data: { hasRequirement: false, sessionId } }`（HTTP 200，不是 404——「没有」不是错误）；读台账失败 → 既有 500 路径不变。新增字段**不引入任何新错误分支**：算不出就缺席。

**兼容**：老客户端读不到该键 → 不渲染徽章（与今天逐字一致）；新客户端对老宿主（无该字段）同样不渲染。双向兼容、无版本协商。

## 客户端渲染契约（DOM 与类名）（serves: FR-2）

新增元素挂在 `.dsh-pm-cprog-inline` 内、计数 `.dsh-pm-cprog-inline-count` **之后**（`.dsh-pm-flow` **之外**——这是它不被任何 `@container` 档位规则命中的结构性原因）：

```html
<div class="dsh-pm-cprog-inline">
  <div class="dsh-pm-flow">…七节点…</div>
  <span class="dsh-pm-cprog-inline-count">3/12</span>
  <span class="dsh-pm-token-badge dsh-pm-cprog-token-total"
        title="需求累计 Token（各节点快照差值合计，含任务执行兜底）">
    <span class="dsh-pm-cprog-token-ico">🪙</span>24.8M
  </span>
</div>
```

| 契约 | 规定 |
|---|---|
| 存在条件 | `model.tokenTotal !== undefined` → 渲染；缺席 → **不渲染该元素**（连空壳都不留） |
| 文案 | `fmtTokens(tokenTotal)`（复用既有单点：<1000 原数 / `N.Nk` / `N.NM`） |
| 宽度档位 | A/B/C（容器 ≥600px）：`🪙` + 数字；**D（<600px）：隐藏 `.dsh-pm-cprog-token-ico`**，只留数字（省约 18px，仍可见、仍计入 FR-2 判据） |
| 不可点 | 徽章不挂 `data-action`、不参与节点点击展开（点击冒泡到芯片的既有行为保持不变） |
| title | 只写口径，不写实现细节（措辞见上） |

## 模型层契约（serves: FR-2）

```ts
interface FlowChartInput { /* …既有… */ tokenTotal?: number }
interface FlowChartModel { /* …既有… */ tokenTotal?: number }

// 落模型规则：typeof tokenTotal === 'number' && Number.isFinite(tokenTotal) && tokenTotal > 0
//   → model.tokenTotal = tokenTotal；否则不落该键（0 / NaN / Infinity 一律视为「无」）
```

**为什么放在模型层而不是组件里 if**：探针 `scripts/header-progress-probe.mts` 与组件共用同一模型（REQ-260930230225-71be 的单一源纪律），放模型层才能让探针在离屏条件下复现同一渲染决策。
