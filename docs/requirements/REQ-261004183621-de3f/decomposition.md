---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 拆分计划（REQ-261004183621-de3f 归档清单对账）

## 目标 + 做法（一段人能读懂的）

**目标**：归档清单从「人写的名单」变成「系统对账过的记录」——漏登不再靠事后警告，而是提交时当场处置：收进清单，或显式声明豁免并写理由；两者都不做就拒绝（配一键回退）。已归档发现清单不全时，有**一次受控补录**（只追加、留痕、不改历史）。

**做法**：先把契约钉死（豁免常量 + 归档记录增量字段）→ 再把 `submitArchive` 的对账从"事后警告"前移到"写台账之前"（拒绝时零写入）→ 新增补录用例并把工具与看板两条入口收敛到它 → 看板展示对账结果 → 配置开关兜住行为变更 → 迁移兼容与端到端演练各一张卡收口。

## 改动盘点

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/domain/requirement/archive-exemptions.ts` | 豁免规则常量（纯数据 + 匹配函数，零 IO） |
| 新增 | `src/application/use-cases/AmendArchiveManifest.ts` | 补录用例（单一写入口：只追加 + 留痕 + 幂等） |
| 新增 | `src/tools/ArchiveAmendTool/` | `reqboard_archive_amend` 工具壳 |
| 新增 | `scripts/archive-reconcile-drill.mts` | 端到端演练脚本（真实验收的可复核骨架） |
| 修改 | `src/shared/protocol.ts` | `ArchiveRecord` 增量字段 `reconcile` / `amendments` + 类型导出 |
| 修改 | `src/application/use-cases/SubmitArchive.ts` | 对账前移、三分类、闸门拒绝、结果入记录与评论 |
| 修改 | `src/tools/SubmitTool/SubmitTool.ts` | 入参 `unlisted_ack`、出参 `reconcile` |
| 修改 | `src/http/routers/requirements.ts` | 补录看板路由（调同一用例） |
| 修改 | `src/plugin-config.ts`、`src/index.ts`、`src/application/ports.ts` | `archive.unlistedGate` 解析、装配期校验与注入 |
| 修改 | `src/client/views/verification.ts`、`src/client/types.ts` | 归档区块「对账」行 + 老记录"未对账" |
| 新增 | `tests/archive-exemptions.test.ts` 等 6 套 | 见任务表 |

## 任务表

| key | 标题（业务语言） | phase | side | depends_on | 需求条款 |
|---|---|---|---|---|---|
| t1 | 先把规矩定死：哪些文件不用进清单、对账结果长什么样 | implement | backend | — | FR-1, FR-3 |
| t2 | 漏登当场见：提交时对账，不处置就不让过 | implement | backend | t1 | FR-1, FR-2 |
| t3 | 归档后发现漏了也能补：受控补录一条路 | implement | backend | t1 | FR-4 |
| t4 | 让人看得见：归档页显示列了多少、豁免多少、漏了什么 | implement | backend | t1 | FR-5 |
| t5 | 太严可回退：闸门开关与装配期校验 | implement | backend | t1 | FR-6 |
| t6 | 老记录与旧调用方怎么办（迁移与兼容） | test | backend | t2, t3, t4, t5 | FR-4, FR-5, FR-6 |
| t7 | 端到端演练与交付证据 | test | backend | t2, t3, t5 | FR-1, FR-2, FR-4 |

### 依赖图

```
t1 ──┬──▶ t2 ──┐
     ├──▶ t3 ──┼──▶ t6 ──▶ (收口)
     ├──▶ t4 ──┤
     └──▶ t5 ──┴──▶ t7
```

### 容量核算

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 = 16 DU。

| key | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 3 | 4 | 2200 | 6.10 | 通过 |
| t2 | 3 | 6 | 3200 | 7.60 | 通过 |
| t3 | 5 | 5 | 3000 | 9.00 | 通过 |
| t4 | 4 | 4 | 1800 | 6.90 | 通过 |
| t5 | 4 | 3 | 1500 | 6.25 | 通过 |
| t6 | 3 | 5 | 1600 | 6.30 | 通过 |
| t7 | 4 | 6 | 1500 | 7.75 | 通过 |

无超容量卡 → 不需要 `⚠️超容量(建议N批)` 标记。

## 每卡验收（可证伪）

### t1 · 契约与豁免常量

- **implementation**：新增豁免常量模块（四条规则：`rtm-*.yml`、`rtm-*` 目录、`queue.json`、`state`，每条带 reason；导出匹配函数）；在 `src/shared/protocol.ts` 给归档记录加两个可选字段（对账结果、补录留痕）并导出类型；新增单测 `tests/archive-exemptions.test.ts`。
- **acceptance**：`npx vitest run tests/archive-exemptions.test.ts` 全绿（四条规则各一正例 + 五个负例：`tasks/t-1.md`、`evidence/x.txt`、`design/a.md`、`tests/t.md`、`reviews/r.md`）；`grep -c "reconcile?" src/shared/protocol.ts` ≥ 1；`grep -c "node:fs" src/domain/requirement/archive-exemptions.ts` = 0。

### t2 · 提交时对账与闸门

- **implementation**：改 `SubmitArchive`：把目录遍历对账**前移到写台账之前**，产出三分类；未列未豁免且未被 `unlisted_ack` 覆盖 → 拒绝（错误码与两种处置写清）；`warn` 模式不拒；对账结果写入归档记录与需求评论；返回体给 `reconcile` 并保留 `unlisted_files`/`warning`。改 `SubmitTool` 的入参 schema（`unlisted_ack`）与出参 schema（`reconcile`）。新增 `tests/archive-reconcile.test.ts`。
- **acceptance**：`npx vitest run tests/archive-reconcile.test.ts` 全绿（T1/T4/T5/T6/T7/T8/T16）；断言"拒绝后队列与台账写入序号不变"；`grep -c "unlisted_ack" src/tools/SubmitTool/SubmitTool.ts` ≥ 2（入参与说明）。

### t3 · 受控补录

- **implementation**：新增补录用例（只追加 `docs` 条目、写 `amendments` 一条、需求评论留痕、幂等跳过已列、状态守卫 `archived`/`done`、归属守卫）；新增工具壳并注册；在 `src/http/routers/requirements.ts` 加看板路由调用**同一用例**。新增 `tests/archive-amend.test.ts`。
- **acceptance**：`npx vitest run tests/archive-amend.test.ts` 全绿（T9/T10/T11/T12：追加 3 条、重复调用全 skipped、非归档态拒、补录前后 `verification.md` 与 `merged_into` 逐字不变）；`npx vitest run tests/tools-schema.test.ts` 全绿（新工具在场）。

### t4 · 看板可见性

- **implementation**：改归档区块渲染：新增「对账」行（已列/豁免/未列计数 + 闸门），未列非空可展开明细，老记录显示"未对账（本功能上线前归档）"；`src/client/types.ts` 补字段类型。
- **acceptance**：`npx vitest run tests/archive-manifest-view.test.ts` 全绿（T13/T15：计数行在场、老记录不显示 0）；`pnpm build:client` 输出 `[verify-client] OK`。

### t5 · 闸门开关与装配期校验

- **implementation**：`src/plugin-config.ts` 增 `archive.unlistedGate` 解析（缺省 `enforce`，非法值装配期抛错）；`src/index.ts` 装配注入；`src/application/ports.ts` 增可选字段。新增 `tests/archive-gate-config.test.ts`。
- **acceptance**：`npx vitest run tests/archive-gate-config.test.ts` 全绿（T14：缺省 enforce / warn 合法 / `'block'` 抛错且文案含字段名）；`pnpm typecheck` 错误数 ≤ 223。

### t6 · 迁移与兼容

- **implementation**：新增 `tests/archive-compat.test.ts`：无 `reconcile` 的存量记录（不含新字段）在详情透传与看板渲染下都不报错且不显示 0；`warn` 模式下漏列提交成功且 `reconcile.gate='warn'`；老字段 `unlisted_files`/`warning` 仍在。证据落 `evidence/compat.txt`。
- **acceptance**：`npx vitest run tests/archive-compat.test.ts` 全绿；`evidence/compat.txt` 在场且含命令原文与实测输出；`npx vitest run tests/acceptance-archive.test.ts tests/artifact-gates.test.ts` 全绿（既有归档回归）。

### t7 · 端到端演练与交付证据

- **implementation**：新增演练脚本（临时工作区造假需求目录，含豁免项与未列项）：漏列 → 期望拒绝；声明豁免 → 通过；补录 3 条 → 清单变长；同批再补 → 全 skipped；`warn` 重跑第 1 步 → 不拒。输出落 `evidence/archive-reconcile-drill.txt`；四条门禁结果落 `evidence/gates.txt`。
- **acceptance**：脚本 exit 0 且五步输出与期望一致；`evidence/archive-reconcile-drill.txt`、`evidence/gates.txt` 在场；`pnpm build` exit 0；`pnpm test` 失败数 ≤ 基线 97；`pnpm typecheck` ≤ 223；`npx tsx scripts/kb-build.mts --check` exit 0。

## 交付总口径（全部卡完成后）

1. fixture 目录上：漏列被拒（零台账改动）→ 声明豁免通过 → 归档后补录 3 条 → 重复补录幂等。
2. 看板归档页能看到「已列 N · 豁免 N · 未列 N · 闸门=…」；老记录显示"未对账"。
3. 四条门禁达标（build / client / typecheck / test+kb:check），证据落盘。
