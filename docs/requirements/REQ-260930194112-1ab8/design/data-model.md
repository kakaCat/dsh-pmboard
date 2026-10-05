# REQ-260930194112-1ab8 数据模型 · 零数据变更 + DOM 契约表 serves: FR-4, FR-6

> 结论先行：**无台账、无协议、无持久化字段变更**。本文件钉死的是「DOM 结构契约」与「兼容性边界」。

## D-1 · 数据模型变更：无 serves: FR-6

| 对象 | 定义位置 | 本次变更 |
|------|----------|----------|
| `BoardState` / `RequirementRecord` / `ReqCard` | `src/client/types.ts` | 字段零新增、零删除、零类型变更 |
| 台账 JSON / SSE 载荷 | host 侧 | 不涉及（纯客户端渲染） |
| `ListViewOpts`（sortKey/sortDir/page/pageSize） | `src/client/views/board.ts` | 签名与默认值不变 |

## D-2 · DOM 契约表（新增结构） serves: FR-4, FR-5

| 选择器 | 语义 | 出现位置 | 出现条件 |
|--------|------|----------|----------|
| `.dsh-pm-table-wrap` | 表格滚动兜底容器 | `.dsh-pm-list` 内、`.dsh-pm-table` 外 | 非空列表恒有 |
| `.dsh-pm-col-cat` | 分类列（第 3 列） | 该列 `th` + 每行 `td` | 恒在 markup，≤1180px 被 CSS 隐藏 |
| `.dsh-pm-col-progress` | 进度列（第 5 列） | 同上 | 恒在 markup，≤880px 被 CSS 隐藏 |
| `.dsh-pm-col-owner` | 负责人列（第 6 列） | 同上 | 恒在 markup，≤1180px 被 CSS 隐藏 |
| `.dsh-pm-col-when` | 更新时间列（第 7 列） | 同上 | 恒在 markup，≤1180px 被 CSS 隐藏 |

关键取舍：**隐藏由 CSS 承担，markup 永远输出 8 列**。理由：不引入 JS 宽度监听（需求边界第 3 条），不改列数口径，宽窄两档共用同一份 HTML，避免「服务端/客户端两套列集合」。

## D-3 · 兼容性与降级 serves: FR-6

| 特性 | 用到它的规则 | 最低支持 | 不支持时的降级 |
|------|--------------|----------|----------------|
| `white-space: nowrap` | FR-1 | 所有浏览器 | —（无降级需求） |
| `min-width: max-content` | FR-3 | Chrome 46+ / Safari 11+ | 退化为按钮可收缩（= 现状，不更差） |
| `@media (max-width:)` | FR-4 | 所有浏览器 | 退化为「始终 8 列 + 横向滚动」（= 现状的可用子集） |
| `overflow-x: auto` | FR-5 | 所有浏览器 | — |

降级方向均为「退回现状或更可用」，不存在比修复前更差的路径。

## D-4 · 迁移与回滚 serves: FR-6

- **迁移**：无数据迁移、无回填、无灰度开关（纯样式 + markup，随版本即时生效）
- **回滚**：还原 `src/client/views/board.ts`、`src/client/styles/board.ts`、`scripts/list-responsive-probe.mts` 三处即可，无残留状态
