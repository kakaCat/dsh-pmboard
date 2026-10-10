# t-d98edc workflow 包与端口契约·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
workflow 包与端口契约·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T15:33:10.511Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：实现无偏离（依赖方向、端口归属、行为面均核过），但**我上一段汇报给出的依据是错的**——真正的 core 内消费者是 ExecuteTask.ts，不是 AdvanceChain；更正后依据更强。

### 完成项

- ❗更正：上一段汇报称「三个端口类型被 core 自己的 AdvanceChain 消费」——**这是错的**（我把先前对**适配器**的 grep 结果误当成对**端口类型**的结果）。实测：core 内真正的消费者是 packages/pmboard-core/src/application/use-cases/ExecuteTask.ts（恰 1 个文件）
- 更正后的口径依据（更强）：core 的**用例** ExecuteTask 需要这三个类型 ⇒ 它们必须留在 core；若按设计字面「拆到 workflow 包、core 侧 re-export」，就形成 core → workflow，既违反分层白名单（core 只许 common/rtm/type-kit）又与 workflow → core 成环 ⇒ 该验收行不可达，本卡按分层表执行（workflow 反向 import core 的类型）
- 依赖方向实测：core 内出现 pmboard-workflow 说明符 **0 处**；workflow 包的包名说明符只有 pmboard-core/application/ports.js（正是设计「workflow 对 core 只剩可选的类型引用」）
- 端口定义仍在 core：grep -c 'export interface Workflow' ports.ts = 3（三个类型齐全）
- 行为面复跑：tests/workflow-script-contract 与 advance-engine-precheck 与 unit/workflow-schema-adapter 共 3 文件 32 例全绿
- 门禁：node scripts/package-boundary-check.mts exit 0
- 遗留口径（非本卡缺陷）：烟测脚本需可解析 workspace 包的环境；嵌套 worktree 下 tsx 解析受阻，与 t18 的 dist 加载同根因，一并留 t22

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-workflow/src/WorkflowEngineRunner.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application/use-cases/ExecuteTask.ts`

### 下一步

交测试子卡 t-5afc7e。

---
