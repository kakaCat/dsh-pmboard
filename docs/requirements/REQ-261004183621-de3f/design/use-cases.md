---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 设计 · 用例（REQ-261004183621-de3f 归档清单对账）

> 每个用例写：触发者 / 前置 / 主流程 / 异常与边界 / 可观测结果。

## UC-1 提交归档材料时漏列 → 当场被拦 `serves: FR-2`

- **触发者**：实施 Agent（`reqboard_submit(kind=archive)`）。
- **前置**：需求已 `archived`；目录内有 1 份 `evidence/x.txt` 既未列入 `docs`、也不命中豁免。
- **主流程**：校验材料 → 对账三分类 → 发现 `unlisted=['…/evidence/x.txt']` → 闸门 `enforce` 且无 `unlisted_ack` → **拒绝**。
- **异常与边界**：
  - 拒绝时**零台账改动**（不写 archive 记录、不登记产物、不沉淀知识条目、不写评论）。
  - 错误信息必须列出该 path + 两种处置方式（收进 `docs` 或 `unlisted_ack` 带理由）。
- **可观测结果**：返回体为错误信封（码 `REQBOARD_UNLISTED_ACK_REQUIRED`）；台账与队列写入序号不变。

## UC-2 有意只收关键文档 → 显式声明豁免 `serves: FR-2, FR-5`

- **触发者**：实施 Agent。
- **前置**：同上，Agent 决定不收 `evidence/x.txt`（例如它是临时产物）。
- **主流程**：提交时带 `unlisted_ack: [{ path, reason: '临时调试产物，不入清单' }]` → 覆盖全部未列 → 通过。
- **异常与边界**：
  - 只声明了一半 → 拒绝，并指出"缺处置的文件"。
  - `path` 不在未列集合 / `reason` 为空 → 分别拒绝。
- **可观测结果**：归档成功；`archive.reconcile.acknowledged` 含该条；需求评论留痕含理由；看板对账行显示"未列 1（已声明豁免）"。

## UC-3 机器生成物自动豁免 `serves: FR-3`

- **触发者**：实施 Agent（任何归档提交）。
- **前置**：目录内含 `rtm-design.yml`、`rtm-implementing/t-x.yml`、`queue.json`、`state/x.json`。
- **主流程**：对账时这些路径命中 `ARCHIVE_EXEMPTIONS` → 进 `exempted`（带规则 id），**不进入** `unlisted`。
- **异常与边界**：
  - `tasks/t-1.md`、`evidence/*`、`design/*`、`tests/*`、`reviews/*` **不豁免**（它们是人的工作记录与证据）。
  - 新增的机器生成物若未登记规则 → 会以"未列"暴露（迫使显式决定：登记豁免或收进清单）——这是刻意的摩擦。
- **可观测结果**：`reconcile.exempted` 列出四条命中项与 rule id；`unlisted` 不含它们。

## UC-4 归档后发现清单不全 → 受控补录 `serves: FR-4`

- **触发者**：人（看板按钮）或 Agent（`reqboard_archive_amend`）。
- **前置**：需求 `archived`；清单缺 3 份证据文件（本需求遗留场景的翻版）。
- **主流程**：给出 `docs` 增量 + `reason` → 校验状态/归属 → 追加 `archive.docs` → 记 `amendments` 一条 → 写评论 → 返回 `appended` / `skipped`。
- **异常与边界**：
  - 同一批再调 → 全部 `skipped`（幂等），不新增 `amendments` 空条目。
  - 需求不在归档态 → 拒绝（`REQBOARD_BAD_STATUS`）。
  - 试图"删除/修改既有条目" → 无此入口（工具 schema 不含删除参数）。
  - **不碰冷侧产物**：不改 `verification.md`、不改 `merged_into` / `manual_updates`、不改状态。
- **可观测结果**：`archive.docs` 变长、`archive.amendments` 多一条、评论可见；需求状态仍 `archived`。

## UC-5 复核者在看板看对账结果 `serves: FR-5`

- **触发者**：维护者/审计者（看板归档页）。
- **前置**：需求已归档且带 `reconcile`（老记录则无）。
- **主流程**：打开归档区块 → 看到「已列 N · 豁免 N · 未列 N · 闸门=enforce」；未列非空可展开明细与豁免理由。
- **异常与边界**：
  - 老记录无 `reconcile` → 显示"未对账（本功能上线前归档）"，不显示 0（**0 ≠ 未对账**）。
  - 看板读取失败 → 只读区块显示失败提示，不影响任何归档动作。
- **可观测结果**：需求详情 JSON 含 `archive.reconcile`；HTML 区块含计数行（单测断言）。

## UC-6 维护者回退到"只警告" `serves: FR-6`

- **触发者**：维护者改配置。
- **前置**：`archive.unlistedGate: 'warn'`。
- **主流程**：同样的漏列提交 → **不拒绝**，照常归档，仍写 `reconcile`（`gate: 'warn'`）与留痕。
- **异常与边界**：`unlistedGate: 'block'`（非法）→ 装配期抛错；缺省不写配置 → `enforce`。
- **可观测结果**：漏列场景提交成功；返回体 `reconcile.gate === 'warn'`；警告字段仍在（兼容）。
