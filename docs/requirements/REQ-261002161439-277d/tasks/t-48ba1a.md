# t-48ba1a 读得动：内存索引、摘要投影、归档冷读·研发

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
读得动：内存索引、摘要投影、归档冷读·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T09:08:03.511Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

研发子卡：分片 Store 读侧落地（懒建索引 / 装配 / 冷读回落 / 坏分片剔除），写侧显式标注属 t5；抽出共享假 fs 带读写探针。

### 完成项

- 新增 ShardedRequirementStore：懒建内存索引，构造期零读盘
- get()：装配评论/历史/产物/计划/验收，剔掉 v10 内部计数字段
- getSummary/listSummaries/peekSummaries：摘要走内存，未命中定点补读
- 冷读回落：热侧未命中读 archive/，get(归档) 返回全文
- 分页游标与排序契约（updatedAt 降序、同刻 id 升序）
- 坏分片从索引剔除并告警，不抛整页错
- 写侧显式抛「未落地」（t5 的卡），不假装成功
- 抽出共享 FakeShardFs（带读写探针），避免两份假 fs 漂移

### 改动文件

- `src/repositories/ShardedRequirementStore.ts`
- `src/repositories/RequirementShardRepository.ts`
- `tests/reqboard/fake-shard-fs.ts`
- `tests/reqboard/store-contract.test.ts`
- `tests/reqboard/store-cold.test.ts`

### 下一步

进入联调子卡：验证端口契约在分片实现上与内存替身同源，且跨层组合无自造实现。

---
