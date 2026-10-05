# t-f2cda3 归档后发现漏了也能补：受控补录一条路

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
归档后发现漏了也能补：受控补录一条路

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/archive-amend.test.ts 全绿（补录 3 条 docs+3/amendments+1/评论+1 且状态仍 archived；同批再调全 skipped 且写入序号不变；非归档态拒；补录前后 verification.md 与 merged_into 逐字不变）；npx vitest run tests/tools-schema.test.ts 全绿（新工具在场）。

## 实施方案（implementation）
新增 src/application/use-cases/AmendArchiveManifest.ts（只追加 docs 条目、写一条 amendments、需求评论留痕、已列 path 幂等跳过、状态守卫 archived/legacy done、归属守卫）；新增 src/tools/ArchiveAmendTool/ 工具壳并在 src/tools/index.ts 注册；在 src/http/routers/requirements.ts 加看板路由调同一用例。新增 tests/archive-amend.test.ts。

## 上游产出摘要（dependsSummary）
- 先把规矩定死：哪些文件不用进清单、对账结果长什么样

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:44:56.760Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，「归档后发现漏了」不再是死局：可以补，但补得规矩——只加不改、必须写理由、留痕可查；而且人和 agent 用的是同一条路。

### 完成项

- 受控补录落地：用例 + 工具 + 看板路由三处，两入口共用同一用例
- 只追加/幂等/守卫/不碰冷侧四条语义有用例
- 对账 listed 随补录同步
- 8 条新用例 + 50 条 schema 用例全绿
- 整卡四段子卡链完成

### 改动文件

- `src/application/use-cases/AmendArchiveManifest.ts`
- `src/tools/ArchiveAmendTool/ArchiveAmendTool.ts`
- `src/tools/ArchiveAmendTool/index.ts`
- `src/tools/ArchiveAmendTool/summary.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/http/routers/requirements.ts`
- `src/http/routes.ts`
- `tests/archive-amend.test.ts`

### 下一步

t4：看板显示对账三分类（含老记录「未对账」）。

---
