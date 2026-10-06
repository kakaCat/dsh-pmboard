# t-aaae13 服务端契约：verify 端点 + 对话分页游标·研发

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
服务端契约：verify 端点 + 对话分页游标·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T07:39:06.755Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

完成 t1 研发：verify 端点 + 对话分页游标落地。npx vitest run tests/query-verify 14/14 全绿；tsc --noEmit 零错；波及面 19 个既有测试套件全绿。偏离已如实记录（page 保持必填、游标 ms 语义、接线补 4 个文件各一行、tabCounts.verify 主动填值、对齐钉在测试）。

### 完成项

- protocol.ts 加 tabCounts.verify 与 VerifyPanelResponse 形状
- 新建 QueryVerify 六段装配（sheet/history/tracking/coverage/materials/pendingCount），RTM 缺失降级不抛
- panels.ts 加 verify 端点（含 contracts/routes/index 接线）
- QueryDialogue 游标改 ms 时间戳 before/limit，返回 page 字段，items 升序
- QueryReport 填 tabCounts.verify（pendingCountOf 单点共用）
- tests/query-verify.test.ts 14 例（T-20/21/22）
- tests/query-dialogue 旧断言按新游标语义改写

### 改动文件

- `src/application/query/QueryVerify.ts`
- `src/shared/protocol.ts`
- `src/application/query/contracts.ts`
- `src/application/query/QueryReport.ts`
- `src/application/query/QueryDialogue.ts`
- `src/http/routers/panels.ts`
- `src/http/routes.ts`
- `src/index.ts`
- `src/application/query/index.ts`
- `tests/query-verify.test.ts`
- `tests/query-dialogue.test.ts`

### 下一步

联调子卡：真服务起起来 curl 两端点验字段 + 构建通过

---
