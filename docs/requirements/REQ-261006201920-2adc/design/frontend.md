---
requirement_refs: [FR-3, FR-4]
---

# 前端设计（REQ-261006201920-2adc）

> 本文档面向：前端开发、UI、测试。本需求有界面表现的是 FR-3 与 FR-4；FR-1 / FR-2 无界面。

## 原型页面 <!-- serves: FR-3, FR-4 -->

**唯一权威原型**：`prototypes/verify-disposition.html`（记于 `prototypes/INDEX.md` 的四列表格；`authoritative` 恰好一条；
另有且仅有一份历史骨架被标 `superseded`——**本文档不得引用它**，指向被取代版本会被拒）。

> 写作纪律：本节**不写出被取代那份的路径字面量**。原型门按「文里出现的原型路径」判定，它不认否定语——
> 连「不得引用 X」里的 X 也会被算成一次引用并拒（`prototype_version_conflict`）。

**锚点对齐**（锚点是页面内区块定位符，**不计入 serves**，走独立字段 `protoRefs`）：

| 页面 / 组件 | 锚点 | 关联 D-x |
|---|---|---|
| 裁决行（`vX-N` 一行）的整体状态渲染：`未复核` 与 `已通过` 的双重区分（徽标文字 + 左侧色条） | `prototypes/verify-disposition.html#FR-3` | D-3 |
| 覆盖场景：变更理由输入的展开、agent 原文以「原实测结果（已被覆盖）」保留展示 | `prototypes/verify-disposition.html#FR-3` | D-3 |
| 系统缺口项：处置模板两义的在行提示、处置为空时「归档被这一项拦住」的可见状态 | `prototypes/verify-disposition.html#FR-4` | — |

**可失败的判据**（只写「与原型一致」不算判据）：

1. **结构断言**：裁决行容器保持 `.dsh-pm-vitem[data-item-id]`；新增变更理由输入携带 class `.dsh-pm-vitem-change-reason`；
   原文保留展示携带 `data-superseded="1"`。
2. **文本断言**：`未复核` 状态行的徽标文本等于既有 `ITEM_STATUS_TEXT.unverified`（不自造第二份文案）；
   被覆盖行必须同时出现「原实测结果」字样。
3. **令牌断言**：新控件不引入新色值——复用既有危险色 / 提示色令牌；`未复核` 与 `已通过` 的区分不得只靠颜色
   （徽标文字必须不同，色觉障碍下仍可辨）。

## 组件拆解与职责 <!-- serves: FR-3, FR-4 -->

| 组件 / 文件 | 职责 | 依赖 |
|---|---|---|
| `src/client/views/panels/verify.ts` | 渲染验收单（含 RTM 表与逐项裁决控件） | 协议类型、既有样式 |
| `src/client/stage-panel.ts` | 阶段面板里的验收单渲染（第二处收集链，口径必须同源） | 同上 |
| `src/client/board-mount.ts` | 从 DOM 收集裁决并提交（`case 'submit-verdicts'`） | fetch、既有 action 委派 |
| `src/client/styles/board.ts` | 新控件样式 | 既有样式分片纪律 |

**纪律**：两处渲染（`verify.ts` / `stage-panel.ts`）必须**同口径**——既有实现已在此处踩过「两处各写一份」的坑，
本次新增控件在两边共用同一段渲染函数，禁止复制粘贴。

## 数据流 <!-- serves: FR-3 -->

```
服务端 VerificationItem
   ├─ result / resultSource / needsHuman / humanReason   （既有）
   └─ resultSuperseded / resultChangeReason              （新增，只读展示）
        │
        ▼
verdictControls(item) ──▶ HTML（意见输入预填规则不变；覆盖时多一个理由输入）
        │
        ▼
board-mount 收集 { itemId, status, opinion, changeReason? }
        │
        ▼
POST /req/verdicts ──▶ 服务端为权威判据（前端只做就地面包屑，判过与否以服务端为准）
```

**预填规则逐字不变**（既有契约）：`needsHuman` 项**不预填**；其余有 `result` 的项预填 `result` **原文**。
「是否构成覆盖」的前端判据 = 输入框当前值 ≠ 渲染时的 `defaultValue`（即人真的动过）。

## 交互设计 <!-- serves: FR-3, FR-4 -->

| 交互 | 触发条件 | 行为 | 失败时的提示 |
|---|---|---|---|
| 变更理由输入展开 | 该项 `resultSource === 'agent'` **且**人改动了预填值 | 该行展开必填的理由输入；未提交前给就近提示（`aria-describedby` + `role=alert`） | 提交前拦下并点名该项：不覆盖 / 或补理由 |
| 人工项事实校验 | `data-needs-human="1"` 且点通过 | 文本 ≤6 字或无可辨识事实 → 就地拒收 | 提示「写现象 + 证据路径（截图 / 输出）」 |
| 处置模板校验 | 系统缺口项点通过 | 处置未命中两义模板 → 就地拒收 | 并排给出两种合法写法各一例 |
| 归档门可见性 | 存在未处置系统项或未复核项 | 页面显示「归档被 N 项拦住」并可展开点名 | 指向补齐入口 |

**纪律**：前端校验是**面包屑**，不是权威——服务端判据必须独立成立（两通道一致）。
前端的拦截只为「少一次往返」，不得成为唯一防线。

## 既有 DOM 契约不破坏 <!-- serves: FR-3, FR-4 -->

- `.dsh-pm-vsheet` 仍是 `submit-verdicts` 收集链的作用域；整表一份提交按钮不变。
- `.dsh-pm-vitem` / `data-item-id` / `.dsh-pm-verdict-btn` 单选框 / `.dsh-pm-vitem-opinion` **四个选择器语义不变**——
  既有客户端用例按它们断言，改动必须保持这些钩子可用。
- 新增控件一律**加性**：旧版服务端不认识新字段时不报错；旧版客户端不传新字段时服务端按「不覆盖」处理。

## 样式与令牌 <!-- serves: FR-3, FR-4 -->

- 复用既有样式分片与令牌，不新增色板；新控件只加必要的布局规则（行内换行、间距）。
- 状态区分**不得只靠颜色**：`未复核` 用徽标文字 + 左侧色条双通道。
- `styles/board.ts` 等分片必须**以模板字符串收尾**（既有构建门约束，分片截断会导致 `[verify-client]` 失败）。

## 构建与验收口径 <!-- serves: FR-3, FR-4 -->

- 改了客户端源码 → 必须跑 `pnpm build:client` 并看到 `[verify-client] OK`（关键符号齐全 / 样式归属章在场 / CSS 分片完整）。
- 界面视觉判定（两种状态是否可辨、理由输入展开是否自然、归档提示是否读得懂）属**只能人看**的项：
  在验收单里标 `needsHuman` 并由人填结论；agent 只提供结构断言与截图路径，不代判。
