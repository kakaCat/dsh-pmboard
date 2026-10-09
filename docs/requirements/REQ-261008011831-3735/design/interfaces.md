---
requirement_id: REQ-261008011831-3735
title: "接口面：复用 isCanceled 单点（无新增对外接口）"
status: design
category: chore
requirement_refs: [CH-2]
---

# 接口设计（REQ-261008011831-3735）

## 接口清单 <!-- serves: CH-2 -->

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|
| IF-1 | 函数 `isCanceled(req: { status: string }): boolean`（`src/domain/status/Predicates.ts`，**既存、本需求仅复用**） | 「这条需求/卡是不是已取消」的唯一判据 | CH-2 |
| IF-2 | 命令 `npx vitest run tests/live-tasks-single-source.test.ts`（既存用例） | 反面断言双向门：新增手写即红、清单失效即红 | CH-1 |
| IF-3 | 命令 `npx tsx scripts/test-baseline.mts --check` / `--refresh`（既存脚本） | 采集失败集合并与基线算差集 | CH-3 |

**不适用说明**：本需求**不新增、不修改任何对外接口**（工具面 / HTTP / 事件表均未动）。IF-1~IF-3 全是既存面，本需求只是**新调用** IF-1、**被** IF-2 裁决。

## 调用点契约（本需求的两处改动） <!-- serves: CH-2 -->

| 调用点 | 传入 | 语义保证 |
|---|---|---|
| `report-head.ts:485` | `isCanceled(h)`，`h = report.head` | 终态只读说明在 `已取消 / 已归档` 二选一，文案串一字未改 |
| `report-band.ts:290` | `isCanceled(report.head)` | 取消态分支返回「已取消：无验收结论」；`:275` 的 `status` 常量保留（其余 6 处仍在用） |

**形状前提**：`HasStatus = { status: string }`——`ReportHead` 满足该结构化最小投影，故调用点无需包装临时对象。
