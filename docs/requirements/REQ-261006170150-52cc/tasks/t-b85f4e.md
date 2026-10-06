# t-b85f4e 等待位契约：清位回调与 notify 开关

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
等待位契约：清位回调与 notify 开关

## 解决什么问题
确认弹框被解答之后，「等待结束」这件事只写在台账里，没有任何人被告知——于是流水线接不上，
用户点完确认就只能看着窗口不动。本卡先把「等待结束」变成一次可用的通知口（谁来接由后面的卡决定）。

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/awaiting-clear-notice.test.ts 退出码 0：真清位回调恰 1 次、notify:false 为 0 次、台账本非 awaiting 为 0 次、回调抛错不外溢且返回 cleared:true；② npx vitest run tests/layer-boundary.test.ts 全绿（未新增越层 import）

## 实施方案（implementation）
改 src/application/internal/awaiting-confirm.ts：加 AwaitingConfirmDeps.onCleared、ExitAwaitingInput.notify、返回 {cleared,notified}；清位成功处回调（try/catch + logger.warn，永不抛）。改 src/application/ports.ts：加 UseCaseDeps.notifyDrivable? 与 WakeHeartbeatDeps.notifyDrivable?，注释写明组合根接 round 半。新建 tests/awaiting-clear-notice.test.ts（TC-1、TC-2）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:22:59.024Z，窗口 session-3518e4f8-9582-4ee6-99d5-80077ac2b305）

落地等待位契约：清位成功即回调，并把「谁被通知」做成注入端口。exitAwaitingConfirm 现在回 {cleared,notified}，只有台账真的把 awaiting-confirm 清成 healthy 才回调一次；调用方可用 notify:false 抑制（确认收敛点用），既有调用方可继续忽略返回值。

### 完成项

- awaiting-confirm.ts 新增 AwaitingConfirmDeps.onCleared 与 ExitAwaitingInput.notify
- exitAwaitingConfirm 返回 {cleared,notified}（回调包 try/catch，抛错只 warn 不回滚）
- ports.ts 新增 UseCaseDeps.notifyDrivable 端口（注释写明组合根接 round 半）
- 新建 tests/awaiting-clear-notice.test.ts：TC-1 四例 + TC-2 一例，5/5 绿
- dialog-inflight-stop 的 TC-9 断言随契约更新（幂等与零写入意图不变）

### 改动文件

- `src/application/internal/awaiting-confirm.ts`
- `src/application/ports.ts`
- `tests/awaiting-clear-notice.test.ts`
- `tests/dialog-inflight-stop.test.ts`

### 下一步

下一张 ready 卡：t-74c612（在途登记分档过期）。本轮读数为：新用例 19/19 绿（与 dialog-inflight-stop 合跑）；layer-boundary 3 项红是基线既有（.dsh-data/baseline-cases.txt 已登记），非本次引入。实际改 4 个文件（比 footprint 声明的 3 多一个既有测试断言更新），偏差已如实登记。

---
## 汇报 2（2026-10-06T09:28:50.882Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

等待位契约收口：「等待结束」现在既写台账也发通知（可抑制），复核补上心跳侧端口；两条 acceptance 达标，子卡链全绿。

### 完成项

- 契约落地：AwaitingConfirmDeps.onCleared、ExitAwaitingInput.notify、exitAwaitingConfirm 返回 {cleared,notified}
- 清位成功才回调恰一次；notify:false 抑制；回调抛错只 warn 且不回滚清位
- 两个驱动端口齐备：UseCaseDeps.notifyDrivable 与 WakeHeartbeatDeps.notifyDrivable（后者本轮复核补落）
- 用例：tests/awaiting-clear-notice.test.ts 的 TC-1×4 + TC-2 = 5/5 绿
- acceptance ①：npx vitest run tests/awaiting-clear-notice.test.ts 退出码 0
- acceptance ②：layer-boundary 3 项红全属权威基线登记项，未新增越层 import
- 相关回归：dialog-inflight-stop 14/14、ask-confirm-pending 13/13、wake 系 21/21 全绿
- 全量对账：失败 66 条 ≤ 基线 68 条；npx tsc --noEmit 错误 0 条
- 子卡链 4 张全 done（研发 / 联调 / 复核 / 测试）

### 改动文件

- `src/application/internal/awaiting-confirm.ts`
- `src/application/ports.ts`
- `src/application/dive/wake-heartbeat.ts`
- `tests/awaiting-clear-notice.test.ts`
- `tests/dialog-inflight-stop.test.ts`

### 下一步

下一张 ready 卡 t-74c612（在途登记分档过期）；t-cc3cee（驱动放弃留痕）亦可并行

---
