# t-9abc65 真机对账与全量门禁回归

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
真机对账与全量门禁回归

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果

跑 `npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts`，四条输出逐条比对：① 段①（REQ-261005123641-3982，不带会话）打印 `file-missing 计数 = 0`；② 段② 打印 `分歧 = 0` 且 `带 absPath 的行 = 25 / 25`；③ 段③（REQ-260930094139-2d65）state 分布为 `{"file-missing":37}`；④ 段④（强制候选根为空）state 分布为 `{"unknown":25}` 且 `带 absPath 的行 = 0`。门禁四条：`npx tsc --noEmit` 输出 0 个 `error TS`（退出码 0）；`pnpm build` 退出码 0 且 `grep -c docRootsOf dist/index.mjs` ≥ 1；`pnpm build:client` 输出含 `[verify-client] OK`；`pnpm test` 的 `Tests <N> failed` 中 N ≤ 80（基线 = `/private/tmp/req-baseline` worktree 660973e 的 80 failed）。原始输出贴进 docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md。

## 实施方案（implementation）
用真实端点跑对账脚本并把原始输出写进 docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md：① 不带 ?session= 拉 REQ-261005123641-3982/docs 统计 state 分布；② 带 ?session=<本仓会话> 逐条 os.path.exists(absPath) 比对；③ REQ-260930094139-2d65 回归必须仍 file-missing；④ 门禁 pnpm typecheck / pnpm test（与基线比对）/ pnpm build 与 pnpm build:client。

## 上游产出摘要（dependsSummary）
- 服务端按需求自身工作区判存在，并给出绝对路径
- 详情页路径格显示绝对路径，未判定不划线

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:56:33.915Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

这一步做完，这条修复在真实台账与真实磁盘上被证明有效：归档需求的详情不再整列谎报缺失，绝对路径逐条对得上，真丢文件的需求照样说缺失，判不了的场景说未判定。

### 完成项

- 真实台账 + 真实磁盘对账：REQ-261005123641-3982 不带会话时 file-missing 从 25 降到 0
- 候选根含会话根时 25/25 行都带 absPath，state 与 os.path.exists 逐条比对 0 分歧
- 回归：REQ-260930094139-2d65（文件真丢）仍 37/37 file-missing，未被 unknown 掩盖
- 读根全不可用时 25 行全部 unknown 且 0 条 absPath
- 门禁：pnpm build 退出码 0 且 dist 含新符号、build:client 过验、tsc 0 错误、全量测试 68 failed ≤ 基线 80
- 证据落盘 docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md（含对账脚本与原始输出）

### 改动文件

- `docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md`
- `docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts`

### 下一步

进入验收：提交验收材料（reqboard_submit kind=verification）

---
