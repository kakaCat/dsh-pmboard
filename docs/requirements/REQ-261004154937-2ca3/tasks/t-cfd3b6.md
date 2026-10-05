# t-cfd3b6 让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0·联调

> 需求：REQ-261004154937-2ca3 token 统计纳入子代理消耗（跨会话聚合口径）

## 在做什么
让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T08:07:44.370Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

联调段完成：血缘服务在真机上确实是可注入的公开口，且缺了它插件照常装配、读数退回旧行为——不会因为多依赖两个服务而装不起来。

### 完成项

- 装配冒烟（apply-wiring 5 条）全绿：插件在服务齐备与缺失两种情况下都能装起来，缺失时走降级
- 服务名两侧都核实：DSH 侧 sessionPersistence / sessionProjectionCache 是公开注入点（agent-loop、acp、agent-team 同款 ctx.inject 用法），运行中宿主 bundle 里两个名字都在（sessionPersistence 90 处、sessionProjectionCache 12 处）
- 契约样例与既有用例一致：无血缘服务时快照标 scope=self + descendants-unavailable，数字与自身路径逐字相同（session-probe-token 6 条全绿）
- 踩到并修掉一处装配兼容问题：注入回调若按非空 ctx 写，装配冒烟桩（对未装配服务回传 undefined）会抛 TypeError；现回调可空，服务缺失是常态降级路径而不是异常

### 改动文件

- `src/index.ts`

---
