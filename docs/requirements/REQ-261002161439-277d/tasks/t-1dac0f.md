# t-1dac0f 把数据放哪、长什么样定成纯函数：路径、摘要、日志行·研发

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
把数据放哪、长什么样定成纯函数：路径、摘要、日志行·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T08:39:58.818Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

研发子卡：三个零 I/O 纯函数模块与 61 个单测落地，未触达任何既有文件。

### 完成项

- ReqboardPaths.ts 186 行：7 个文件名与热/冷侧路径唯一事实源
- 需求 id 校验兼路径穿越防线，非法 id 拒绝拼路径
- RequirementSummary.ts 174 行：摘要投影，六大字段严格不进摘要
- advanceAlert 只取 pausedReason 与 failureStreak 两项
- Journal.ts 285 行：评论行与历史行编解码 + 计数截断 + 装配转换
- 计数大于日志行数抛 COUNT_EXCEEDS_LINES，不静默降级
- 3 份单测 563 行共 61 用例全绿
- 本次仅新增 6 个文件，find -newermt 证明未改既有源码

### 改动文件

- `src/domain/requirement/ReqboardPaths.ts`
- `src/domain/requirement/RequirementSummary.ts`
- `src/domain/requirement/Journal.ts`
- `tests/reqboard/domain-paths.test.ts`
- `tests/reqboard/domain-summary.test.ts`
- `tests/reqboard/domain-journal.test.ts`

### 下一步

进入联调子卡：三模块串联跑通一条真实数据通路并验证跨层可导入。

---
