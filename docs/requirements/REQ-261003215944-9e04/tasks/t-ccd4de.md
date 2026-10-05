# t-ccd4de 跨窗口投递自署 kind 并修冷会话断点

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
跨窗口投递自署 kind 并修冷会话断点

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
集成测：对一个已冷却的会话席位投递 → resume 成功、目标会话起一个回合、该 user/message 事件的 source.kind === 'reqboard-open-window'（不含 'user'）；grep -rn "sessionController.prompt" src/ 零命中；pnpm test 全绿。

## 实施方案（implementation）
改 src/adapters/AgentDeliverer.ts：投递前用 sessionController.resolveAgent(windowKey) 支持冷会话 resume（现状 src/adapters/AgentDeliverer.ts:81-83 用 agents.get() 对冷会话返回 undefined，只会说'窗口不在线'），消息用自署 source.kind（如 'reqboard-open-window'）经 agent.followup 投递，并在投递后 sessions.flush。禁止使用 sessionController.prompt（它把消息标成 kind:'user'，见 packages/api/session-controller/src/commands.ts:331-336）。配方照 packages/schedule/schedule/src/runtime.ts:101-123。

## 上游产出摘要（dependsSummary）
- 新增 reqboard_open_window 并走 DSH 会话 fork

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T15:17:53.121Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

这一步做完，投递不再只会说「窗口不在线」：冷会话会先被叫醒再投，投完还确认落盘；而且消息一律自署来源（这条消息是「开窗流程」说的，不是人说的）——那条会把消息冒充成人类发言的入口，全仓静态扫描为零。开窗工具也随之能带一段底稿过去了。

### 完成项

- 新增跨窗口投递端口 CrossWindowDeliveryPort（异步，因冷会话 resume 必然异步）与 UseCaseDeps.crossWindowDeliver 可选位；缺省 = 不投并如实说明
- AgentDeliverer 实现该端口：① 热路径仍走 agents.get（行为逐字不变）→ ② 冷路径走 sessionController.resolveAgent → followup → sessions.flush 确认；任何失败收口成 {delivered:false, reason}，永不抛
- 新增自署消息工厂 createMessage({text,kind})：与 Dive 回合消息同款形状，只有 source.kind 不同（永不为 user）
- 接线：pm-capture-root 的 CaptureRuntimeDeps 增 getSessionController / flushSession（可选，存量调用方零改动）；组合根按调用时解析 sessionController 与 sessions.flush
- reqboard_open_window 增可选 seed_text：开窗后投自署底稿（kind=reqboard-open-window），投递失败**不影响开窗成功**但如实回报 delivery 结果
- 新增 tests/cross-window-delivery.test.ts 六例：冷会话 resume 投递+落盘确认、自署 kind 不为 user、无 resume 能力/失败形状/flush=false 三种诚实降级、热窗口优先不 resume、以及红线静态扫描（全仓 src 零 prompt 入口）

### 改动文件

- `src/application/ports.ts`
- `src/adapters/AgentDeliverer.ts`
- `src/wiring/pm-capture-root.ts`
- `src/application/use-cases/OpenWindow.ts`
- `src/tools/OpenWindowTool/OpenWindowTool.ts`
- `src/index.ts`
- `tests/cross-window-delivery.test.ts`

### 下一步

联调段：本次要额外查一件事——本工作树里有**另一个窗口在并发编辑**（见下一段汇报），联调结论必须把这条环境事实显式排除掉才算数。

---
## 汇报 2（2026-10-03T15:18:06.402Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

联调这一段除了验本卡的投递链路，还查清了一次「疑似回归」：第一次全量跑确实多了一个失败文件与一个类型错误，但单独复跑就消失、类型错误也回到基线——真相是**另一个窗口正在同一棵工作树上改文件**（support/AdvanceChain/rtm-yaml 等，都不是我碰的）。这也顺带把本需求的主题演了一遍：多窗口共享一棵树就是会互相踩。

### 完成项

- 联调①（本卡自身）：热/冷两条路径都用真实适配器实例跑通；冷路径 resume → followup → flush 三步齐全
- 联调②（环境事实，必须显式排除）：本工作树里有**另一个窗口在并发编辑**——src/application/internal/support.ts、rtm-yaml.ts、use-cases/AdvanceChain.ts、ReportTask.ts 等在最近 6 分钟内被改动，而我一个都没碰
- 证据：全量跑第一次出现 1 个新失败文件（header-progress-e2e）与 1 个新类型错误（AdvanceChain 找不到 assertWritableRequirementProject），但单独复跑该测试 2/2 通过、tsc 回到 149——说明那是对方编辑的**瞬时中间态**，不是我的回归
- 复跑确认：全量失败集合与失败数（46 文件 / 98 例）与本卡开工前逐字相同；类型错误 149 = 基线；通过数 +6（本卡新用例）
- 结论：本卡零回归成立，但**基线可信度依赖对方不再同时改写**；若并发继续，后续 A/B 需在 worktree 里做才可靠

### 下一步

测试段取证；另建议（重要）：本需求正是讲多窗口协作的，而我们现在就在共享工作树上互相干扰——建议后续卡切到 git worktree 隔离（节点纪律里本就有这条）。

---
## 汇报 3（2026-10-03T15:18:43.799Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

测试段把三条验收跑到：冷会话投递链路、红线 grep 零命中、类型错误零新增、全量失败集合与开工前一模一样。唯一如实标注的是「真起一个回合」这一条进程内证不到（只能证到调用了起回合的入口），留给端到端那次真机验证。

### 完成项

- 验收 1（冷会话投递）：tests/cross-window-delivery.test.ts + 开窗用例共 13 例全绿——冷会话 resume→followup→flush 三步、自署 kind 不为 user、三种诚实降级、热窗口优先不 resume
- 验收 2（红线 grep）：grep -rn sessionController.prompt src/ = 0 命中（并且这条已写成静态用例，注释里出现也会被抓）
- 验收 3（类型检查）：149 = 基线（零新增）。注：中途一次读到 152，是并发窗口编辑中途的瞬时快照，复测回到 149
- 验收 4（全量回归）：98 失败 / 3501 通过，失败文件 46 个且集合与开工前逐字相同（通过数 +6 = 本卡新用例）
- 诚实标注一处**未能真机验证**的点：卡面写「目标会话起一个回合」——进程内只能证到 followup 被调用（那正是起回合的入口），真起回合需要活宿主，留到 t14 端到端或你点一次 reqboard_open_window(seed_text=…) 时验

### 下一步

复核段：复查适配器结构与「热路径零行为变化」这一条是否真的成立。

---
## 汇报 4（2026-10-03T15:18:56.069Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核确认这条新能力是「加在旁边的」而不是「改在中间的」：老的同步投递一行未动，冷会话那条新路自己永不抛（八处失败都收口），而且「这条消息是谁说的」是消息工厂强制写进去的，调用方想漏写都漏不了。兼容性也守住了：新字段全可选，既有夹具一行没改。

### 完成项

- 复核①热路径零行为变化：deliverMessage 一行未动（仍是同步的 agents.get → followup，失败文案逐字不变）；新能力单列在 async deliver() 里，因冷会话 resume 必然异步——不把既有同步调用点拽成异步
- 复核②永不抛：新增的 deliver() 内有 8 处失败收口（服务不可得 / 解析抛错 / resume 抛错 / 失败形状 / 无 followup / 投递抛错 / flush 抛错 / flush 未确认），全部返回结构化结果
- 复核③自署来源是**构造出来的**而非调用方传的：createMessage 强制把 kind 写进 source，调用方无法漏写；reqboard_open_window 只用固定常量 reqboard-open-window
- 复核④兼容：CaptureRuntimeDeps 两个新字段可选、UseCaseDeps.crossWindowDeliver 可选 → 既有调用方与测试夹具零改动（全量失败集合未变可佐证）
- 复核⑤留一处诚实边界：本卡只能证到「调用了 followup（起回合的入口）」，真起回合未在进程内验证——已在测试段与汇报里明说

---
