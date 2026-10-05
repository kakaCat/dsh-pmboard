# t-d86de5 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡·复核

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
回退只动物化该动的卡：子卡原地复位，不再升格成新父卡·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T06:34:27.010Z，窗口 session-97bd3bf9-d995-4f61-81fa-9d72c58d40f8）

复核结论：两条偏离都定性了——返回值从「id 列表」改成「整卡副本」（少一次读写、两处写入不分叉），物化段的落点从 rollback.ts 改到 rollback-tasks.ts（那才是产卡计划的地方）。其余与卡片一致，重点是「新字段的消费点是否盘全」这一条，这次盘全了。

### 完成项

- 偏离项 1（字段命名）：卡片 implementation 写的是 `resetSubtasks`（id 列表），实现为 `resetTasks`（**整卡副本**数组）。理由：调用方（会话侧与看板侧）本来就在按整卡副本写回（canceled 就是这个形状），用同一形状可让两处写入共用一段代码，降低再次分叉的风险。若坚持 id 列表，调用方要再查一次队列取卡——多一次读写且两处逻辑会分叉
- 偏离项 2（实现位置）：卡片写「rollback.ts 的物化段」，实际物化段在 `rollback-tasks.ts`（rollback.ts 负责编排、rollback-tasks.ts 负责卡计划）。落在 rollback-tasks.ts 是对的：它才是产任务计划的地方，且已有现成的 ID 工厂与副本构造
- 无偏离项：只有顶层父卡物化；子卡原地复位且保留 parentId/stageKind；复位与取消同一次写入；顺序纪律（任务先写、需求后写）未变
- 完整性核对：两条回退路径（MoveRequirement / requirements.ts）都消费了新字段——这一条是重点核对项，因为早先 syncAllReqArtifacts 那次我漏掉了测试消费者
- 已修的我方缺陷：既有严格相等断言（rollback-tasks.test.ts:105）已更新到新契约；全量失败数由 97 降到 96（我的改动面零失败）

### 改动文件

- `src/application/internal/rollback-tasks.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`

---
