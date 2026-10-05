---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 需求说明（REQ-261004174324-4195 知识层自动自举）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。

## TL;DR

- **这是什么**：pm 插件发现当前项目没有知识层（`docs/knowledge/`）时**自己把它生成出来**，同时删掉「知识库」侧栏入口与知识库页。
- **为什么现在做**：现状是本仓自用——读取端通用，生成端只在 pmboard 的 `scripts/`，别的项目点开按钮是空壳，提示还让人去跑一个该项目里不存在的脚本。
- **做完得到什么**：任意项目在插件可用时自动拥有可被 Agent 检索的知识层；人不再看到一个多半是空的「知识库」页。

**档位说明（L3 单向升级）**：立项时按轻档起，需求分析期间出现「要动宿主启动路径 + 生成器需从 CLI 提炼为用例 + 3 个未定决策」三个信号，已按铁律**升级为重档**，本文档按 feature 重档模板落盘。

## 业务流程图

```
插件加载 ──解析项目根──▶ 检测 docs/knowledge/INDEX.md
                             │
                 ┌───────────┴───────────┐
                缺                       在（或本次已自举过）
                 │                        │
                 ▼                        ▼
        生成骨架 + 生成物            零写入（不动你的文件）
        （INDEX/code-map/             │
           design-tokens/TSV）        │
                 │                    │
                 └──────────┬─────────┘
                            ▼
                 Agent 侧：reqboard_kb 可检索 · 节点输入包可注入索引
                 人侧：侧栏「知识库」入口已不存在（本次删除）
```

## 产品定义

**一句话**：把知识层从「人要点开看的页面 + 手动跑的脚本」变成**插件自动保障的基础设施**——项目里没有就生成，人不需要知道它的存在。

**核心价值**：

- 消除"空壳入口"：任何工作区都不再出现一个点开什么都没有、还教你跑不存在的脚本的「知识库」页。
- 消除"采用门槛"：新项目不必先搬脚本、手写三份页面才能用上 Agent 侧的知识检索。
- 保留人的眼睛：知识层本来就不是给人读的页面（条目只在归档时沉淀），删掉视图不损失任何人的能力。

**与现状的区别**：

| 维度 | 现状 | 本次之后 |
|---|---|---|
| 谁生成 | 人手动 `npx tsx scripts/kb-build.mts --write`（脚本只在本仓） | 插件检测到缺层即自动生成 |
| 生成器位置 | `scripts/kb-build.mts`，依赖 `process.cwd()` | 宿主内用例（根参数化），CLI 变薄包装 |
| 人看到什么 | 侧栏「知识库」页（多半是空壳） | 没有这个入口；要看内容直接读 `docs/knowledge/INDEX.md` |
| Agent 拿到什么 | 有层则注入索引 + `reqboard_kb` 可检索 | **签名不变**，只是"有层"变成常态 |

## 用户与角色

| 角色 | 什么场景用 | 痛点（本次解决哪个） |
|---|---|---|
| 使用 pm 插件的项目开发者 | 在任意项目里装好 pm 插件、开一个新窗口让 Agent 干活 | 以前：没有知识层 → Agent 靠全量读代码；点「知识库」是空壳还要被提示跑不存在的脚本 |
| 实施 Agent（新窗口） | 拿到节点输入包要快速建立项目认知 | 以前：索引节可能不存在（`docs/knowledge` 未生成）→ 退化到全量探索 |
| pm 插件维护者 | 改客户端与宿主 | 以前：知识库页/入口/样式/探针/单测要跟着维护，却是"绑定本仓文档的展示门面" |

## 功能点（需求条款）

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 入口下线：删除「知识库」侧栏入口与知识库页（含视图、样式区段、注册、探针与单测），需求看板与其余页面零影响 | P0 |
| FR-2 | 缺层即自举：插件在拿到项目根时检测知识层缺失并自动生成，幂等、一次、不阻塞 | P0 |
| FR-3 | 自举产物定深：INDEX 骨架 + code-map + design-tokens + 两份 TSV；手写页留占位并进 INDEX「待写」 | P0 |
| FR-4 | 生成器通用化：生成逻辑从 `scripts/kb-build.mts` 提炼为宿主用例，根参数化，CLI 变薄包装 | P0 |
| FR-5 | 安全与响亮：非生成区零改动、半写可辨、失败结构化报出、永不静默降级 | P0 |
| FR-6 | 回退开关：`knowledge.autoBootstrap`（默认 true），关掉即回到手动跑脚本的老行为 | P1 |
| FR-7 | 门禁与测试同步：删除面回归 + 自举三态（缺/在/不完整）+ 幂等与不覆盖断言，`kb:check`/`typecheck`/测试基线不劣化 | P0 |

---

### FR-1: 删除「知识库」侧栏入口与知识库页

**功能描述**：删掉侧栏「知识库」入口与它对应的页面，需求看板与其余页面行为逐字节不变。

**详细说明**：

- **使用场景**：任何打开 pm 看板的窗口——侧栏不再出现「知识库」。
- **操作流程**：
  1. 打开 pm 看板 → 侧栏只有看板等原有条目，**没有**「知识库」。
  2. 系统内部：客户端入口不再注册该 page panel；相关样式区段随文件一并移除。
- **预期结果**：
  - 删除面（已核实）：`src/client/views/knowledge.ts`（117 行）、`src/client/page/register-knowledge.ts`（68 行）、`src/client/styles/knowledge.ts`（30 行）、`src/client/index.ts` 的两行注册、`src/client/styles.ts` 的 `KNOWLEDGE_CSS` 引用、`tests/kb-client-page.test.ts`（111 行）、`scripts/knowledge-page-probe.mts`（156 行）。
  - **保留**：`GET /dashboard/api/reqboard/kb` 路由、`reqboard_kb` 工具、`src/domain/knowledge/**`、`src/adapters/KnowledgeRepository.ts`、归档沉淀路径（它们服务 Agent 侧，不是"看板门面"）。
- **边界条件**：
  - 侧栏其余条目（看板、任务、验收等）order 与文案不变。
  - `/kb` 路由保留 → `tests/kb-route.test.ts`、`tests/kb-repository.test.ts` 等继续绿。

**验收标准**（可证伪）：

1. `grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS" src/ scripts/ tests/` → 零命中。
2. `pnpm build:client` → 退出码 0，`[verify-client] OK`（样式归属章在场、CSS 分片完整）。
3. `pnpm vitest run tests/kb-route.test.ts tests/kb-repository.test.ts` → 全绿（Agent 侧未受影响）。
4. 刷新 http://127.0.0.1:19387 侧栏 → 无「知识库」条目。

---

### FR-2: 缺层即自举（启动检测，幂等一次）

**功能描述**：插件拿到项目根时，若 `docs/knowledge/INDEX.md` 不存在，就自动把知识层生成出来；已存在则一个字节都不写。

**详细说明**：

- **使用场景**：在从未有知识层的项目里加载 pm 插件。
- **操作流程**：
  1. 插件解析出 docs 读根（`docsRootSource='session'` 时会话项目根；或 `legacy-cwd` 回落）。
  2. 检测 `<root>/docs/knowledge/INDEX.md` 是否存在。
  3. 不存在 → 生成（FR-3 深度）；存在 → 跳过并记录 `reason=index-exists`。
  4. 同一进程内**同一根只自举一次**（去重），失败不重试、不阻塞宿主启动。
- **预期结果**：
  - 自举后 `<root>/docs/knowledge/` 下出现 INDEX 骨架与全部生成物。
  - Agent 侧随后 `reqboard_kb(list=true)` 能取到条目；`docs/knowledge/INDEX.md` 可被注入索引节。
- **边界条件**：
  - 项目根无法解析 → 记 `reason=root-unknown`，不猜目录、不往插件宿主目录写。
  - 只读文件系统 / 权限失败 → 结构化报出（FR-5），宿主继续启动。
  - `README`/`docs` 目录不存在 → 允许创建 `docs/knowledge/`（自举是"从无到有"）。
  - 关闭 `knowledge.enabled` 时**不自举**（与工具返回空集的口径一致）。

**验收标准**：

1. 空临时目录（`mktemp -d`）跑自举入口 → `INDEX.md`、`code-map.md`、`design-tokens.md`、`code-map.symbols.tsv`、`design-tokens.classes.tsv` 五者齐备。
2. 紧接着再跑一次 → 返回值 `created=[]`，全部文件内容与 mtime 无变化（幂等）。
3. 把 `INDEX.md` 手工改写一行后再跑 → 该行逐字保留（不覆盖）。

---

### FR-3: 自举产物深度（骨架 + 全部可生成物，手写页占位）

**功能描述**：自动生成的东西**零编造**：机器能确定性算出的全生成，需要人写的只留占位并显式进「待写」。

**详细说明**：

- **使用场景**：人/Agent 在自举后的项目里继续补齐知识。
- **操作流程**：
  1. 生成 `docs/knowledge/INDEX.md` 骨架（八节 + 「待写」节，含生成区标记 `<!-- kb:generated:begin/end -->`）。
  2. 生成 `code-map.md` + `code-map.symbols.tsv`（扫 `src/**/*.ts` 导出符号）。
  3. 生成 `design-tokens.md` + `design-tokens.classes.tsv`（扫 `src/client/styles*`）。
  4. `architecture.md` / `conventions.md` / `glossary.md` **不生成正文**：INDEX 里对应节如实写「（暂无）」/「待写」，缺口显式化。
- **预期结果**：
  - 生成的页面都带「本项目无 `src/`（或 `src/client/styles`）时」的诚实说明，而不是产出一个空文件假装有内容。
  - `INDEX.md` 的生成区永远由脚本维护；生成区之外的文字永不被覆盖。
- **边界条件**：
  - 项目没有 `src/` → code-map 页写「未发现源文件」并置空表，退出码不为 1（不算失败）。
  - 项目没有客户端样式 → design-tokens 页同样如实置空。
  - 单页超预算（≤200 行 / INDEX ≤8000 字符）→ 按既有预算规则截断并标注，**不静默裁**。

**验收标准**：

1. 自举后 `pnpm kb:check`（在本仓之外的项目里以生成器自检）→ 生成物零漂移。
2. `wc -l docs/knowledge/*.md` → 各页 ≤200 行、INDEX ≤8000 字符 / ≤200 行。
3. `grep -c "待写" docs/knowledge/INDEX.md` → ≥1（缺口显式化在场）。

---

### FR-4: 生成器通用化（宿主用例 + 根参数化）

**功能描述**：把 `scripts/kb-build.mts` 里的生成逻辑提炼成宿主内可调用的用例，路径由调用方传入，CLI 变成薄包装。

**详细说明**：

- **使用场景**：宿主自举（FR-2）与开发者手动跑脚本（`pnpm kb:build` / `kb:check`）走**同一份实现**。
- **操作流程**：
  1. 生成逻辑落到应用层用例（如 `src/application/use-cases/BootstrapKnowledge.ts`），接受 `root` 与 `mode`（write / check）。
  2. `scripts/kb-build.mts` 改为解析 argv + 传 `root=process.cwd()` + 打印结果。
  3. 宿主在启动路径调用同一用例。
- **预期结果**：
  - 生成规则单点：改一处，两边同时生效（不存在"脚本和宿主各写一份"）。
  - 既有 `pnpm kb:build` / `pnpm kb:check` 输出与退出码语义不变（C-13 门禁照旧）。
- **边界条件**：
  - 零新增运行时依赖（生成器只用 `node:fs`/`node:path`）。
  - 领域层不引入 IO：扫描/渲染保持纯函数可测（沿用现有 `domain/knowledge/**`）。

**验收标准**：

1. `pnpm kb:build` 在本仓跑完 → `git diff --stat docs/knowledge` 为空（确定性、零漂移）。
2. `pnpm kb:check` → 退出码 0。
3. 生成器用例单测：给定 fixture 根 → 产出与 CLI 路径对同一根产出一致（逐字节相等）。

---

### FR-5: 安全与响亮（非生成区零改动）

**功能描述**：自举只做加法；任何失败都必须显式报出，禁止"看起来成功了"。

**详细说明**：

- **使用场景**：已有知识层或已有手写内容的项目被再次自举。
- **操作流程**：
  1. 写入前先算出全部目标内容（先算后写）。
  2. 逐个文件比对：内容相同 → 不写（避免 mtime 抖动）；不同且属生成物 → 写；属手写页 → **不写**。
  3. 失败 → 结构化错误（根、文件、原因、已写/未写清单）。
- **预期结果**：
  - 手写页与 INDEX 非生成区逐字不变。
  - 失败信息能直接定位是哪一步、哪个文件。
- **边界条件**：
  - 部分写入失败（如磁盘满）→ 报出"已写入 N 个、失败于 X"，**不得**报成整体成功。
  - 检测到既有 INDEX 但生成物缺失 → 只补生成物，不重写 INDEX 骨架。

**验收标准**：

1. 对手写 `architecture.md` 与 INDEX 手写行做 diff 断言 → 零差异。
2. 注入只读权限（`chmod 500`）触发失败 → 返回结构化错误且宿主启动不中断。
3. 已存在且内容一致的生成物 → mtime 不变（unlink/rewrite 均判失败）。

---

### FR-6: 回退开关 `knowledge.autoBootstrap`

**功能描述**：配置里给一个开关，关掉后回到"人自己跑脚本"的老行为。

**详细说明**：

- **使用场景**：维护者排查自举引起的问题、不希望插件动文件的项目。
- **操作流程**：`knowledge.autoBootstrap: false` → 启动不检测、不生成。
- **预期结果**：老行为可复现；`knowledge.enabled=false` 优先级更高（整层停用）。
- **边界条件**：配置缺省（不写 `knowledge`）→ 默认 `true`（自举开启，符合本需求目标）；非法值按现有配置校验风格结构化报错。

**验收标准**：

1. 配置 `autoBootstrap:false` 启动 → 目录零变化（含不创建 `docs/knowledge/`）。
2. `knowledge.enabled:false` + `autoBootstrap:true` → 同样零变化。
3. 不写配置 → 自举发生（默认开）。

---

### FR-7: 门禁与测试同步

**功能描述**：删除面与新增面都有回归锁；既有门禁与基线不劣化。

**详细说明**：

- **使用场景**：改完提交前。
- **操作流程**：跑 C-11/C-12/C-13/C-14/C-15 列出的命令。
- **预期结果**：删除面有"不存在"断言（防复活）；自举有幂等/不覆盖/三态断言。
- **边界条件**：删除 `tests/kb-client-page.test.ts` 后，总用例数下降属预期，需在验收材料里如实说明基线变化。

**验收标准**：

1. `pnpm build`（host + client）→ 退出码 0。
2. `pnpm typecheck` → 错误数 ≤ 223（既有基线）。
3. `pnpm test` → 失败数 ≤ 106（既有基线）。
4. 新增自举测试全绿且覆盖：缺 / 在 / 不完整 / 只读失败 四态。

---

## 接口与数据契约

| 项 | 内容 |
|---|---|
| 自举入口（宿主） | 应用层用例：输入 `{ root, mode }`，输出 `{ created: string[], skipped: {path, reason}[], failed?: {...} }`；幂等（同输入不产生第二次写入） |
| 生成器 CLI | `npx tsx scripts/kb-build.mts --write\|--check`——参数与退出码语义**保持不变**（C-13 门禁依赖它） |
| 配置新增 | `knowledge.autoBootstrap?: boolean`，默认 `true`；`knowledge.enabled` 优先级更高 |
| 路径契约 | 一切路径相对**传入的项目根**，不再读 `process.cwd()`；`docs/knowledge/**` 常量沿用 `KB_PATHS` / `KB_PAGE_PATHS` |
| Agent 侧契约 | `reqboard_kb` 工具签名与 `GET /dashboard/api/reqboard/kb` 响应**零变化** |
| 客户端契约 | 「知识库」page panel 从注册表消失（`pmboard-knowledge` 不再注册） |

## 迁移与回滚

- **已启用知识层的项目**：零写入，行为与现状逐字节一致。
- **未见过的项目**：首次启动长出一层，属新增文件，不回滚也不丢数据。
- **回滚路径**：① 配置 `knowledge.autoBootstrap:false`（回到手动跑脚本）；② revert 提交（恢复入口与页面）。
- **数据迁移**：无（知识库页是无状态只读视图，删除不需要迁移）。

## 边界（不做什么）

- **不做 UI 一键生成按钮/入口**：用户明确否掉「一键长出知识层」这个交互——它应由插件静默保障，而不是又一个人要点的按钮。
- **不自动编造 `architecture.md` / `conventions.md` / `glossary.md` 正文**：这些要靠人（或 Agent 读码后）写；机器只留占位并进「待写」，避免把推断当事实。
- **不改 `reqboard_kb` 工具与 `/kb` 路由**：Agent 侧读取能力是本次保留项，签名零变化。
- **不动 pm 需求看板与流水线**：只删知识库页，看板/任务/验收等页面与流程不碰（用户已确认）。
- **不在每次启动重写既有生成物**：防漂移交给 `pnpm kb:check` 门禁，不靠启动时改写（避免"悄悄改了你的文件"）。

## 非功能需求

- **启动开销**：空项目（无知识层）自举耗时在秒级内；已有知识层项目只做一次 `existsSync`，不做扫描（P95 < 50ms，用 `console.time` 或单测计时断言测）。
- **不阻塞**：自举失败不得阻断插件加载与工具注册（人工验证：只读根启动后工具仍可用）。
- **确定性**：同一输入两次生成的产物逐字节相同（`pnpm kb:build` 后 `git diff` 为空）。
- **兼容**：`docsRootSource='legacy-cwd'` 与 `'session'` 两种读根下自举都作用于**该读根**，不跨根写。

## 验收标准（整体）

1. 拿一个从未有知识层的空项目（`mktemp -d`），装上插件启动 → `docs/knowledge/` 出现 INDEX 骨架 + code-map + design-tokens + 两份 TSV。
2. 再次启动同一项目 → 文件零变化（幂等），日志/返回值给出 `skipped=index-exists`。
3. 人为在 INDEX 手写区加一行、写一份 `architecture.md` → 再启动，两处逐字保留。
4. 打开 pm 看板 → 侧栏无「知识库」；`grep -rn "pmboard-knowledge" src/ scripts/ tests/` 零命中。
5. 在会话里问 Agent 项目架构 → `reqboard_kb` 能取到条目（自举后的层被检索到）。
6. `pnpm build` / `pnpm typecheck` / `pnpm test` / `pnpm kb:check` → 全部达到上文 FR-7 的阈值。

## 依赖与约束

- **强依赖**：知识层既有实现（`src/domain/knowledge/**`、`src/adapters/KnowledgeRepository.ts`、`KB_PATHS` 常量）——本次不重写规则，只搬生成入口。
- **强依赖**：宿主启动路径与 docs 读根解析（`src/index.ts`、`docsRootSource` 设置）——自举挂在这里。
- **弱依赖**：客户端构建门禁（`scripts/verify-client-build.mjs`）——删除样式区段后必须仍过（C-05 归属章、C-12 分片完整）。
- **约束**：零新增运行时依赖；生成器只用 Node 内置模块。
- **约束**：本仓自身就是知识层启用项目——本次改动后本仓 `pnpm kb:check` 必须仍退出码 0（自举不得污染既有层）。
- **约束**：删除面必须与"Agent 侧能力"分开——`/kb` 路由、`reqboard_kb`、归档沉淀一律保留。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |
| FR-6 | 🔴 **未被接收** | — |
| FR-7 | 🔴 **未被接收** | — |

> 🔴 **未被接收（7 条）**：FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7

<!-- reqboard:marks:end -->
