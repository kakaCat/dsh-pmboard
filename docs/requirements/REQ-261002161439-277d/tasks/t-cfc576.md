# t-cfc576 看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出·研发

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T10:14:40.424Z，窗口 session-afdbd34e-aa70-4b21-bd02-4c31bd3d9e3d）

研发阶段完成：主机侧摘要分页与两条新端点、客户端详情取数入口、产物重建（verify OK）；列表与详情的类型分层按实测结论另开卡。

### 完成项

- host 侧：GET / 改为摘要加 scope/limit/cursor 并返回 nextCursor；摘掉每请求 syncAllReqArtifacts
- host 侧：新增 POST /artifacts/scan（扫描唯一入口）与 GET /requirements/:id（热未命中回落冷读、未命中 404 REQBOARD_NOT_FOUND），并在 routes.ts 接线与映射状态码
- 守住既有契约：tokenTotals 保留，改为只对本页 id 有界计算，token-endpoint 用例原样通过
- 客户端：api.ts 新增 fetchRequirement（新端点的客户端入口）；types.ts 增 RequirementSummary 类型供后续分层使用
- 产物：pnpm build:client 通过并 verify OK（bundle 335946 字节）
- 研发阶段自测：state-payload 7/7、state-payload-client 2/2、read-sites-equivalence 8/8、token-endpoint 通过
- 未做（已如实记录并建议单开卡）：board-mount 与六个视图的列表/详情类型分层——实测放宽类型会级联 200 多处

### 改动文件

- `src/http/routers/stages.ts`
- `src/http/routes.ts`
- `src/client/api.ts`
- `src/client/types.ts`
- `lib/client.js`

### 下一步

联调子卡：用真实 handler 加真实分片存储验证新端点与分页的端到端行为。

---
