# t-e2d5ef 服务端契约：verify 端点 + 对话分页游标·联调

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
服务端契约：verify 端点 + 对话分页游标·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T07:45:15.171Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

联调完成：真 HTTP 服务器上 curl 两端点验证通过——verify 六段装配字段齐全、pendingCount=2、coverage 三态布尔正确；dialogue 游标 before/limit 语义正确（page.hasMore/before/total + 升序）。

### 完成项

- 搭真 HTTP 冒烟：内存台账+真 RTM YAML 落盘+真查询（queryVerify/queryDialogue 不替换）+createReqboardHandler 包 node http 服务
- curl /verify：success=true，六段齐全（sheet/history/tracking/coverage/materials/pendingCount），pendingCount=2，coverage 每 FR 三态布尔正确
- curl /dialogue?before=2500&limit=1：page{total:3,hasMore:true,before:2000}，返回 at=2000 一条，游标 ms 语义正确
- 证据落 evidence/verify-dialogue-smoke.txt（83 行）与冒烟脚本 verify-dialogue-smoke.mts

### 改动文件

- `docs/requirements/REQ-261006130057-7a43/evidence/verify-dialogue-smoke.mts`
- `docs/requirements/REQ-261006130057-7a43/evidence/verify-dialogue-smoke.txt`

### 下一步

复核子卡：对 t1 改动做代码复核

---
