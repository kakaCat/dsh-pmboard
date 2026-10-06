# t-a5d71d 确认收敛点：带 ref 清位先于推进 + 补发条件·联调

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
确认收敛点：带 ref 清位先于推进 + 补发条件·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T10:40:24.611Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

接口面复核：三条确认通道都经同一收敛点，ref 缺失即旧行为；补发只走 round 半既有注入口。

### 完成项

- 三通道同一收敛点：AskConfirm（同步与挂起后台续跑共用 submitted）与 gate-prompt 都透传 ref
- 向后兼容：dialogRef 是可选字段；缺省路径逐字保留旧 void 清位（有专门用例锁住）
- 准入纪律：补发走 deps.notifyDrivable（组合根接 round 半），未新增进会话的投递路径
- 冷门路径核对：plan-in-decomposing 门合并块不受影响（补发只在结束时判一次）
- 接口形状：ConfirmSubmitted.dialogRef? 与 ConfirmDecision.dialogRef? 两端形状一致
- 顺带发现（不代改，已登记）：tests/application/harness.ts 的 summarize 未定义、ShardedRequirementStore 的 boardSummaryOfAuthoritative 未定义，属别窗口并发 WIP

### 下一步

复核段：逐条对照设计与不变量

---
