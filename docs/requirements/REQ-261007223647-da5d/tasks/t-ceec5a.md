# t-ceec5a 看板 pending 票数据投影·联调

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
看板 pending 票数据投影·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T16:13:20.707Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，服务端与看板之间的这条路真的通了：/state 的票读数是加法式新增，旧消费者不受影响；顺带坐实并修好「重投端点此前读了不存在的口」这一处真假通。

### 完成项

- 接口面清点：唯一对外面 = HTTP GET /state 载荷，本次是**加法式**新增键（旧键逐字不动），既有消费者零改动
- 端到端联调证据：真注册表 + 真路由 + 真存储，断言 /state 带票出六键、无票出空数组、未装配读口不出 500（tests/pending-board.test.ts 路由块 5 例，含 POST /confirm/repost 实读）
- 联调发现并已随本卡修好：组合根传的是 PendingConfirmRegistry，而它此前**没有实现**已声明的 pendingForRequirement——POST /confirm/repost 在生产里会回 unavailable（t4 的读口从未真的通）。补上后该端点回 still-open
- 客户端侧兼容：BoardState 类型未消费新键，缺键/多键都不影响既有渲染（t10 接线卡再补类型与消费）
- 命令：npx vitest run tests/pending-board.test.ts tests/state-payload-client.test.ts tests/state-no-bigfield-read.test.ts tests/confirm-repost.test.ts → 全绿

### 改动文件

- `tests/pending-board.test.ts`

### 下一步

复核段：对照 IF-5 逐条核对载荷键与筛选口径

---
