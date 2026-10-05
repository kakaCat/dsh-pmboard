# t-dbf951 看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出·联调

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-03T10:14:52.822Z，窗口 session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d）

联调阶段通过：六个文件 95 条用例全绿，新端点的请求样例与期望响应一致，既有读点等价性与 token 端点均未破。

### 完成项

- 端到端联调：六个相关测试文件 95 条用例全绿（state-payload、state-payload-client、store-contract、t16-http-queue 真实 handler 与真实文件系统、read-sites-equivalence、token-endpoint）
- 请求样例与期望响应一致：GET / 摘要加 limit 加 nextCursor；POST /artifacts/scan 回 scanned 与 skipped；GET /requirements/:id 回 revision 与 requirement；未命中 404 且 code=REQBOARD_NOT_FOUND
- 既有读点等价性：read-sites-equivalence 8/8——按摘要投影与页内 ready 映射比对（其原主体是旧的逐字节全文比对，本卡按验收有意改掉）
- token 端点未受影响：token-endpoint 全绿（tokenTotals 改为只对本页 id 有界计算）
- 契约未破：store-contract 68/68（内存与分片两实现同表同语义）
- 客户端请求集：state-payload-client 2/2 证实首屏 0 次详情请求

### 下一步

复核子卡：对摘要化后的载荷与两条新端点做反向核查（有无漏迁的读点、状态码与错误码是否一致、有无比原实现更弱的保证）。

---
