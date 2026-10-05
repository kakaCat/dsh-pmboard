# t-8b5bf8 宿主兼容入口：/dashboard 不再 404·复核

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
宿主兼容入口：/dashboard 不再 404·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T03:33:05.015Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

复核段结论：契约逐条落地、源码无偏离——但复核揪出 4 条跟进项，其中 2 条已当场修掉（含一条我自己在修 R4 时引入的崩溃，被接线用例逮住）。

### 完成项

- 复核方式：独立子代理只读复核（不共享我的上下文），对照 design/interfaces.md §宿主 HTTP 路由契约 逐条核对，并真起 node:http 探针验证 HEAD 去体
- 结论：方法矩阵 / 响应头 / 中转表达式逐字一致 / 零业务数据 / 注册面与匹配优先级 / 撤销覆盖与顺序 —— 全部一致，无阻塞缺陷
- R4（已修）：两条路由成组注册，第 2 条失败会把第 1 条回滚（不留无 disposer 的泄漏注册）——抽成 registerLegacyBoardRoutes 并补 3 条单测
- R7（已修）：补真 node:http 集成用例（端口 0）——HEAD → 200 且响应体为空、GET → 200 且体为常量；假 res 证明不了「Node 去体」这条契约
- R2（已记账）：/dashboard/ 是宿主「path 不带尾斜杠」约定的有意例外，已在模块注释写明撤销条件；不改已确认的设计文档（改写已确认产物会作废人工确认），改在验收材料记账
- R5（未做，如实记缺口）：迁移未就绪（degraded）分支未注册兼容入口 → 该降级态下 /dashboard 仍 404；超出已确认设计的覆盖面，留给人工决定是否另立小卡
- R1（运维项）：dist/index.mjs 未重建则运行态仍 404 —— 由 t5 用 pnpm build + curl 取证收口
- R3/R6（口径）：契约「逐字节相同」应读作 handler 产出部分（node 注入 date 除外）；FR-1 单卡交付是「不再 404 但不定位」，端到端定位待 t2/t3 —— 写进验收材料，不整条划勾
- 修 R4 时自己引入过一次崩溃：disposeLegacy 由数组改成函数后，撤销分支仍按数组展开 → TypeError: disposeLegacy is not iterable；被既有接线用例「dispose 清理全部注册」逮住并已修复（该用例现绿）

### 改动文件

- `src/http/legacy-board-route.ts`
- `src/index.ts`
- `tests/legacy-board-route.test.ts`
- `tests/apply-wiring.test.ts`

### 下一步

交测试段：全量 pnpm test 与 npx tsc --noEmit 基线比对。

---
