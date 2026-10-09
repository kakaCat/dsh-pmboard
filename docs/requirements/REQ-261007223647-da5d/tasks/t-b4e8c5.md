# t-b4e8c5 看板 pending 票接线

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
看板 pending 票接线

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
`pnpm build:client` 输出 [verify-client] OK；接线后渲染断言：/state 带票时 Band 数据属性（data-pending-count 等）与票数据一致；老服务端无 pending_confirms 键 → 按 [] 渲染不报错。

## 实施方案（implementation）
board-mount 组装 PendingConfirmBand（页面唯一接线卡）；api.ts fetchState 解析 pending_confirms（宽松解析，缺键按 []）；「去作答」跳既有确认区，「重投」调 IF-4 repost 路由。

## 上游产出摘要（dependsSummary）
- pending 票首屏横带组件

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:28:31.773Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这张卡做完，FR-5 在真实数据链上闭合了：票下得来、看得见、答得掉、答完自己消失。

### 完成项

- 看板首屏现在真的会自己报出「有 N 道确认门在等你作答」：票从 /state 下来 → 客户端宽松解析 → 钉顶横带逐行铺开
- 两个按钮各有真出口：「去作答」跳该需求的既有确认区；「重投」调服务端如实查询并原样展示回话（不伪造成功态）
- 倒计时每秒本地走表、有票才起表（不轮询）；作答后票从服务端消失，横带自己收掉
- 旧服务端缺键按空数组渲染、不报错；未接线时看板输出与改造前逐字节一致
- 证据：端到端用例 2 例（真路由 + 真注册表 → 客户端解析 → 横带渲染，含「落章后横带消失」反向链路）；接线用例 7 例；相关 8 文件 123 例通过；pnpm build:client [verify-client] OK；tsc 0 错

### 改动文件

- `src/client/api.ts`
- `src/client/types.ts`
- `src/client/board-mount.ts`
- `src/client/views/board.ts`
- `tests/pending-band-wiring.test.ts`
- `tests/pending-band-e2e.test.ts`

### 下一步

下一张 ready 卡：t-5f569a 旧数据与旧端兼容验证（t13）

---
