# t-ba11c3 接线降级启动分叉并双通道留痕

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接线降级启动分叉并双通道留痕

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/degraded-startup.test.ts 全绿；用例在「有单册无 meta.json」夹具下调用分叉逻辑断言不抛错、ctx.inject 只被以 ['webServer'] 调用一次（且从未以 ['tools'] 或 ['systemPrompt'] 调用）、logger.error 实参含 'REQBOARD_REQUIRES_MIGRATION' 且含 hint、captureDiag 写入行含同一 code 与 hint 且不含换行；另一用例注入非迁移门失败断言 enterNotReadyMode 未被调用且异常照旧抛出；grep src/index.ts 断言 'REQBOARD_REQUIRES_MIGRATION' 出现次数为 0（分叉只按 preflight.ok 判定，不散落错误码字面量）。

## 实施方案（implementation）
新建 src/wiring/not-ready.ts：导出 enterNotReadyMode(ctx, failure, logger)，内部先 logger.error('reqboard 未就绪（HTTP 全端点 503）：' + detail) 与 captureDiag('reqboard-capture [NOT-READY]: ' + detail 单行化)，再走 (ctx as any).inject?.(['webServer'], ...) + webCtx.effect?.(...) 注册 { kind:'prefix', path:'/dashboard/api/reqboard', handler: createNotReadyHandler(failure) }（前缀字面量与 index.ts 正常分支逐字一致；本函数不触碰数据根）。改 src/index.ts：把 assertLedgerMigrated(...) 一行换成 const preflight = preflightLedger({...}); if (!preflight.ok) { enterNotReadyMode(ctx, preflight.failure, logger); return }，位置保持在 initCaptureDiag 与 'apply function STARTED' 留痕之后、new ShardedRequirementStore 之前；正常分支起自 new ShardedRequirementStore 且逐字节不变。在 tests/reqboard/degraded-startup.test.ts 追加启动分叉与留痕段（假 ctx 捕获 inject 调用与假 logger）。

## 上游产出摘要（dependsSummary）
- 新增未就绪 HTTP handler

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T12:23:29.841Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

t4 完成：三相启动分叉接线落地，命中迁移门即注册降级路由并正常返回；双通道留痕且零副作用。

### 完成项

- 新增 src/wiring/not-ready.ts：enterNotReadyMode 注册降级路由 + 双通道留痕
- index.ts 由裸断言改为 preflightLedger 分叉，命中即 return（不抛，保 fiber 存活）
- 分叉在构造 ShardedRequirementStore 之前 ⇒ 降级路径不建任何存储
- 只注入 webServer 一次，不注入 tools / systemPrompt，不注册任何工具
- 诊断行单行化（hint 自带换行，压平防日志停在半句话）
- 探针与诊断各自 try/catch，绝不反向制造故障
- 静态断言：index.ts 不出现迁移门错误码字面量，边界未被放宽

### 改动文件

- `src/wiring/not-ready.ts`
- `src/index.ts`
- `tests/reqboard/degraded-startup.test.ts`

### 下一步

t5 客户端错误体透出

---
