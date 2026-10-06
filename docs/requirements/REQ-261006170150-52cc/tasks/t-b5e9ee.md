# t-b5e9ee 端到端回归锁：确认后无需人敲字即起轮

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
端到端回归锁：确认后无需人敲字即起轮

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① npx vitest run tests/wake-after-confirm.test.ts 2 例全绿（不需要注入任何用户消息）；② 反向验证有记录：把 confirm-settle 的清位改回旧的 void 无 ref 调用后该文件必红（输出摘要留档，随后还原）；③ npx vitest run tests/dive-wake-e2e.test.ts 全绿

## 实施方案（implementation）
新建 tests/wake-after-confirm.test.ts，照 tests/dive-wake-e2e.test.ts 的边界替换法真装配（createCaptureRuntime + createDiveRoundDriver，假台账/假 agent 句柄）：驱动 UC-1（后台弹框超宽限后作答）与 UC-3（否定作答），观测量 = inbox 收到 source.kind='dive' 的回合消息。反向验证：把 src/application/internal/confirm-settle.ts 的清位改回旧的 void 无 ref 调用，记录该文件变红后还原。

## 上游产出摘要（dependsSummary）
- 确认收敛点：带 ref 清位先于推进 + 补发条件
- 组合根与心跳装配：清位即驱动、过期即恢复

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:48:46.026Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

端到端回归锁上了：真装配下确认后不注入任何用户消息即起轮；并补齐两条确认通道的清位驱动接线（反向验证证明两者都承重）。

### 完成项

- 新建 tests/wake-after-confirm.test.ts：真装配（真投递器 + 真驱动 + 真在途登记表 + 事件桥替身）
- TC-11：弹框在途 → 人晚答（带 ref）→ 停手位清 + status 变 + inbox 收到 1 条 dive 回合
- TC-12：否定作答 → 不落章不推进，但照样起 1 轮
- 发现并补齐真实缺口：AskConfirm 与 gate-prompt 的清位出口未接 onCleared（否定作答后链停着）
- 反向验证两次均命中并留档：拿掉收敛点清位 ⇒ TC-11 红；拿掉通道接线 ⇒ TC-12 红
- acceptance ①：tests/wake-after-confirm.test.ts → 2/2 绿（退出码 0，不注入任何用户消息）
- acceptance ②：evidence/wake-after-confirm-reverse.md（两次变红原始输出 + 还原核对）
- acceptance ③：tests/dive-wake-e2e.test.ts → 5/5 绿
- 子卡链 3 张全 done（研发 / 复核 / 测试）
- 偏差如实登记：全量失败 72 > 基线 68，7 个失败文件均不引用本需求模块（本卡新增失败 0）

### 改动文件

- `tests/wake-after-confirm.test.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/dive/gate-prompt.ts`
- `docs/requirements/REQ-261006170150-52cc/evidence/wake-after-confirm-reverse.md`

### 下一步

t-44966a（契约文档与排查手册收口）→ t-02409e（实施自评与偏离登记）

---
