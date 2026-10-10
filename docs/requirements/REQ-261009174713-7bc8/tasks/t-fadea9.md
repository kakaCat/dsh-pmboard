# t-fadea9 protocol 与 board-summary 拆半·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
protocol 与 board-summary 拆半·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T11:28:25.827Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：拆半口径与设计一致；导出面 223 名逐名等价、common 零 core 说明符、门禁与纯度复跑全过。另报三处需人工认可或收口的点。

### 完成项

- 无偏离依据一：导出面双向差集为空（before 223 名 vs after 223 名），barrel 保住了全部既有 import 点
- 无偏离依据二：common 内 pmboard-core 说明符 0 处；common 内相对 import 全部落在包内，无逃逸
- 无偏离依据三：分层门禁 exit 0、纯庋 3/3、typecheck 0 三项独立复跑与研发读数一致
- 需人工认可一：board-summary 无 common 半——每条声明都依赖域规则，硬拆需给两个私有件加 export 从而扩大公共面，故整份进 core
- 需收口一（进 [2b]/t12）：core 内 16 条指向根 src 的临时相对边，domain 搬迁进 core 后须逐条改为包内相对
- 需收口二（进 t22/t12）：尺寸门禁扫描面仍只有 src/，两半在 packages 下不受 400 行约束，别让扫描面悄悄失效
- 口径说明：卡面「tests/ 全绿」按本仓 C-14 既有失败集口径执行（失败文件 12 个、逐文件与拆半前一致）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/protocol.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/protocol-domain.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/protocol.ts`
- `.worktrees/req-261009174713-7bc8/tests/size-budget.test.ts`

### 下一步

交测试子卡 t-e5f0a0。

---
