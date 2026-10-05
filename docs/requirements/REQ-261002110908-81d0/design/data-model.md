# REQ-261002110908-81d0 数据模型设计 · 约定常量与覆盖清单（入参契约零变更） `serves: FR-1, FR-2, FR-3`

> 本需求**不碰**任何持久化结构：队列台账（`queue.json`）、产物簿、RTM yml、任务卡文档全部零变更。

## 数据模型总览 `serves: FR-1`

**零 schema 变更**。新增的"数据"只有两个进程内只读常量（模块级 `const`，不落盘、不进台账、不参与版本）。

## 新增内部常量与清单 `serves: FR-1, FR-2`

```ts
// src/tools/shared.ts（新增导出）

/** 长文本入参写法约定（唯一来源；各工具描述引用它，不复制） */
export const LONG_TEXT_ARG_NOTE: string
// 约束：≤120 字；必须含三锚点 —— ① 每条短句（建议 ≤60 字）② 需引号用「」（避免半角双引号）③ 文本过大拆多次调用

/** 覆盖清单：哪个工具的哪个字段受约定约束（遍历用例与新增工具登记的锚点） */
export const LONG_TEXT_FIELDS: readonly { readonly tool: string; readonly field: string }[]
```

**约束与不变量**：

| 项 | 约束 |
|---|---|
| 清单元素 | `tool` 必须是已注册工具名（`reqboard_task_report` 等）；`field` 必须是该工具 `parameters` 里的真实键 |
| 数组型字段 | `completed`、`evidence` 这类数组字段按**元素级**适用约定（元素同样是长文本） |
| 不可变性 | 清单为 `readonly`，运行期不改写（无新增状态） |
| 失败语义 | 本数据结构**不产生错误码**；不一致只在用例里报（缺项名单） |

## 工具入参数据契约（核验点） `serves: FR-1`

以 `reqboard_task_report` 为例，上限数字取自 `src/application/use-cases/ReportTask.ts` 的 `normalizeText` 调用：

| 字段 | 类型 | 必填 | 约束（现状） | 本次是否变更 |
|---|---|---|---|---|
| `task_id` | string | 是 | ≤64 字符 | **不变** |
| `summary` | string | 是 | ≤2000 字符，非空 | **不变** |
| `completed` | string[] | 否 | 1–50 条，每条 ≤500 字符 | **不变** |
| `files_changed` | string[] | 否 | 每条 ≤400 字符 | **不变** |
| `next_step` | string | 否 | ≤1000 字符 | **不变** |

**结论**：字段名、类型、必填、上限**全部零变更**；改动只落在参数的 `description` 文本上。

## 迁移与兼容 `serves: FR-1, FR-2, FR-3`

| 项 | 结论 |
|---|---|
| 数据迁移 | **无需**：无 schema、无落盘格式、无台账字段变化 |
| 回填 | **无需**：历史汇报文本原样保留，重跑不重写已归档任务卡 |
| 兼容 | 老窗口 / 老调用 / 老参数写法行为不变（描述不进判定） |
| 灰度与开关 | **无开关**：插件重新构建即生效（C-11 `pnpm build`；改客户端则 C-12） |
| 回滚路径 | 还原三处文本 → `node scripts/inline-prompt-fragments.mjs` 重生成 → `npx vitest run` 与 `pnpm kb:check` 复跑；无残留状态 |
