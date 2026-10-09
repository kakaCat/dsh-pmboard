# 数据模型（REQ-261007193530-3133）

> 视角：本批修复涉及哪些数据结构与字段、是否改 schema、是否有迁移与回滚。

## 结论（一句话） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

**不改表、不改 schema、无迁移、无新字段**。四处修复都是「判定逻辑」与「回执形状」的变化，
台账（`queue.json` 队列任务 + 分片需求文件）的持久化格式一个字节都没动。

## 涉及的数据结构（只读消费） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 结构 | 字段 | 本批用法 |
|------|------|---------|
| `TaskRecord` | `parentId`、`id` | FR-2 角色判定输入（**只读**；不写新字段） |
| `TaskRecord` | `status`、`version`、`statusHistory` | FR-2 迁移目标与零副作用断言对象 |
| `TaskRecord` | `statusHistory[].{status,by.kind,at}` | FR-4 节流读数输入（`h.at` 可能落在未来） |
| `RequirementRecord` | `status` | FR-3 闸门判定的 `from`/`to` |
| 弹框回执对象 | `user_feedback` | FR-1：键**缺席** vs 值为 `undefined` 的形状契约（非持久化结构） |

## 回执形状契约（唯一的"形状"变更） <!-- serves: FR-1 -->

```
否定作答回执 = { success: true, confirmed: false, advanced: false, user_choice: string, note: string }
user_feedback 键仅在有非空反馈时存在（条件展开，不写 undefined）
```

肯定路径、pending 路径、fallback=board 路径的形状逐字不变。

## 存量数据影响 <!-- serves: FR-2, FR-3, FR-4 -->

- **已卡进非法态的存量子卡**：不做数据修复（需求文档已声明边界）；本批只堵新增入口。
- **已取消需求**：字段不动；`canceled → draft` 的合法边仍在，只收紧了发起者。
- **未来时间戳的 done 历史**：不清理，只在读数处 clamp（修数据 vs 修读数的取舍：读数修复可逆、无写风险）。

## 迁移与回滚 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- 迁移：无（无 schema 变更）。
- 回滚：5 个源码文件各自独立，`git revert` 单提交即回滚；无配置项、无特性开关需要清理。
