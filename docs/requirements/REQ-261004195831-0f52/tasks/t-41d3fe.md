# t-41d3fe 实现详情取数模块 req-detail-store 并落地 store 单测

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
实现详情取数模块 req-detail-store 并落地 store 单测

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/req-detail-ondemand.test.ts -t req-detail-store 全绿：首次 ensure 恰 1 次取数；结算前连调三次 ensure 仍只 1 次请求；version/revision 均未变时不重取、任一变化则重取 1 次。

## 实施方案（implementation）
新建 src/client/req-detail-store.ts：ReqDetailEntry 四态（loading/ready/missing/error）+ createReqDetailStore(deps) 暴露 ensure/get/retry/reset，实现同 reqId 在途 Promise 复用、按 summaryVersion/ledgerRevision 失效、响应 reqId 不匹配即丢弃、条目 Map 容量 16；新建 tests/req-detail-ondemand.test.ts 并写入 TC-2/TC-3/TC-4（注入 fetchRequirement 桩，不用 jsdom）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T12:05:50.098Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

这一步做完，详情页有了自己的取数通道：点开需求时按需取全文，同一需求的重复触发只打一个请求，台账或需求版本变了才重取；取不到时明确落成「未找到」或「失败」，不再拿摘要冒充全文。

### 完成项

- 新增详情取数模块（src/client/req-detail-store.ts）：四态条目 loading/ready/missing/error
- 在途去重：同 reqId 只保留 1 个请求（SSE 与轮询撞同一 tick 的安全网）
- 按版本失效：摘要 version 或台账 revision 变化才重取，都不变则复用
- 取数分类：404 落 missing 态并保留服务端原文；其它失败落 error 态并带 message/hint/code
- 迟到响应防护：世代号作废 + 响应 id 不匹配即丢弃，不写回已离开的视图
- 条目容量 16，读命中的条目刷新插入序不被挤掉
- 新增 tests/req-detail-ondemand.test.ts 的 store 分组：TC-2 / TC-3 / TC-4 与 4 条边界
- 实测：npx vitest run tests/req-detail-ondemand.test.ts -t req-detail-store → 9 passed
- 实测：npx tsc --noEmit → 本卡新增两个文件 0 错误（全仓 153，未新增）

### 改动文件

- `src/client/req-detail-store.ts`
- `tests/req-detail-ondemand.test.ts`

### 下一步

t2（t-35fe33）实现三态占位渲染，随后 t4 把 board-mount 接到本模块

---
## 汇报 2（2026-10-04T12:30:01.876Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

这张卡做完，详情页从「点开就崩」变成「进详情按需取全文、取数有去重与失效、取不到有明确出路」：页面不再拿摘要冒充全文，也不再把请求打成风暴。

### 完成项

- 父卡三张子卡（研发/复核/测试）全部 done
- 交付：详情取数模块 + 三态占位 + 详情接线 + 缺字段防御，新增 35 例回归用例
- 自证：新增用例全绿、全量失败数 98 ≤ 基线 106、tsc 149 ≤ 基线 153、bundle 重建 OK
- 独立复核三轮，必修项全部闭合

### 改动文件

- `src/client/req-detail-store.ts`
- `src/client/views/detail-states.ts`
- `tests/req-detail-ondemand.test.ts`

### 下一步

下一张卡 t-35fe33（三态占位渲染），随后 t-48dfcb / t-f075e2 / t-0f476e

---
