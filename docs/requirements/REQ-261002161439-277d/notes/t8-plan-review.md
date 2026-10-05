---
req: REQ-261002161439-277d
kind: notes
title: t8 方案复核（由交棒窗口出具 · 只读审阅）
---

# t8 方案复核意见（`t8-bridge-plan.md` / `t8-progress.md`）

> 出具窗口：`session-8c9338a3-…`（t1–t7 的执行者，现已交棒、**不再绑定本需求**）。
> 方式：**只读审阅 + 只新增本文件**，未改动任何代码或对方的文档。
> 结论：方案**总体成立，建议批准**。以下 6 条是"照抄会白干一批 / 会漏一处修复"的具体修正。

## 1. B9 已经完成了（可以删掉这一批）

卡上点名的 client 那 3 处就是 `panel-refresh.ts` 里的**同名本地函数**（与端口无关，只是名字撞了）。
已在 17:52 改名为 `readFreshness`（对外方法名 `freshness` 不变）并重建产物（`[verify-client] OK`）。

实测（现在）：`grep -rn "deps.repo\|\.snapshot(\|RequirementReader" src/client --include=*.ts` → **空**。
所以 B9 现在是"确认无活可干"，不要为它排一批。

## 2. B1 是安全的（窄化可行）

`RequirementSummary` 带 `sourceSessionId`（`RequirementSummary.ts:169`）、`status`、`id`；
`openRequirementsFor` / `shouldCaptureWindow` / `draftRequirementsFor` 实际只读 **`.id` / `.sourceSessionId` / `.status`**。
⇒ 入参窄化成 `readonly RequirementSummary[]` 完全可行，不需要给摘要补字段。

## 3. `RequirementReader` **不用新建**

它已存在：`src/application/ports.ts:290`，且 `RequirementStore extends RequirementReader`（`:248`）。
B7 的活是"把那 4 处结构化端口类型（`window.ts` / `rtm-yaml.ts` / `boundary-guard.ts` / `verification-doc-writer.ts`）
换成**使用**它"，不是定义它。

## 4. 两处文件路径写错了（照抄会找不到文件）

| 方案里写的 | 真实路径 |
|---|---|
| `src/wiring/gate-wiring.ts` | **`src/gate-wiring.ts`**（多了一层 `wiring/`）；另 `src/application/dive/gate-prompt.ts` 可能也相关 |
| `src/application/internal/h2-compact.ts` | **`src/application/gate/handlers/h2-compact.ts`**（不在 `internal/`） |

## 5. 测试替身有**第二份**，B11 别漏

`tests/queue/v9-harness.ts` 自带一个 `InMemoryRepo`（其注释写明"应用 harness 建在台账还带 `tasks` 的旧世界上"）。
B11 若只动 `tests/application/harness.ts` 会漏掉它 ⇒ 要么一并处理，要么在方案里显式写明为何不动它。

## 6. B0 **必须**带上 `known-defects.md` §7.2 的修复

`ShardedRequirementStore` 的 `notify` 目前把订阅帧里的 `revision` 写成**占位 0**（t5 复核已登记，
原文："t8 接线时一并修"）。B0 正是接 `store.subscribe()` 的那一批——**别让这个占位值活到切换结束**。
（§7.3 的写放大告警空壳同源，优先级低。）

## 7. 数字核对

| 判据 | 方案/台账 | 我实测 |
|---|---|---|
| `deps.repo.` 计数（B12 的"归零"目标） | 109 | **109** ✓ |
| `.mutate(` | 98 | 98 ✓ |
| `new JsonLedgerRepository` | 41 | 41 ✓ |
| 旧端口引用 | 58 | 58 ✓ |
| `snapshot()` | 97（client 0） | 97 ✓ |

## 8. 两条"我此前对用户说错、新窗口已实测纠正"的事（留痕，避免再犯）

1. **只改 JSON 文件不能改窗口绑定**：`JsonLedgerRepository` 进程内只 `load` 一次，
   宿主内存副本会在下次写盘时覆盖外部改动（对方实测 t+8s 还原）。
   可行顺序：**关插件 → 改盘 → 开插件**（对方记在 `t8-progress.md` §4）。
   —— 这条最初由我给出错误指引，特此更正。
2. **活体宿主跑 `dist/index.mjs` 而非 `src/`**（对方实测；dist 曾落后 src 9 个文件）。
   src 改动需 `pnpm build` 才对运行中的宿主生效；与方案 §5 的后果说明一致。
