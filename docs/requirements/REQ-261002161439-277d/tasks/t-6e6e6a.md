# t-6e6e6a 读得动：内存索引、摘要投影、归档冷读·测试

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
读得动：内存索引、摘要投影、归档冷读·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:17:19.451Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

测试子卡：验收命令 61 passed、reqboard 全域 177 passed；全量回归失败数受并发会话影响升至 99，我碰过的 3 个失败文件逐一核对后确认均属既有失败。

### 完成项

- 卡上验收命令：store-contract 47 + store-cold 14 = 61 passed
- tests/reqboard 全域 177 passed（含并发会话新加的 32 条）
- typecheck 187，与基线逐条 diff 为空，我的文件零错误
- 归因核对：碰过的 3 个失败文件均属既有失败，我的贡献为 0
- repository.test.ts 只红 RandomIdFactory（既有 id 格式），我改的两条测试全绿
- size-budget 红的是其他 19 个文件；我的 2 处尺寸违规已修（现 368 与 383 行）
- message-hygiene：我贡献的 1 处拼接式消息已改用 fmt（现 0）
- 全量回归 99 failed / 3212 passed：上升与并发会话在途改动同步

### 改动文件

- `src/repositories/ShardedRequirementStore.ts`
- `src/repositories/RequirementShardRepository.ts`
- `src/repositories/ShardJournalIO.ts`
- `src/repositories/shardPaging.ts`
- `tests/application/harness.ts`
- `tests/reqboard/store-contract.test.ts`
- `tests/reqboard/store-cold.test.ts`

### 下一步

本卡收尾后由 t5 补写侧（CAS / 差异分派 / 日志追加与截断），并把注册表的写套件翻转。

---
