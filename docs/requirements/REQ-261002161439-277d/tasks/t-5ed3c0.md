# t-5ed3c0 一处原子写、一处分片 IO：仓储与原子写搬迁·测试

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
一处原子写、一处分片 IO：仓储与原子写搬迁·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:03:12.177Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

测试子卡：分片单测 20 用例全绿，队列旁证 141 全绿，typecheck 与基线逐条一致，全量回归失败数未变。

### 完成项

- npx vitest run tests/reqboard/shard-repository.test.ts → 1 file / 20 passed
- npx vitest run tests/queue → 13 files / 141 passed（旁证）
- npx tsc --noEmit → 187，与基线逐条 diff 为空，我的文件零错误
- grep export async function persistAtomic → 全仓仅 1 处定义
- pnpm test → 97 failed / 3168 passed（失败数未变，通过数 +35）
- 注：通过数增量含并发会话 REQ-261002164800-d8f2 新增的约 15 个用例

### 改动文件

- `tests/reqboard/shard-repository.test.ts`
- `tests/queue/QueueRepository.test.ts`
- `tests/application/repository.test.ts`

### 下一步

本卡收尾后由 t4 接入分片实现到契约测试（t2 骨架 + 本卡仓储）。

---
