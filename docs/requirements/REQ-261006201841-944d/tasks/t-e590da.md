# t-e590da /state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）·联调

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
/state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T13:09:31.974Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

联调段完成：/state payload 增键不破坏既有消费方，三族回归 20/20。

### 完成项

- 判据复跑：board-archived-origins 13/13 全绿
- /state 既有回归：project-identity.e2e + state-payload-client + legacy-compat 共 20/20 全绿
- payload 兼容：origins 为新增键，旧客户端忽略即旧行为

### 改动文件

- `src/http/routers/stages.ts`

### 下一步

复核段（判据来源与白名单取舍）

---
