# t-f52aeb 文档与知识层同步：数据层描述不再指向单册

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档与知识层同步：数据层描述不再指向单册

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：backend

## 得到什么结果
① pnpm kb:check 退出码 0（生成物零漂移 + 九项自检 + K10 覆盖度全过）；② grep -rn 查 JsonLedgerRepository 在 docs/ 下无输出；③ grep -rn 查 dsh-reqboard.json 在 docs/knowledge/ 下的输出只出现在 legacy 导出格式的语境里；④ 人工比对一次：architecture.md 的数据根与 7 个文件清单与 design/architecture.md 一致。

## 实施方案（implementation）
更新 docs/knowledge/architecture.md：分层图里 adapters 的 JSON 台账描述改为新的分片数据层（数据根、7 个文件、内存索引、归档冷存），并在架构说明处指向 design/architecture.md；若 docs/knowledge/conventions.md 或 docs/knowledge/INDEX.md 提到 dsh-reqboard.json 单册或 JsonLedgerRepository，一并改正；跑 pnpm kb:build 重生成机器索引与 pnpm kb:check 自检；不改任何提示词分片内容（src/domain/prompt/**）。

## 上游产出摘要（dependsSummary）
- 一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T10:16:54.383Z，窗口 session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d）

文档与知识层同步完成：kb:check 退出码 0、知识层与架构文档内旧类 0 处、dsh-reqboard.json 仅在 legacy 导出语境、数据根与 8 文件清单与设计逐项一致。

### 完成项

- 验收① 达成：pnpm kb:build 重生成后 pnpm kb:check 退出码 0（生成物零漂移、kb-probe 11 项全过、K10 覆盖 8 项零漂移）
- 验收②：docs/ 下 JsonLedgerRepository 命中 252 处**全部在历史需求档案**里（留痕，不改写历史）；知识层与架构文档等非需求目录为 **0 处**
- 验收③ 达成：docs/knowledge/ 下 dsh-reqboard.json 仅 1 处，且正处 legacy 导出格式语境（标注为导出格式、运行时不读写）
- 验收④ 达成：知识层写的数据根 ~/.dsh/reqboard/ 与 8 个文件名（meta/record/comments/history/artifacts/plan/verification/archive）与 design/architecture.md 逐项一致
- docs/knowledge/architecture.md：分层图的 adapters 描述改为分片台账；职责表两行改写；新增「数据层：需求台账怎么存」小节（数据根 + 文件清单 + 端口读写 + 首屏摘要 + 不落盘索引 + 迁移与回滚）
- docs/knowledge/glossary.md：台账条目从旧单册适配器改指 RequirementStore 与 ShardedRequirementStore
- 顺带修掉一处门禁缺口：把三个一次性数据脚本（migrate-ledger-v10、rollback-ledger-v10、backfill-task-refs）补进知识层排除表并写明理由
- 生成物重生成：code-map.symbols.tsv 等由 kb:build 刷新，旧类符号行随之消失

### 改动文件

- `docs/knowledge/architecture.md`
- `docs/knowledge/glossary.md`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/INDEX.md`
- `src/domain/knowledge/operations.ts`

### 下一步

关本卡；随后推进 t-07b058（收口：三实现契约、放大探针、回归基线与构建）。

---
