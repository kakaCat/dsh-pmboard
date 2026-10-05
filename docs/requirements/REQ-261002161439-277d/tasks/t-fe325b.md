# t-fe325b 一处原子写、一处分片 IO：仓储与原子写搬迁·研发

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
一处原子写、一处分片 IO：仓储与原子写搬迁·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T09:01:25.821Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

研发子卡：原子写搬到新家（全仓唯一实现）并加上失败清理；分片目录仓储落地，19 用例全绿。

### 完成项

- 新增 atomicWrite.ts：persistAtomic 迁出，fs 能力经 AtomicFs 端口注入
- 行为修正：rename 失败时清理临时文件（原实现会残留 .tmp）
- 7 处 import 全部改指新家；定义全仓唯一（grep 命中 1 处）
- 新增 RequirementShardRepository：读/写/追加/隔离/冷热搬运/枚举六类方法
- 校验先于任何写：失败时连目录都不建（一个字节不落盘）
- 追加日志按提交点计数截断未提交尾巴；坏行走压实重写加告警
- 19 用例覆盖卡上五条验收，含注入 rename 失败的原子写路径

### 改动文件

- `src/repositories/atomicWrite.ts`
- `src/repositories/RequirementShardRepository.ts`
- `src/repositories/QueueRepository.ts`
- `src/adapters/JsonLedgerRepository.ts`
- `src/adapters/CaptureRejectionFile.ts`
- `src/adapters/InjectionLogFile.ts`
- `src/adapters/IsolationTraceFile.ts`
- `scripts/migrate-ledger.ts`
- `tests/reqboard/shard-repository.test.ts`
- `tests/application/repository.test.ts`
- `tests/queue/QueueRepository.test.ts`

### 下一步

进入联调子卡：验证分片仓储与 domain 路径/日志编解码跨层组合，以及搬迁后 7 处 import 面一致。

---
