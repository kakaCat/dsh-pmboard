---
serves: FR-1, FR-2, FR-3
---

# REQ-261004151652-d535 设计 · 接口与渲染契约

## 后端接口：本次无变更（serves: FR-1）

`GET /dashboard/api/reqboard/session/:sessionId/progress` 的请求/响应**逐字不变**，特别是：

| 字段 | 本次 | 说明 |
|---|---|---|
| `data.nodes[].key` | 不变 | 七节点键（draft…archived） |
| `data.nodes[].tokens.total` | 不变 | 该节点消耗（节点快照优先、任务执行差值兜底）；无数据时**该键缺席** |
| `data.requirement.tokenTotal` | 不变 | 需求累计（上一需求 REQ-261004143941-b2ca 交付；>0 才发） |

**为什么显式写「不变」**：本需求的病因是**前端把已有的数藏了**，不是数据没给。把「后端不动」写成契约，任何后续改动都能立刻判出「是谁动了手脚」。

错误语义同样不变：无锚定需求 → `{ hasRequirement: false }`（HTTP 200）；读台账失败 → 既有 500 路径。

## 客户端渲染契约（DOM / 类名）（serves: FR-1, FR-2, FR-3）

DOM 结构**保持逐字不变**（只改 CSS 排版与显隐），便于探针与单测继续按类名定位：

```html
<div class="dsh-pm-cprog-inline">
  <div class="dsh-pm-flow">
    <div class="dsh-pm-flow-node" data-state="done|current|pending|skipped">
      <span class="dsh-pm-flow-dot">✓|●|1|—</span>
      <div class="dsh-pm-flow-meta">            <!-- ← 新增：纵向排版（名字在上、数字在下） -->
        <span class="dsh-pm-flow-label">需求分析</span>
        <span class="dsh-pm-flow-token">827.8k</span>
      </div>
    </div>
    <div class="dsh-pm-flow-link" data-state="done|pending"></div>
    …
  </div>
  <span class="dsh-pm-cprog-inline-count">3/12</span>
  <span class="dsh-pm-token-badge dsh-pm-cprog-token-total">   <!-- ← 默认隐藏；仅 ≤600px 档显示 -->
    <span class="dsh-pm-cprog-token-ico">🪙</span>25.3M
  </span>
</div>
```

| 契约 | 规定 |
|---|---|
| 排版 | `.dsh-pm-flow-meta` 纵向、居中：`display: flex; flex-direction: column; align-items: center; gap: 0` |
| 节点宽 | 由内容决定（`max(dot, 名字, 数字)`）；**不得**再被最小宽压到数字溢出（`.dsh-pm-flow-node { flex: none }`） |
| 节点 token 显隐 | 与 `label` 同阈值（容器 ≤600px 时一起隐藏）——见 architecture D-2 表 |
| 累计徽章显隐 | 默认 `display: none`；容器 ≤600px 时 `display: inline-flex`（沿用它自己的旧档位最小化规则：图标 `.dsh-pm-cprog-token-ico` 仍在该档隐藏） |
| 不可点 | 节点 token 与徽章都不挂 `data-action`；节点点击、展开面板、文档链接行为不变 |
| 文案 | 节点 token 与徽章数字都走 `fmtTokens`（紧凑格式），本次不改文案 |

## CSS 契约（三段 `@container` 的语义）（serves: FR-2, FR-3）

```css
/* 宽档（容器 > 780px）：全部明细 + 连线；无累计徽章（默认隐藏） */
@container (max-width: 780px) {      /* FLOW_TIERS.link */
  .dsh-pm-flow-link { display: none; }
  .dsh-pm-flow-node:not([data-state="current"]) .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 20px; }
}
/* 窄档（容器 ≤ 600px）：“名字都没了” → 交出计数 + 累计总数 */
@container (max-width: 600px) {      /* FLOW_TIERS.label === FLOW_TIERS.token */
  .dsh-pm-flow-node .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 18px; }
  .dsh-pm-cprog-token-ico { display: none; }
  .dsh-pm-cprog-token-total { display: inline-flex; }   /* ← 新增：让位规则 */
}
```

**`FLOW_TIERS.token = 600` 的落地形态**：token 档与 label 档同值 ⇒ 两段规则在同一断点生效；**实现上合并成一段**（避免同一断点写两个 `@container` 块），`FLOW_TIERS` 仍保留三个键以不破坏既有取值面（`token` 与 `label` 同值并在注释里写明等式语义）。单测继续断言「三段阈值与常量逐一相等」的机制，新增断言 `FLOW_TIERS.token === FLOW_TIERS.label`。

## 错误与降级（serves: FR-1, FR-3）

| 情形 | 表现 |
|---|---|
| 浏览器不支持容器查询 / 组件无容器祖先 | 三段规则全不命中 → 全部明细可见、徽章默认隐藏（与宽档一致）；探针 `--fallback` 模式覆盖 |
| 节点无快照（`tokens` 键缺席） | 该节点只有名字、没有数字——这是「确实没有数据」，**不补 0** |
| 需求无累计（`tokenTotal` 缺席） | 徽章不渲染（`model.tokenTotal === undefined`，上一需求已锁） |
