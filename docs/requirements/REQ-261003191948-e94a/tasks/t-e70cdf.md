# t-e70cdf 客户端数据层透出服务端错误体

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
客户端数据层透出服务端错误体

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/api-client.test.ts 全绿；用例一 mockFetchOnce(503, {success:false, error:'检测到 legacy 单册但数据根尚未迁移', code:'REQBOARD_REQUIRES_MIGRATION', hint:'node --import tsx/esm scripts/migrate-ledger-v10.ts --apply'}) 后断言 rejects 抛出的 ApiError.message 等于服务端 error（显式断言 !== 'HTTP 503'）、code 与 hint 逐字相等；用例二 mockFetchOnce(503) 空体断言 message === 'HTTP 503' 且 hint === undefined。

## 实施方案（implementation）
改 src/client/api.ts：ApiError 构造签名增第三可选参数 hint（readonly hint?: string），message 与 code 语义不变；unwrap 的 !res.ok 分支改为先 await res.json().catch(() => undefined)，body.error 为非空字符串时用它作 message、否则回落 'HTTP ' + res.status（不制造假原因），并把 body.code 与 body.hint 原样传入 ApiError；fetchReqFile 里同样的 !res.ok 分支按同口径处理。改 tests/api-client.test.ts：沿用既有 mockFetchOnce 追加两条用例。

## 上游产出摘要（dependsSummary）
- 抽出唯一信封模块并新增迁移门 503 映射

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T12:23:33.448Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

t5 完成：客户端不再丢弃非 2xx 响应体，原因、错误码与可复制命令原样带上来。

### 完成项

- api.ts 新增 errorOf：非 2xx 先解析错误体再抛
- ApiError 增第三可选参数 hint，既有两参调用全兼容
- unwrap 与 fetchReqFile 同口径，两条丢体路径都堵上
- 服务端没给 error 时退回 HTTP 状态码，不替它编原因
- 用例含错误体透出、空体、非 JSON 体共 5 条

### 改动文件

- `src/client/api.ts`
- `tests/api-client.test.ts`

### 下一步

t6 看板命令块渲染

---
