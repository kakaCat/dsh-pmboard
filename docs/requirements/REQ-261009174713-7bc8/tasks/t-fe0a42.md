# t-fe0a42 斜杠命令面 command-pmboard

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
斜杠命令面 command-pmboard

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run packages/command-pmboard/tests 全绿（注册/重复降级/无服务降级/文法表/创建/已绑定 ≥7 例）；宿主命令表含 pm；pnpm build 后加载 dist 不抛

## 实施方案（implementation）
新增该包四文件（惰性注入 commands，注册失败留痕不抛；文法与回执文案按 design/interfaces.md 逐字实现）；根包 index.ts 调 applyCommandSurface(ctx, deps)；tsdown external 增 @deepseek-ai/dsh-commands。

## 上游产出摘要（dependsSummary）
- core 包落位与 import 重写

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-09T15:25:59.442Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t18 一期完成：四个模块按设计逐字落地（文法表 / 七条回执文案 / 复用 core 用例的执行体 / 注册与降级），新增 15 例全绿；分层门禁 0、typecheck 0、全量无新增失败。根包接线待下一步。

### 完成项

- parse.ts：文法表逐条实现（空/空白→show；名称→create；>120 码点→invalid；`--flag` 不认旗标按名称处理），按**码点**计数（非 ASCII 边界）
- render.ts：设计「回执契约」七条文案逐字落地；board_link 取用例回执字段，拿不到只省略链接段（不造假链接）
- command.ts：复用 core 的 executeCreateRequirement 与 queryState，exec={agent} 与 19 工具同一实现；**不复写**绑定判据/文档落点；错误码→文案映射（WINDOW_BOUND 时再查一次取真 ID；非预期异常记日志转 error 回执）
- index.ts：applyCommandSurface 惰性取 commands 服务；无服务或 register 抛错（重复注册）一律降级不抛、返回 undefined
- tests/command.test.ts 15 例（文法表 7 + 文案 5 + 注册/降级 3）——超过卡面「≥7 例」要求
- 读数：分层门禁 exit 0、typecheck 0、全量 7268 例（+15）失败 20（唯一新增项 settings-init 是全程反复飘的既有抖动项）
- 勘明两点：① 设计提到的模板 command-goal/ 在本仓不存在，四个文件按设计自身规格写（规格足够完整）；② 类型入口按设计「只引 types/brand」——CommandInvocation 在主入口、CommandDefinitionId 在 /brand、Context 来自 @deepseek-ai/cordis（已按门禁要求显式声明该依赖）
- 待下一步：根包 src/index.ts 调 applyCommandSurface(ctx, deps)（需先定位 useCaseDeps 的作用域）；随后可复核「宿主命令表含 pm」与 pnpm build 后加载 dist

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/parse.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/render.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/command.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/index.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/tests/command.test.ts`

### 下一步

根包接线：在 src/index.ts 的 apply 内定位 useCaseDeps 并调用 applyCommandSurface(ctx, useCaseDeps)；随后复核宿主命令表含 pm，并跑 pnpm build 后加载 dist 不抛。

---
## 汇报 2（2026-10-09T15:29:15.406Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t18 接线完成：根包 apply 内以同一个 useCaseDeps 调 applyCommandSurface；门禁 0、typecheck 0、命令面 15/15、全量无新增实质失败。卡面验收一已过，验收二（宿主命令表）由注册路径 + 用例覆盖，验收三（dist 加载）待构建步骤。

### 完成项

- 根包接线：src/index.ts 在 useCaseDeps 构造后调用 applyCommandSurface(ctx, useCaseDeps)——与工具面**共用同一个 deps 实例**（判据单点在 core，命令面不自行装配端口）
- 根包依赖：command-pmboard 已在根包 package.json 声明（无需补）
- 验收一：npx vitest run packages/command-pmboard/tests → 1 文件 15 例全绿（卡面要求 ≥7 例）
- 读数：node scripts/package-boundary-check.mts exit 0；npx tsc --noEmit 错误 0；全量 7268 例（+15）失败 20（唯一新增项 header-progress-e2e 与上轮的 settings-init 交替出现，均为既有抖动）
- 验收二（宿主命令表含 pm）：注册路径已接线（根包 apply → applyCommandSurface → commands.register({name:'pm'})），并由用例对 name/definitionId/input 三字段逐项断言；真机宿主表检查需加载插件，属 t22 的宿主 smoke 面
- 验收三（pnpm build 后加载 dist 不抛）：未跑——它属构建步骤，留待下一轮或 t22；本卡代码面与该步骤无耦合（命令面不新增构建入口）
- 形态提醒：本卡 role=legacy、子卡链未展开（代码先写后登记）；后续窗口若要走三阶段链，先 task_move(in_progress) 生成子卡链再逐段汇报

### 改动文件

- `.worktrees/req-261009174713-7bc8/src/index.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/index.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/command.ts`

### 下一步

下一轮：①（可选）跑 pnpm build 并加载 dist 复核验收三；② 本卡可进复核/关闭（先开子卡链）；③ 之后顺手做 t17（client 包，verify-client 已两次绿灯）。

---
## 汇报 3（2026-10-09T15:30:07.968Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t18 验收三复核结论：pnpm build 在 worktree 内 exit 0（dist/index.mjs 527120 字节 + lib/client.cjs + verify-client OK），但「加载 dist 不抛」不成立——dist 对 workspace 包**保持外部依赖**且说明符是 `.js`，而盘上只有 `.ts`，plain node 无法映射（与 t16 烟测同一根因，属布局/设计层问题，非命令面缺陷）。

### 完成项

- 验收三第一步（构建）：pnpm build exit 0——dist/index.mjs 527120 字节 + dist/index.d.mts；lib/client.cjs 764.30 kB（gzip 210.82）；wrapped dsh-pmboard -> lib/client.js 665475 字节；[verify-client] OK（关键符号齐全、样式归属章在场、CSS 分片完整）
- 验收三第二步（加载）失败，取证到位：报错为 Cannot find module '<worktree>/node_modules/pmboard-core/src/application/query/index.js'，而磁盘上该目录只有 index.ts（无 index.js）⇒ 运行期说明符 .js 无法映射到 .ts 源
- 根因归位：dist 对 workspace 包保持**外部依赖**（未打进来），而 plain node 不做 .js→.ts 映射 ⇒ 该验收只有在「各子包有各自构建产物」或「dist 把子包打进来」时才能成立 —— 属布局/设计层问题，与命令面代码无关（与 t16 烟测同一根因）
- 命令面本身可复核的部分全绿：npx vitest run packages/command-pmboard/tests 15/15；分层门禁 exit 0；tsc 0；全量 7268 例失败 20（无实质新增）
- 顺带产出（t17 强信号）：worktree 内构建链完整可用——tsdown 产出 dist、client wrap 与 [verify-client] 全 OK；t17 搬迁后只要把构建入口指到 packages/pmboard-client，该 verify 应当照旧通过
- 建议：把「加载 dist 不抛」的口径改为「在具备子包构建产物（或 dist 打入子包）的环境下加载」；当前布局下这条不可达，写进 t22 的宿主 smoke 面一并定口径

### 改动文件

- `.worktrees/req-261009174713-7bc8/src/index.ts`
- `.worktrees/req-261009174713-7bc8/packages/command-pmboard/src/index.ts`

### 下一步

t18 代码面与接线已收口（三条验收：一过、二由用例覆盖、三需改口径）；下一轮可先开子卡链走三阶段并关闭本卡，或直接转 t17（构建链已证明可用）。

---
