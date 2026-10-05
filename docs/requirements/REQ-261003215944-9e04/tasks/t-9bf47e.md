# t-9bf47e 端到端验收与项目文档更新

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
端到端验收与项目文档更新

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
pnpm typecheck && pnpm test && pnpm build && pnpm kb:check 四条退出码均为 0；人工观察到侧栏出现新会话、右侧栏渲染出 README 正文、worker 推阶段被拒；README 工具表包含 reqboard_open_window 与 reqboard_bind（grep 命中）。

## 实施方案（implementation）
按 design/use-cases.md 的 UC-1/UC-2/UC-7 人工走一遍端到端（开窗→侧栏出现新会话→新窗口立项→加 worker 席位→worker 推卡与越权对照→右侧栏打开 README 渲染正文）；跑四条门禁命令并把输出摘要记为验收证据；更新 docs/architecture/project-manual.md（新增「席位模型与开窗」「Dive 状态转化单一入口」两节）、README.md 工具表（加 reqboard_open_window / reqboard_bind）、docs/knowledge/（补「读路径根权威源 = 会话工作区」），最后跑 pnpm kb:check。

## 上游产出摘要（dependsSummary）
- 新增 reqboard_bind 并让 reqboard_status 暴露席位
- 把自主预立项与预拆分不破门写成红线断言
- 把推进弹框与看板继续接到同一方法
- 迁移与兼容：存量零改写与回滚开关

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T05:39:23.247Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

这一步把「东西做完了」变成「接手的人能自己复核」：手册多了两节（席位模型与开窗、Dive 状态转化单一入口），每行都给了能亲手跑的命令；知识层的代码地图重新生成、门禁从红转绿；README 补上开窗与派席两个工具；还改正了设计文档里四处与代码不符的说法（最典型的是「存量 39 条」其实是 52 条）。四条命令里 build 与 kb:check 已退出码 0；typecheck 与 test 仍是仓里既有的红，逐条核过与本次改动无关。另有两条只能人眼确认的事（侧栏是否真的出现新会话、右侧栏是否真的渲染出 README 正文）需要你来看。

### 完成项

- 四条门禁实测（真实退出码）：build 0、kb:check 0（原本 2 处漂移，重新生成知识层后归零）、typecheck 2、test 1
- typecheck 与 test 的失败逐条核过：全部落在本次未触碰的文件上，且都在动手前就是红的
- 修好一条真门禁：apply-wiring 的工具面清单从 18 个对齐到 24 个（含本次的开窗与派席），该文件由红转绿
- 手册新增两节：席位模型与开窗、Dive 状态转化单一入口，每行都带可亲手跑一遍的判据
- 知识层 architecture.md 补两行：文档读根权威源 = 会话工作区、席位授权的三个落点
- README 工具表补 reqboard_open_window 与 reqboard_bind（验收要求的 grep 已命中）
- 设计文档订正四处与代码不符的说法：存量 39→52（实测 15 热 + 37 归档）、joinedAt/lastSeenAt 是 epoch ms、recover-auto 的窄例外、my_seat 的真实键名
- 手册里没写假话：原先想写「dive 直写已收敛到零」，实测是 8 个文件 9 处，改成如实登记并标明待裁定
- 未做（要人眼）：侧栏出现新会话、右侧栏渲染出 README 正文——这两条只能在活宿主里看

### 改动文件

- `README.md`
- `docs/architecture/project-manual.md`
- `docs/knowledge/architecture.md`
- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/INDEX.md`
- `tests/apply-wiring.test.ts`
- `docs/requirements/REQ-261003215944-9e04/design/data-model.md`
- `docs/requirements/REQ-261003215944-9e04/design/interfaces.md`
- `docs/requirements/REQ-261003215944-9e04/design/architecture.md`
- `docs/requirements/REQ-261003215944-9e04/design/test-cases.md`

### 下一步

卡收口。需求随后进验收：交棒用 reqboard_submit(kind=verification)，材料里必须如实写明 typecheck 与 test 两条达不到及其原因。剩下两条只能人眼确认的事，请在活宿主里看一眼。

---
## 汇报 2（2026-10-04T05:39:34.919Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

联调段做的是「证明我写的文档不是在说空话」：把新加两节手册里每一行引用的命令都亲手跑了一遍，12 个文件 123 例全绿；两个 grep 判据也与手册写的一致。剩下两条只能人眼的事，我没有假装看见。

### 完成项

- 手册里写的每一条判据都亲手跑过一遍：12 个测试文件 123 例全绿（不是抄来的命令）
- 两个 grep 判据实测与手册一致：bound[0] 零命中、dive 直写 9 处
- 知识层门禁 kb:check 退出码 0、构建产物校验 OK（build 走的是真产物路径）
- 没能自动化的两条明确交人：侧栏是否真出现新会话、右侧栏是否真渲染出正文

### 下一步

转测试段：把上面的证据按验收标准逐条归档。

---
## 汇报 3（2026-10-04T05:39:41.305Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

测试段把卡的验收标准逐条对账：能自动验的五条都拿到了证据（两条命令退出码 0、README grep 命中、worker 推阶段被拒、worker 推自己的卡通过），四条命令里另两条达不到，原因逐条写清了——不是本次改动造成的，是仓里早就在的红。剩两条只能人眼看的，我没有替你看。

### 完成项

- 验收 A（四条命令退出码）：kb:check 0、build 0 —— 达标；typecheck 2、test 1 —— 未达标，两条都是仓里既有红
- 验收 A 的未达标部分逐条对账：typecheck 2 处错误在 tests/worktree-injection.test.ts（`deps.delivery` 字段不存在），该文件最后修改在昨天 23:55，非本次改动
- 验收 A 的第二条：test 97 例失败散在 47 个文件，与我动手前逐文件相同；本轮唯一新转绿的是 apply-wiring
- 验收 B（README 工具表）：reqboard_open_window 与 reqboard_bind 各命中 1 次
- 验收 C（worker 推阶段被拒）：已由用例证明——worker 拿 SEAT_NOT_OWNER，同一条需求上 owner 推阶段照旧通过（反向断言）
- 验收 D（worker 推自己的卡必须通过）：已由端到端用例证明，卡的状态确实变成 in_progress
- 验收 E（侧栏出现新会话、右侧栏渲染正文）：代码侧证据齐（开窗用例 7 条、读根用例 6 条），**人眼观察待做**

### 下一步

转复核。请顺手在活宿主里看一眼那两条只能人眼确认的事（侧栏新会话 / 右侧栏正文）；确认后本卡收口，需求进验收。

---
## 汇报 4（2026-10-04T05:49:21.562Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核段只做一件事：确认我写进文档的话都是真的。为此把手册里每一行引用的命令都跑了一遍（12 个文件 123 例全绿），并把一处原本会写歪的说法改成如实登记——dive 的直写点其实还有 9 处，没收敛到零。两条只能人眼确认的事，你回了「两条都正常」，我按你的答复落章；红基线也按你的裁定——按现状收、材料里如实登记。

### 完成项

- 复核①手册不自夸：原先想写「dive 直写已收敛到零」，实测 9 处，改成如实登记并标注待裁定
- 复核②手册判据可跑：12 个文件 123 例亲手跑过，没写没验过的命令
- 复核③设计文档订正不夹带：只改与代码不符的事实（39→52、joinedAt 类型、窄例外、键名），不改设计意图
- 人工观察（你答复原文）：两条都正常——侧栏出现了新会话、右侧栏能渲染 README 正文
- 红基线处置（你答复原文）：按现状收，在验收材料里如实登记这两条未达标

### 下一步

本卡收口 → 需求进验收；用 reqboard_submit(kind=verification) 交材料，材料里如实写明 typecheck 与 test 两条未达标及归属。

---
