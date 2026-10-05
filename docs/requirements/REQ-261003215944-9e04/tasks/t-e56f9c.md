# t-e56f9c 让本窗口能接第二个项目

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让本窗口能接第二个项目

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
集成测：已绑定在飞需求时调 reqboard_capture({onWindowBound:'second'}) 返回 success:true 且新需求 sourceSessionId == 本窗口；onWindowBound:'handoff' 时返回新 windowKey 且新需求落在新窗口名下；grep -rn "REQBOARD_WINDOW_BOUND" src/ 仅命中显式拒绝分支；pnpm test 全绿。

## 实施方案（implementation）
改 src/application/use-cases/CaptureRequirement.ts:121-124 的 REQBOARD_WINDOW_BOUND 分支：reqboard_capture 新增入参 onWindowBound: 'second'|'handoff'（缺省 second），second = 本窗口作为第二条需求 owner；handoff = 先调 OpenWindow 再在新窗口立项，原窗口留指针。同步改 src/tools/CaptureTool/ 的 schema 与 src/application/internal/support.ts 的写入端折叠逻辑（support.ts:611）。

## 上游产出摘要（dependsSummary）
- 定义席位数据契约与读端折算
- 新增 reqboard_open_window 并走 DSH 会话 fork

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T04:19:52.582Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

这一步做完，一个窗口被一条需求占住就再也做不了第二件事的局面结束了：现在可以选「我自己再接一个」，或者「开个新窗口，这个项目归它」。两条分支的回执都如实说明走了哪条，handoff 时还会把新窗口码给出来；开窗能力缺失时是明确拒绝，不会偷偷退回成"那就第二个吧"。

### 完成项

- CaptureRequirement 增 onWindowBound/on_window_bound（两个名字都认，工具走 snake_case）：已绑定时按分支走——second（缺省）本窗口接第二个项目、handoff 先开新窗口并把需求记在**它**名下
- 写入端 createRequirementDirect 增 ownerSessionId（归属窗口覆盖）与 allowWindowBound（显式放行）——守卫保留但只认调用方的显式决定，不猜不静默放行
- 回执如实区分两条分支：bound_policy + handoff 时带 window_key，文案写明「已交给新窗口 {wk} 当 owner」
- CaptureTool 暴露 on_window_bound（enum）并声明两个新回执字段；输出契约静态扫描通过
- 发现并更新一条**把旧行为钉住的既有用例**（capture-tool：窗口已绑定 → 拒绝）：FR-4 明确把这里从一律拒绝改为显式选择，故按新语义拆成三条（缺省=second 成功 / handoff 无能力时如实拒绝 / 不白弹框的初衷仍由 reqboard_create 守卫守住），并在用例里写明依据
- 新增 tests/capture-window-bound-policy.test.ts 五例：second 归属本窗口且本窗口出现两条在飞、handoff 归属新窗口且回执含 window_key、缺省=second、非法值与无开窗能力各自结构化拒绝、未绑定时老行为不变

### 改动文件

- `src/application/use-cases/CaptureRequirement.ts`
- `src/application/internal/support.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `tests/capture-window-bound-policy.test.ts`
- `tests/capture-tool.test.ts`

### 下一步

联调段：在真实台账路径上验两条分支（以及既有用例的更新是否只影响那条被需求改掉的行为）。

---
## 汇报 2（2026-10-04T04:20:01.380Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

联调这一段除了验两条分支真写入台账，还查清一件要紧事：既有用例里有一条把「窗口已绑定就拒绝」钉死的断言，本卡按需求改成可选择后它必然变红——我把它按新语义拆开并写明依据，同时确认「不白弹一次框」这条初衷仍由另一条守卫守着，没有被我顺手拆掉。

### 完成项

- 联调①（真实写入路径）：两条分支都走完整链路（弹框作答 → 建档 → 推进 brainstorming），不是只验分支判断；用例断言到台账里的 sourceSessionId 实际归属
- 联调②（老行为被钉住的发现与处置）：既有用例 capture-tool「窗口已绑定 → 拒绝」因本卡按新语义变红——这是**需求明确要改的行为**（FR-4 从一律拒绝改为显式选择），故按新语义拆成三条并写明依据；不是为让它变绿而改测试
- 联调③（我不动的东西没被动）：reqboard_create 那条「不白弹框」守卫仍在（grep REQBOARD_WINDOW_BOUND 现在只命中 support.ts 的显式拒绝分支与它的注释），G0 的 requireDirectHuman 一行未改
- 联调④（基线漂移归因）：全量与开工前的差异（apply-wiring 4→5 例、execute-task 由红转绿、plan-mode 变化）经核对全部来自并发窗口，与本次改动无关；capture-tool 的新红已由本卡修好

### 下一步

测试段：按卡四条验收取证。

---
## 汇报 3（2026-10-04T04:20:22.375Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

测试段把四条验收跑到：接第二个项目时新需求确实归本窗口、交给新窗口时确实归新窗口（并给出窗口码）、那条拒绝码现在只剩真正该拒绝的那一处（reqboard_create 的守卫）、非法值和开窗失败都是明确拒绝不会偷偷降级。类型与我相关的文件零错误；全量的差异已核对全部来自并发窗口。

### 完成项

- 验收 1（second）：已绑定在飞需求时调 capture（缺省/显式 second）→ success:true，新需求 sourceSessionId == 本窗口，且本窗口下出现两条在飞需求
- 验收 2（handoff）：回执带 window_key = 新窗口码，且新需求 sourceSessionId == **新窗口**（不在本窗口名下）；文案明确「已交给新窗口 {wk} 当 owner」
- 验收 3（grep）：REQBOARD_WINDOW_BOUND 现在只命中 support.ts 的显式拒绝分支（含其注释），CaptureRequirement 侧已无该拒绝
- 验收 4（边界与不降级）：非法 on_window_bound → REQBOARD_INVALID_INPUT；handoff 但开窗能力缺失或开窗失败 → REQBOARD_OPEN_WINDOW_UNAVAILABLE 并提示改用 second（不静默降级）；未绑定时两条分支都不改变老行为
- 用例：本卡新增 5 例 + 更新的既有 capture-tool 用例，两文件 22 例全绿
- 类型与本卡相关文件零错误；全量 97 失败/45 失败文件，与开工基线（98/46）的差异经核对全部来自并发窗口（它修好了 execute-task、给 apply-wiring 加了用例、动了 plan-mode），本卡未新增失败

### 下一步

复核段：复核「拒绝改为选择」是否越过了人工门红线（G0 是否仍不可绕过）。

---
## 汇报 4（2026-10-04T04:26:26.752Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核重点是确认这次「从拒绝改成可选」没有顺手动到人工门：立项资格那道检查（必须由人来拍板）仍在最前面、在任何分支之前——本卡改的只是「这个窗口能不能再接一个」，不是「谁有资格立项」。另外 handoff 失败时是明确拒绝并指路，不会让用户误以为已经交给新窗口了。

### 完成项

- 复核①人工门红线未被动：requireDirectHuman（G0）仍在函数最前面（第 110 行），**在任何分支之前**——「拒绝改为选择」只改了"绑不绑"，没碰"谁能立项"
- 复核②两条分支都在 G0 与 live-driver 校验之后：second 只是跳过"一窗口一需求"的限制，handoff 只是多开一个窗口；都不构成新的立项资格
- 复核③不静默降级：handoff 在开窗能力缺失/开窗失败时明确拒绝并指路 second，不会悄悄按 second 处理（否则用户以为交给了新窗口、实际还压在原窗口）
- 复核④写入端守卫仍在且只认显式决定：allowWindowBound 默认 false ⇒ reqboard_create 等老路径行为不变（守卫与其注释都还在 support.ts 里）
- 复核⑤范围克制：未顺手做席位/投递能力（那属 t2/t5），也未改 lead 文案以外的东西

---
