# t-fd4f31 把自主预立项与预拆分不破门写成红线断言

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把自主预立项与预拆分不破门写成红线断言

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
跑 pnpm test -- tests/gate-not-stretched.test.ts 全绿：两条断言各覆盖正反两分支（无人回合拒 / 有人回合过）；git diff 显示 requireDirectHuman 与 planApproved 两处实现零改动（可用 git diff --stat 佐证）。

## 实施方案（implementation）
在 tests/ 新增两条反向断言（不禁止也不放宽任何人工门，只把红线钉死）：① 在 fork 出的新窗口里以无 source.kind==='user' 的回合调 reqboard_capture → 必须 REQBOARD_DIRECT_HUMAN_REQUIRED（requireDirectHuman 见 src/adapters/SessionProbeAdapter.ts:115-141，本卡不改它一行）；② 计划已提交但未批准时调 reqboard_decompose → 必须 REQBOARD_PLAN_NOT_APPROVED（src/application/use-cases/Decompose.ts:96）。另在 OpenWindow 的底稿文本里写清「文书由 agent 备、拍板归人」。

## 上游产出摘要（dependsSummary）
- 跨窗口投递自署 kind 并修冷会话断点
- 让本窗口能接第二个项目

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T04:28:32.966Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

这一步是给这次改造装**防滑栏**：本需求名字里带着「agent 自主立项、自主拆分」，但只要手一松，「自主」就会从「agent 把文书备好」滑成「agent 替人拍板」。现在 CI 里跑着两组正反断言——没有真实人工回合时立项仍被拒、计划没盖章时拆分仍被拒；而人真的参与时两道门都放行（证明不是"反正都拒"的假断言）。

### 完成项

- 新增 tests/gate-not-stretched.test.ts 四例，把两条红线写成 CI 里会跑的断言（每条都带**反向**断言，免得退化成"反正都拒"）
- ① G0 立项门：用真实 SessionProbeAdapter 造"活的顶层 agent 但本回合无 user 消息"→ reqboard_capture 仍以 REQBOARD_DIRECT_HUMAN_REQUIRED 拒绝；反向：本回合确有人工消息 → 放行
- ② G3 计划批准门：拆分阶段 + 有方案但无 approvedAt → reqboard_decompose 仍以 REQBOARD_PLAN_NOT_APPROVED 拒绝；反向：approvedAt 有人盖章 → 不再以该码拒绝
- 过程中两处踩点已写成注释留给后人：探针的活体判定是**对象同一性**（exec 里必须传同一个 agent 对象，否则会跑偏成 DRIVER_REQUIRED）；Dive armed 时会先撞 REQBOARD_DIVE_ARMED 那道守卫，验计划门需先取人已解锁形态
- 零回归：本卡只新增测试文件；全量失败集合与上一张卡逐字相同（45 文件 / 97 例），通过数 +4

### 改动文件

- `tests/gate-not-stretched.test.ts`

### 下一步

联调/测试段合并取证（本卡只加断言、不改生产代码）：四条断言全绿 + 全量零回归。

---
## 汇报 2（2026-10-04T04:28:56.479Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

联调与测试合并取证：两条红线断言正反四个分支全绿；并且证明「这两道门的实现一行没动」——本卡改动的文件只有那个测试文件。另如实标注一处环境事实：Decompose.ts 也被改过，但不是本卡改的（并发窗口），而我的断言在它改动之后依然通过。

### 完成项

- 联调+测试合并取证（本卡只新增断言、不改生产代码）：两条断言各覆盖正反两分支，四例全绿
- ① G0：无人工回合 → REQBOARD_DIRECT_HUMAN_REQUIRED；有 → 放行。② G3：未批准 → REQBOARD_PLAN_NOT_APPROVED；已批准 → 不再以该码拒绝
- 「两处实现零改动」的取证：本卡改动的文件只有 tests/gate-not-stretched.test.ts（新增）；SessionProbeAdapter 的 DIRECT_HUMAN_REQUIRED 两处仍在、Decompose 仍调 planApproved 判定
- ⚠️ 环境如实标注：git status 显示 Decompose.ts 也被改动，但**不是我改的**（本卡未碰它），是并发窗口所为；我的断言在它改动之后依然通过
- 零回归：全量失败集合与上一张卡逐字相同（45 文件 / 97 例），通过数 +4（本卡新用例）

### 改动文件

- `tests/gate-not-stretched.test.ts`

### 下一步

复核段：确认两条断言不会随实现漂移而静默失效（反向断言的作用）。

---
## 汇报 3（2026-10-04T04:29:13.000Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核确认这道防滑栏是真的有牙：关键是每条断言都配了反向分支——否则实现哪天坏了（所有人都被拒），断言反而全绿。断言打在真实实现上（真实探针、真实拆分入口），而这两道门的代码一行没动。另留了两条踩点注释，省得后人验门时重踩。

### 完成项

- 复核①反向断言是这道门的价值所在：只有"该拒时拒"会退化成假绿（实现崩了也全拒），故每条都配"该过时过"——G0 配有人工回合、G3 配已盖章计划
- 复核②断言打在真实实现上：G0 用真实 SessionProbeAdapter（不是桩），G3 走真实 executeDecompose 入口；两处判据（DIRECT_HUMAN_REQUIRED 两处、planApproved 判定）都在原位
- 复核③未放宽任何门：本卡改动的文件只有那一个测试文件；reqboard_capture 的 requireDirectHuman 与 reqboard_decompose 的 planApproved 调用一行未动
- 复核④留下两个踩点注释（探针活体判定是对象同一性、Dive armed 会先拦拆分），让后人验这两道门时不必重踩
- 复核⑤已知边界：断言只覆盖"判定与拒绝码"，不覆盖"弹框是否真的弹过"（那属人工观察）；已在测试里用"需求数未增加"作近似佐证

---
