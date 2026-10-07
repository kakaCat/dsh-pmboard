---
serves: [FR-1, FR-3]
---

# 接口说明（REQ-261007165643-4275）

> 本需求为 spike（只读调研），**不新增、不修改任何接口**。本文件为验收文档齐备性而设。
> 工具面接口的完整盘点见 [research-report.md](research-report.md) §1.1（27 工具职责总表）。

## 调研覆盖的接口面（只读） <!-- serves: FR-1 -->

- **agent 工具面**：27 个 reqboard_* 工具（registry.ts 实测 27 条）。
- **HTTP 面**：/dashboard/api/reqboard 路由（H2：actor 自报、无鉴权）。
- **client 渲染面**：toolviews 按工具名渲染回执，host/client 工具面一致（FR-3 §3.5 ✅）。

## 接口契约问题索引 <!-- serves: FR-3 -->

| 契约问题 | 报告位置 |
|---------|---------|
| submit prompt「五类」vs 实现 6 kind | §1.4 / §3.1 C-2 |
| RunStatusTool 降级形状（历史事故已修） | §3.1 注、§3.6 |
| 双拼字段 3 对 6 个（tasks[] 子 schema） | §1.3 |
| budget.expectedWindowIndex 有 schema 无描述 | §3.1 C-6 |

## 变更 <!-- serves: FR-1 -->

无。
