# t-f6d24d 一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝·联调

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-03T09:47:55.771Z，窗口 session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d）

联调阶段通过：真实 handler 乘真实分片存储的端到端通路、迁移门、端口契约与放大探针共 4 文件 79 条用例全绿。

### 完成项

- 端到端联调：tests/t16-http-queue-integration.test.ts 用真实 handler 加真实分片存储跑通建需求、写、读、任务队列通路
- 迁移门联调：tests/reqboard/migration-gate.test.ts 4/4——夹具数据根只放 v9 单册时启动抛 REQBOARD_REQUIRES_MIGRATION 且不生成 requirements/ 目录
- 端口契约联调：tests/reqboard/store-contract.test.ts 68/68——内存实现与分片实现同表同语义（读侧与写侧）
- 放大治理联调：tests/reqboard/store-amplification.test.ts 通过——摘要读不再放大为整册读
- 合计：4 个文件 79 条用例全绿，请求样例与期望响应一致
- 接口面确认：src/http 与 src/application 均无旧端口调用点，读点全部走 RequirementStore

### 改动文件

- `docs/requirements/REQ-261002161439-277d/design/b12-bridge-removal.md`

### 下一步

复核子卡：对删除的旧端口与新增读点做一次反向核查（有无漏迁的调用点、有无被吞的错误、有没有用 as never 掩盖的装配缺失）。

---
