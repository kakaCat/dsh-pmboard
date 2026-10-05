# t-bfd9bb 节流拒绝文案可执行化

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
节流拒绝文案可执行化

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

npx vitest run tests/done-throttle-message.test.ts → 全绿。**含一条实测口径**：连续两次 agent 关闭同需求任务卡（间隔 <60s）→ 记录实际结果——若被拒，message 必须含「剩余 N 秒」与合规路径；**若未被拒**（本需求 15:5x 实测两次连关均成功），则本卡的交付物改为「把节流真正触发条件写成可查规则 + 在教学文案里说明何时才会命中」，并在卡内写明实测证据。另：npx tsx scripts/kb-probe.mts 退出码 0（不因新增文案破坏既有检查）。

## 实施方案（implementation）
support.ts 节流分支用剩余毫秒生成 message，含「剩余 N 秒」与合规路径（等待 / 由自动链关闭 / 单张推进）。

## 上游产出摘要（dependsSummary）
- 定门规纯函数与状态契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T08:58:01.067Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

这一步做完，什么变了：撞上"关闭太快"的限制时，不再是干等——回执直接告诉你还要等多少秒、是哪张卡挡的、以及三条合规走法；实测也纠正了"子卡也会被节流"这个错误假设。

### 完成项

- 拒绝文案含「还需等待约 N 秒」+ 点名阻挡卡 + 三条合规路径
- doneThrottleRemainingMs 纯函数（零 I/O）供文案引用
- 实测修正：节流只挡非子卡；卡面验收标准已按实测改写

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `src/application/internal/support.ts`
- `tests/done-throttle-message.test.ts`
- `tests/domain/done-evidence.test.ts`

---
