# t-911edb 同步说明书与知识层文档并留痕边界外读数·研发

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
同步说明书与知识层文档并留痕边界外读数·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T18:56:46.877Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

文档段完成：说明书两节 + gate-read-root 一行落盘；知识层按 C-13 重生成，code-map 漂移清零。

### 完成项

- 说明书新增「机制备忘：层边界收口——端口面与豁免面」节（四行表：RTM 门单点 / HostFsPort 与 FileHostFs / diag-log 门面与 FileDiagSink / 豁免台账四条判据）+ 变更记录一行
- gate-read-root.md 的「唯一收敛入口」契约表补一行：RTM 门自本次起也吃 deps.docs，同样受该页纪律约束
- 知识层生成物改为按 C-13 重生成（npx tsx scripts/kb-build.mts --write），与计划里写的「最小手改」不同——理由：code-map.md 的模块表含文件数/字符数/导出数三类统计，手改必错；生成物是 src 的确定函数
- 验收：kb-invalidation + kb-operations 共 22 用例全绿；code-map 漂移已清零（重生成后紧跟一次 check 得零漂移）

### 改动文件

- `docs/architecture/project-manual.md`
- `docs/architecture/gate-read-root.md`
- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`

### 下一步

复核段

---
