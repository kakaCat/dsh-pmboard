# 拆分计划（REQ-261006130057-7a43 需求详情页 UI 优化）

> 依据：design/ 六份（已确认）+ 原型 v1.5（authoritative）。本计划是**唯一需要人批准**的产物；
> 批准后自动落库任务卡并进入实施。

## 目标与做法

按 design/architecture.md 的模块改动地图拆 10 张卡：**契约/服务端先行（t1）→ 壳注册（t2）→
各面板并行（t3~t8）→ 视觉对照与探针（t9）→ 兼容回归收尾（t10）**。
UI 卡全部带原型锚点（prototypes/detail.html#FR-N），验收含可失败的原型对照判据。

## 变更盘点

- **新增**：`src/client/views/panels/verify.ts`、`src/application/query/QueryVerify.ts`、
  `tests/verify-panel.test.ts`、`tests/query-verify.test.ts`。
- **修改**：`report-tabs.ts`（Tab 注册/Tab 栏）、`report-head.ts`（头部三层/评论/进度带）、
  `report-band.ts`（状态带权重）、`panels/{dialogue,docs,trunk,token,prompts,dag}.ts`、
  `styles/report.ts`、`http/routers/panels.ts`、`shared/protocol.ts`（tabCounts.verify、
  对话 page）、`req-detail-store.ts`/`board-mount.ts`（verify 取数接线）、标本与截图脚本、
  既有测试（dialogue/docs 断言同步）。
- **删除**：`panels/docs.ts` 的 `verificationSection`（验收单节提出）、`panels/dialogue.ts` 的
  底部回复框与检索框（D-6 / 边界裁决 2）。

## 批次与依赖

| 批 | 卡 | 依赖 |
|---|---|---|
| 1 | t1 服务端契约：verify 端点 + 对话游标 | — |
| 2 | t2 壳：验收 Tab 注册 + Tab 栏/进度带 + 取数接线 | t1 |
| 3 | t3 验收面板 RTM 列表（+docs 核验节提出） | t2 |
| 3 | t4 头部三层 + 闸门提示条 | — |
| 3 | t5 状态带权重 + 结果格折叠 | — |
| 3 | t6 最近评论紧凑 + 汇报网格 | — |
| 3 | t7 对话面板聊天化 | t1 |
| 3 | t8 文档/Token/提示词密度 + DAG 适配 | — |
| 4 | t9 视觉对照与几何探针 + 测试同步 | t3,t4,t5,t6,t7,t8 |
| 5 | t10 兼容回归收尾（旧服务端降级 / 全量测试 / 构建） | t9 |

## 容量核算（detailUnits = files×1 + anchors×0.5 + chars/2000，容量 16 DU）

全部卡 ≤ 16 DU（最大 t7 ≈ 9.5 DU），无超容量卡。
