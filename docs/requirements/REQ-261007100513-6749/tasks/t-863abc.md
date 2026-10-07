# t-863abc 固化同口径成本度量命令

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
固化同口径成本度量命令

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果

① pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286 的五项读数与诊断报告逐位相同（请求 2,324；未命中 9,484,808；命中缓存 402,700,547；输出 1,400,237；跨度 21.1h）；② 输出含缓存失效点清单（24 条），且逐条如实标注前 60 秒内有无 system/message（19 有 / 5 无）；③ 树根与单会话根各做一次独立实现交叉验证，读数逐位相同；④ 判据以基线快照点为准：源会话仍在增长，默认全量口径与快照的差值不作为判据。

## 实施方案（implementation）
① 新增 scripts/token-cost-report.mts：解压 ~/.dsh/sessions/<项目>/*/session.v4.jsonl.zstd，按会话 createdAt 过滤自身请求后汇总请求数 / 未命中输入 / 命中缓存 / 输出 / 墙钟，并输出缓存失效点清单（cacheReadTokens<20000 且 inputTokens>40000 的请求 + 其前 60 秒内是否有 system/message）；支持 --req <REQ> 按需求过滤来源会话；② package.json 加脚本 cost:report（tsx scripts/token-cost-report.mts），不改既有脚本。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T02:26:20.954Z，窗口 session-57f49896-70ca-4e67-b9f2-acc2cbdcc531）

t6 父卡交付：同口径成本度量命令落地并自证，可作为本需求改造前后的统一度量口径。

### 完成项

- 子卡 t-3f60b3（研发）与 t-a5782d（复核）均 done
- 新增 scripts/token-cost-report.mts：树归属汇总 + 失效点清单 + 如实标注
- package.json 新增 cost:report 一行，未改既有脚本
- 基线快照点逐位复现：2,324 / 9,484,808 / 402,700,547 / 1,400,237 / 21.1h
- 独立实现交叉验证两例逐位相同（树根 d71bdc25 与单会话根 session-57f49896）
- 复核更正了诊断报告中一处过度断言（失效点前 60 秒并非必有 system/message）
- 默认全量口径与快照的差值已写进帮助文本，不作为判据

### 改动文件

- `scripts/token-cost-report.mts`
- `package.json`

### 下一步

本卡收尾；该命令将用于本需求改造前后的同口径成本对比（验收材料引用）。

---
