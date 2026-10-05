# REQ-260930194112-1ab8 接口设计 · DOM 与 CSS 契约 serves: FR-1, FR-3, FR-4, FR-5, FR-6

> 纯展示层：既有函数签名全部不变，新增的是**返回字符串里的 DOM 契约**与**CSS 选择器契约**；无错误码。

## I-1 · buildListView 签名与输出契约 serves: FR-5

```ts
// src/client/views/board.ts —— 签名不变
export function buildListView(
  state: BoardState, now?: number, opts?: ListViewOpts, archived?: ReadonlySet<string>,
): string
```

| | 输出结构 |
|---|---|
| 现状 | `<div class="dsh-pm-list">{toolbar}<table class="dsh-pm-table">…</table>{pager}</div>` |
| 修复后 | `<div class="dsh-pm-list">{toolbar}<div class="dsh-pm-table-wrap"><table class="dsh-pm-table">…</table></div>{pager}</div>` |

空结果分支（`暂无进行中的需求`）**不含表格**，也不加 wrap —— 保持现状字符串。

## I-2 · 列类名契约 serves: FR-4

`<th>` 与 `<td>` **成对**加同一个类名；分组头行 `<tr class="dsh-pm-list-grouphead">` 是单个 `colspan="8"` 单元格，**不加**列类名。

| 列序 | 列 | 类名 | ≥1180px | 880~1179px | <880px |
|------|----|------|---------|------------|--------|
| 1 | ID | —（始终可见） | ✓ | ✓ | ✓ |
| 2 | 标题 | —（始终可见，`dsh-pm-td-title`） | ✓ | ✓ | ✓ |
| 3 | 分类 | `dsh-pm-col-cat` | ✓ | 隐藏 | 隐藏 |
| 4 | 状态 | —（始终可见） | ✓ | ✓ | ✓ |
| 5 | 进度 | `dsh-pm-col-progress` | ✓ | ✓ | 隐藏 |
| 6 | 负责人 | `dsh-pm-col-owner` | ✓ | 隐藏 | 隐藏 |
| 7 | 更新时间 | `dsh-pm-col-when` | ✓ | 隐藏 | 隐藏 |
| 8 | 操作 | —（始终可见） | ✓ | ✓ | ✓ |

## I-3 · CSS 规则契约 serves: FR-1, FR-2, FR-3, FR-5

落点：`src/client/styles/board.ts`（列表视图区段，`REQ-6f39b5：列表视图表格化` 段之后追加）。

```css
/* FR-5 保底横向滚动 */
.dsh-pm-table-wrap { overflow-x: auto; }
.dsh-pm-table { min-width: 720px; }

/* FR-1 关键列单行；标题列例外 */
.dsh-pm-table th, .dsh-pm-table td { white-space: nowrap; }
.dsh-pm-table .dsh-pm-td-title { white-space: normal; min-width: 220px; }

/* FR-3 操作列不可压缩 */
.dsh-pm-table .dsh-pm-list-actions { flex-wrap: nowrap; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-card-actions { flex: none; min-width: max-content; }
.dsh-pm-table .dsh-pm-list-actions .dsh-pm-btn { white-space: nowrap; }

/* FR-4 窄档让位（并解除标题列 380px 上限，让标题吸收剩余宽度 = FR-2） */
@media (max-width: 1180px) {
  .dsh-pm-table .dsh-pm-td-title { max-width: none; }
  .dsh-pm-table .dsh-pm-col-cat,
  .dsh-pm-table .dsh-pm-col-owner,
  .dsh-pm-table .dsh-pm-col-when { display: none; }
}
@media (max-width: 880px) {
  .dsh-pm-table .dsh-pm-col-progress { display: none; }
}
```

既有规则保留不动：`.dsh-pm-td-title { max-width: 380px }`（宽档照旧生效）、`.dsh-pm-table { width: 100% }`。

## I-4 · 不变式（测试与探针共同断言） serves: FR-3, FR-4, FR-6

1. `thead` 与每行 `td` 的列类名**成对出现**（不存在只标 th 或只标 td 的列）
2. 分组头 `colspan` 保持 `"8"`（隐藏列由 CSS 承担，不改 markup 的列数口径）
3. 操作列内按钮顺序与文案不变：`[→ 阶段] [取消/退回] [会话]`

违反任一条 → 探针 `scripts/list-responsive-probe.mts` 退出码非 0，vitest 用例失败。
