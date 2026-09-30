# REQ-260930182521-4fee 接口设计 · 阶段色契约 serves: FR-1, FR-2

> 签名层面只做「新增常量 + 新增可选派生字段」，既有函数签名全部不变；无错误码（纯前端展示层）。

## I-1 · 阶段色常量契约（STAGE_COLORS） serves: FR-1

```ts
// src/client/dag/card-types.ts —— 新增，唯一事实源
export type TaskLaneKey = 'todo' | 'in_progress' | 'integrating' | 'testing' | 'in_review' | 'done'

export interface StageColor {
  /** 卡片底色（浅色调；Canvas fillStyle 与 CSS background 通用，统一用 rgba/hex 字符串） */
  bg: string
  /** 阶段主色（列头色点、计数胶囊文字、状态文本共用） */
  fg: string
}

export const STAGE_COLORS: Record<TaskLaneKey, StageColor> = { /* 六键齐全，值见 data-model.md D-1 */ }
```

约束：六键缺一即编译错误（Record 全键）；任何渲染路径新增第七套硬编码色值将被 FR-3 测试拦截。

## I-2 · 既有取色函数（签名不变，语义改读 STAGE_COLORS） serves: FR-1

```ts
// src/client/dag/card-types.ts
export function getStatusBackgroundColor(status: Status | string): string
// 旧：读独立 STATUS_BACKGROUND_COLORS（错位色板 B）
// 新：return STAGE_COLORS[status as TaskLaneKey]?.bg ?? STAGE_COLORS.todo.bg

export function getStatusTextColor(status: Status | string): string
// 新：return STAGE_COLORS[status as TaskLaneKey]?.fg ?? STAGE_COLORS.todo.fg
```

旧常量 STATUS_BACKGROUND_COLORS / STATUS_TEXT_COLORS 删除（src 与 tests 已无其它消费方，grep 实证）；未知 status 回落 todo 色，与旧行为同构。

## I-3 · 着色阶段派生（stageKey） serves: FR-2

```ts
// src/client/dag/card-types.ts —— CardData 新增可选派生字段（内存计算，不落库）
export interface CardData {
  // ...既有字段不变
  /** 着色用阶段 key（= laneOf 推导结果；缺省时消费方回落 task.status） */
  stageKey?: string
}

// src/client/dag/integration.ts —— resolveTasks 内追加一行：
copy.stageKey = laneOf(copy, copy.kids ?? [])
```

- 参数：无新增入参；laneOf(card, kids) 既有签名 `({status}, KidLike[]) => string`。
- 返回：与泳道列 key 同词汇的六值之一；laneOf 内部已覆盖回落（非 in_progress / 无子卡 → 自身 status）。
- 错误：无抛错路径；未知 stageKind 由 laneOf 既有逻辑回落 in_progress。

## I-4 · 渲染消费点（DOM/Canvas 两端同口径） serves: FR-2

```ts
// card-renderer.ts renderCard：
ctx.fillStyle = getStatusBackgroundColor(task.stageKey ?? task.status)
// card-renderer.ts cardHtml：
attrs = ' data-status="' + esc(task.stageKey ?? task.status) + '"'
// node-panel.ts renderSwimlane 卡片：
data-status = laneOf(t, kidsOf(t.id))   // 与所在列 key 同一值，颜色=列色
```

兼容性：stageKey 缺省（旧数据/未走 resolveTasks 的路径）一律回落原始 status，不产生 undefined 渲染。
