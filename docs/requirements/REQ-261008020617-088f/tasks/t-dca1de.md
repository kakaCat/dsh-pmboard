# t-dca1de 同步说明书与知识层文档并留痕边界外读数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
同步说明书与知识层文档并留痕边界外读数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
① npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts → 与改前读数一致（不新增红）；② grep -n 'HostFsPort' docs/architecture/project-manual.md 与 grep -n 'DiagSinkPort' docs/architecture/project-manual.md → 各命中；③ pnpm kb:check 的漂移清单里不新增与本次新增符号相关的条目，且如实申报未重跑 pnpm kb:build；④ 交付材料含改前/改后 layer-boundary 读数（failed 用例 2 → 1，tools/http 那条两次都在，未进豁免台账）。

## 实施方案（implementation）
docs/architecture/project-manual.md 增/改两节：端口面新增 HostFsPort / DiagSinkPort（附『根逐次显式』的理由与 gate-read-root.md 的两次误拦事故），层门新增豁免台账机制与四条判据。docs/architecture/gate-read-root.md 在『唯一收敛入口』契约里补一句：RTM 门自本次起也吃 deps.docs，故同样受该纪律约束。docs/knowledge/code-map.md 与 docs/knowledge/code-map.symbols.tsv 只做新增/迁移符号的最小手改（不执行 pnpm kb:build，避免覆盖工作树里他人在途的生成物）。交付材料里给出改前/改后两份 npx vitest run tests/layer-boundary.test.ts 读数，并点名 tools/http 那条红是另一条腿、两次都在。

## 上游产出摘要（dependsSummary）
- 合并三个同构 RTM 门为单点并改走文档端口
- rtm-health 健康检查读路径端口化并收尾该文件的 I/O
- diag-log 改为无 I/O 门面并把文件实现落到适配层
- 两处绝对路径判定收口到纯函数与宿主端口
- Dive Service 外壳外移到适配层

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T18:57:02.372Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

t9 完成：文档与知识层同步，交付读数齐备（failed 2→1、台账空、kb 用例全绿）。

### 完成项

- t9 完成：说明书新增「层边界收口——端口面与豁免面」节 + 变更记录一行；gate-read-root 契约表补 RTM 门适用面
- 知识层按 C-13 重生成（kb-build --write），code-map 漂移清零；kb 两份用例 22 条全绿
- 交付读数：layer-boundary failed 2 → 1（只剩边界外那条），台账 entries 空 / frozenCount 0
- 两张子卡（文档段 / 复核段）全部 done

### 改动文件

- `docs/architecture/project-manual.md`
- `docs/architecture/gate-read-root.md`
- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`

### 下一步

九张卡全部收口后提交验收材料（reqboard_submit kind=verification）

---
