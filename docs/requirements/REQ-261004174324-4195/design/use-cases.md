---
serves: FR-1, FR-2, FR-3, FR-5, FR-6, FR-7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 设计 · 用例（REQ-261004174324-4195 知识层自动自举）

> 每个用例写：触发者 / 前置 / 主流程 / 异常与边界 / 可观测结果。用例编号 `UC-n` 供拆分与测试引用。

## UC-1 空项目首次启动：知识层自动长出 `serves: FR-2, FR-3`

- **触发者**：pm 插件（无人类操作）。
- **前置**：项目根已确定（激活时的 cwd，或会话 cwd，或看板请求带的 `?session=`）；`docs/knowledge/INDEX.md` **不存在**。
- **主流程**：
  1. 通知点调 `ensure(root)`；协调器查表未命中 → 起一次用例。
  2. 用例判 `INDEX.md` 缺失 → 渲染五份产物（先算后写）。
  3. 逐文件比对后写入；`created` 收齐写入路径。
  4. 记入去重表（成功），返回 `status:'created'`。
- **异常与边界**：
  - 根无法确定 → `skipped('root-unknown')`，不写任何目录（**不落插件宿主目录**）。
  - 无 `src/` → code-map 页写「未发现源文件」，仍算 `created`。
  - 无 `src/client/styles*` → design-tokens 页置空并说明，仍算 `created`。
  - 写盘失败 → `failed` + `failedPath` + `error`；宿主启动**不中断**、记 `logger.warn`。
- **可观测结果**：`docs/knowledge/` 下 5 个产物出现；随后 `reqboard_kb(list=true)` 能取到索引行。

## UC-2 已有知识层的项目启动：零写入 `serves: FR-2, FR-5`

- **触发者**：pm 插件。
- **前置**：`INDEX.md` 已存在（如本仓自身）。
- **主流程**：用例判存在 → **不读源码、不算渲染**，直接返回 `skipped('index-exists')`。
- **异常与边界**：生成物缺失但 INDEX 在（半残状态）→ 只补生成物、**不重写 INDEX 骨架**（骨架属手写区锚点，重写会碰手写行）。
- **可观测结果**：所有文件内容与 `mtimeMs` 不变；`pnpm kb:check` 仍退出码 0。

## UC-3 人写过的内容被保护 `serves: FR-3, FR-5`

- **触发者**：人/Agent 先写了 `architecture.md` 或在 INDEX 手写区加了一行，随后插件再次启动。
- **前置**：手写页存在或 INDEX 手写行非空。
- **主流程**：写前逐文件比对 → 手写页不属目标集 → 永不写入；INDEX 只替换生成区两节。
- **异常与边界**：INDEX 生成区标记被人删掉 → `failed('markers-missing')` 且**零写入**（不猜、不重建，避免覆盖手写内容）。
- **可观测结果**：手写页与手写行 diff 为空；错误信息明确指出标记缺失。

## UC-4 只读或不可写根：响亮失败但不挡启动 `serves: FR-5`

- **触发者**：pm 插件（在一个只读挂载或权限不足的项目里启动）。
- **前置**：根可解析，但目录不可写。
- **主流程**：用例进入 → 检测缺层 → 尝试写入 → 捕获错误 → 组织 `failed` 结果（含已完成写入清单）→ 通知点只记日志。
- **异常与边界**：
  - 部分已写成功 → `created` 如实列出，"已写 N 个、失败于 X"，**不得**报整体成功。
  - 根在生成过程中被别的会话改掉 → 中止并 `failed('root-drifted')`，两个根都不留半成品。
- **可观测结果**：宿主日志出现结构化失败对象；插件其余功能（工具注册、看板）照常。

## UC-5 维护者关掉自举 `serves: FR-6`

- **触发者**：维护者改配置。
- **前置**：配置里 `knowledge.autoBootstrap:false`（或 `knowledge.enabled:false`）。
- **主流程**：装配期解析设置 → 开关为关 → 通知点直接不调用用例（或用例立即 `skipped('disabled')`）。
- **异常与边界**：`autoBootstrap` 写成非布尔（如 `"no"`）→ **装配期抛错**，不静默当默认；`enabled:false` 时工具返回空集（与既有停用口径一致）。
- **可观测结果**：启动前后目录零变化；手动 `pnpm kb:build` 仍可用（老路径保留）。

## UC-6 人想读知识层内容：不再走 UI `serves: FR-1`

- **触发者**：人（想看看项目沉淀了什么）。
- **前置**：知识层存在。
- **主流程**：直接打开 `docs/knowledge/INDEX.md`（或用编辑器/资源协议打开指针指向的文件）。
- **异常与边界**：侧栏**没有**「知识库」入口——本次删除后不得留残影（`grep pmboard-knowledge` 零命中）。
- **可观测结果**：看板侧栏只剩原有条目；看板/需求流水线功能与删除前一致。

## UC-7 Agent 建立项目认知 `serves: FR-2, FR-4`

- **触发者**：新窗口的 Agent（拿到节点输入包）。
- **前置**：项目此前无知识层，本次会话已触发自举。
- **主流程**：节点输入包注入「项目知识索引」节（≤ `injectBudgetChars`）→ Agent 需要细节时调 `reqboard_kb(id/kind/query)` 取。
- **异常与边界**：索引刚生成、架构/规范/术语仍是「待写」→ Agent 只能拿到骨架，**本需求不承诺**冷启动就能答架构问题（诚实缺口，见 test-cases 的未覆盖声明）。
- **可观测结果**：注入节出现且**签名与预算语义不变**；`reqboard_kb(list=true)` 返回条目而非空集。

## UC-8 CLI 与宿主同源 `serves: FR-4`

- **触发者**：开发者手动跑 `pnpm kb:build` / `pnpm kb:check`。
- **前置**：仓库内。
- **主流程**：脚本解析 argv → 构造 `FileDocRepository({ workspaceRoot: --root ?? cwd })` → 调同一用例（write/check）→ 按既有格式打印、给退出码。
- **异常与边界**：`--check` 有漂移 → 打印首个差异行号 + 期望/实际两行，退出码 1；`--backfill` 行为不变（留在脚本内）。
- **可观测结果**：`pnpm kb:check` 退出码 0（本仓）；CLI 与直接调用用例对同一根产物逐字节相等。
