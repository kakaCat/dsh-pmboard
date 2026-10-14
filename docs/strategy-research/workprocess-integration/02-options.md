# 候选路径：把 dsh-workprocess 收进 dsh-pmboard（待人裁定）

> 本文件是**候选与判据**，事实在 [`01-facts.md`](./01-facts.md)；**唯一推荐与先决条件**见本文「推荐与先决条件」章（wt:options:2 写、wt:options:3 装配出待人裁定节）。
> 写作口径：改动清单给**具体路径 + 新增/修改/删除**；装载形态给**几条 insert 行 + 写在谁的 `cordis.patch.yml`**；
> 验证判据给**命令 + 期望读数**。事实引用写成 `docs/strategy-research/workprocess-integration/01-facts.md:<行>`（本仓根相对）。
> 本文件不含实施动作。

## 候选路径（3 条：A / B / C）

### A：四包原样收进本仓 `workprocess/*`，由单一 `dsh-pmboard` 装载，pm 组合根内联调用

**一句话**：把 `WP`（`WP` = `/Users/mac/Documents/ai/dsh/dsh-workprocess`）的四个包整体搬进本仓 `workprocess/`（目录名与层级照抄），
由 `pm/` 一个插件包声明依赖并内联进 `pm/dist/index.mjs`，宿主侧只列 `dsh-pmboard` 一个 bundle，领域/驱动/工具/命令四面一次带上。

#### ① 文件级改动清单

| 动作 | 路径 | 说明 |
|---|---|---|
| 新增 | `workprocess/workprocess/` | 从 `WP/workprocess/` 整体搬入：`src`（13 个 .ts）+ `client`（2 个 .tsx）+ `tests`（7 个 `*.spec.ts`）+ `tsconfig*.json` + `tsdown*.ts` + `cordis.patch.yml` |
| 新增 | `workprocess/workprocess-round-driver/` | 从 `WP/workprocess-round-driver/` 搬入（`src` 4 + `tests` 4 + 名单同形） |
| 新增 | `workprocess/tool-workprocess/` | 从 `WP/tool-workprocess/` 搬入（`src` 5 + `tests` 5） |
| 新增 | `workprocess/command-workprocess/` | 从 `WP/command-workprocess/` 搬入（`src` 1 + `tests` 1；**包名 `dsh-command-workprocess` ≠ 目录名**） |
| 修改 | `pm/package.json` | `dependencies` 增四包，值用 `workspace:*`（同仓后可用）；`files` 不必加（四包被内联进 `dist`） |
| 修改 | `pm/tsdown.config.mjs` | `WORKSPACE_PACKAGES` 增 `/^workprocess/`、`/^workprocess-round-driver/`、`/^tool-workprocess/`、`/^dsh-command-workprocess/`（现状一条不匹配） |
| 修改 | `pm/cordis.patch.yml` | 装载形态见 ② |
| 修改 | `tsconfig.json`、`vitest.base.mts`、`vitest.config.ts` | 补命令包 `dsh-command-workprocess`（现状只预置三包，命令包零预置） |
| 修改 | `scripts/package-boundary-check.mts` | `pm-core` 的 L1 allow 增 `workprocess`；L2 的 pkgs 增命令包（现状 L2 只有另两个） |
| 删除 | `pm-workflow/`、`goal/*` | 工作树已删（事实见 `docs/strategy-research/workprocess-integration/01-facts.md:214` 起）；A 只做收尾，不复活 |

#### ② 宿主装载形态（三条子形态，二选一）

| 子形态 | insert 行 | 客户端半 | 说明 |
|---|---|---|---|
| **A1 五条行** | `pm/cordis.patch.yml` 给 **5 行**：`pmboard` + 四个包各一行 | 由 `workprocess` 那条 entry 带来（`dsh.client.platform: web`） | profile 只列 `dsh-pmboard` 一个 bundle；四个包名由 `dsh-pmboard` 的依赖图被解析（宿主"运行期解析表 = 安装范围 BFS，含 peerDependencies"，见 `docs/architecture/dsh-plugin-loading-rules.md:39`） |
| **A2 一条行 + 纯内联** | `pm/cordis.patch.yml` 只留 `pmboard`（**1 行**）；四包在 `pm/src/index.ts` 内 `import` 并 `apply` | ❌ **没有**：客户端半的扫描源是 host Loader 的 entry（`docs/architecture/dsh-plugin-loading-rules.md:51`）⇒ 没有 insert 行就没有浏览器半 | 若选 A2，必须把 workprocess 的浏览器半改挂到 `dsh-pmboard` 的 `dsh.client` 下（新工作，改客户端构建） |
| **A3 混合** | `pmboard` + `workprocess` 两行（其余三包纯内联） | ✅ 由 `workprocess` 那条 entry 带来 | 只在需要浏览器半时保留那一条行 |

#### ③ 代价与风险

- **双仓分叉（最高）**：搬入即复制，`WP` 仓后续提交不会自动进本仓；要么声明 `WP` 仓退役、要么定期同步。
- **版本面要人工对齐**：四包 peer 是 `@deepseek-ai/cordis ~4.0.4`、`zod ^4.4.3`，运行依赖 `@deepseek-ai/dsh-storage-domain@0.2.0-rc.2`；而 `pm/package.json` 侧的宿主包是 `@deepseek-ai/dsh-tools 0.2.0-rc.1`——同一 profile 里两套 rc 版本并存。
- **浏览器里两份客户端半**：`workprocess` 的 `lib/client.js`（模块 id = 包名）与 `dsh-pmboard` 的 client 半同时在模块表内；样式归属按装载 id 分开（`data-plugin=<装载 id>`），需确认 UI 不互相覆盖。
- **装载哲学改写**：pm 从"单包单 patch"变成"单包 5 行"（现状两套形态的对照见 `docs/strategy-research/workprocess-integration/01-facts.md:139`、`docs/strategy-research/workprocess-integration/01-facts.md:167`）；`pm/cordis.patch.yml` 的身份从"pm 自己的装载行"变成"pm 全家桶的装载清单"。
- **改动面最大**：四个包 + 五份配置 + 边界清单一次动完；好处是**形态最干净**（profile 一行、包内自洽、`workspace:*` 全部成立，`docs/strategy-research/workprocess-integration/01-facts.md:130-133` 的"必须同处一个 workspace 根"这条硬约束自然满足）。

#### ④ 可跑验证判据

| 判据 | 命令 | 期望读数 |
|---|---|---|
| 包目录与分层清单齐 | `pnpm install && pnpm boundary:check` | 退出码 0（不再有"清单里声明了却找不到包目录"那 6 条，见 `docs/strategy-research/workprocess-integration/01-facts.md:187`） |
| 类型面收敛 | `pnpm typecheck` | workprocess 相关 error = 0（goal 家族的红属 ⑤ 的收尾项） |
| 产物自包含 | `pnpm --filter dsh-pmboard build`，随后 `grep -c "workprocess" pm/dist/index.mjs` 与 `grep -c "from \"workprocess\"" pm/dist/index.mjs` | 内联命中 > 0；**裸说明符残留 = 0** |
| 真机装载 | profile 只列 `dsh-pmboard` 后重启宿主 | 六个 `*_workstage` / `*_worktask` 工具仍在（本会话工具面即可验），浏览器侧栏无 `missed the module table` |
| KB 门 | 在可解析状态跑 `pnpm kb:check` | 退出码 0、14 项全过（读数口径见 `docs/strategy-research/workprocess-integration/01-facts.md:376`） |

#### ⑤ 三件实测缺口的落法

- **`workprocess/` 源码从哪来**：搬进本仓（`WP` 四包 → `workprocess/*`，目录名层级照抄）——这正是"目录不存在"那条缺口的正解（`docs/strategy-research/workprocess-integration/01-facts.md:164`）。
- **命令包与客户端半**：命令包照收，并补 `tsconfig.json` / `vitest.base.mts` / `vitest.config.ts` 三处映射（现状零预置，`docs/strategy-research/workprocess-integration/01-facts.md:158`）；客户端半随 `workprocess` 包一起搬，装载形态须按 ② 选一条能带上它的（A1 或 A3）。
- **`goal/*` 与 `pm-workflow`**：删除即最终态（人的口径见 `docs/strategy-research/workprocess-integration/01-facts.md:404`），收尾两件：① 17 个仍 `import pm-goal*` 的文件（`docs/strategy-research/workprocess-integration/01-facts.md:255` 起）改接 workprocess 服务面或摘除；② 配置面旧名三组映射与 boundary 的 `pm-goal` 行一起摘（`docs/strategy-research/workprocess-integration/01-facts.md:267` 起、`docs/strategy-research/workprocess-integration/01-facts.md:277`）。

**事实锚点**：`docs/strategy-research/workprocess-integration/01-facts.md:48`、`docs/strategy-research/workprocess-integration/01-facts.md:107`、`docs/strategy-research/workprocess-integration/01-facts.md:130-133`、`docs/strategy-research/workprocess-integration/01-facts.md:164`、`docs/strategy-research/workprocess-integration/01-facts.md:171`、`docs/strategy-research/workprocess-integration/01-facts.md:292`。

### B：四包**仍独立装载**，只把内核接进 pm-core / pm 组合根（"核心调用"不改装载）

**一句话**：包不动、仓不动；profile 仍是"`dsh-pmboard` + 四包"五条 bundle 行，pm 侧只新增对 workprocess 的**消费面**（首选服务面 `ctx.workprocess`）。

#### ① 文件级改动清单

| 动作 | 路径 | 说明 |
|---|---|---|
| 修改 | `pnpm-workspace.yaml` | 去掉 `workprocess/*`（本仓不再收这四个包；glob 指不到仓外目录） |
| 修改 | `tsconfig.json`、`vitest.base.mts`、`vitest.config.ts` | 去掉 workprocess 三组路径映射/别名/include；改由 Node 解析（或改指 `../dsh-workprocess/...` 相对路径） |
| 修改 | `scripts/package-boundary-check.mts` | 去掉 L1 `workprocess` 行与 L2 两个包；**新增机制**：把"仓外 `link:` 依赖"排除在"清单必须有包目录"的判据外（否则这 6 条红永不消，`docs/strategy-research/workprocess-integration/01-facts.md:187`） |
| 修改 | `pm/package.json` | 若 pm 要 import 内核：增 `workprocess` 等为 `link:/Users/mac/Documents/ai/dsh/dsh-workprocess/<pkg>`（**不能** `workspace:*`，跨仓）；`link:` 只在本机可解析，**发布形态不可用** |
| 修改 | `pm/src/index.ts`、新增 `pm/src/adapters/workprocess-*.ts` | 接 `ctx.workprocess` 服务面（B1）或内联 import 内核实现（B2） |
| 修改 | `pm/tsdown.config.mjs` | 仅 B2 需要：内联四包 |
| 删除 | `pm-workflow/`、`goal/*` | 同 A |

#### ② 宿主装载形态

| 子形态 | insert 行 | 说明 |
|---|---|---|
| **B1 服务面消费**（唯一可用子形态） | profile 五条行不变（`dsh-pmboard` + 四行由各包自带 patch 提供，现状见 `docs/strategy-research/workprocess-integration/01-facts.md:292`） | pm 只读 `ctx.workprocess` 服务与 `work/changed` 事件，**不 import 实现** ⇒ 进程内只有一份内核 |
| **B2 内联实现** | 同上 | pm 组合根 `import 'workprocess'` 并打进 `pm/dist` ⇒ 进程内**两份内核**（一份在本仓 dist、一份由 loader 装载）；领域包**独占**打开 `ctx.storageDomain`，两份必然打架（单例/域句柄冲突）——列为**不可接受**子形态 |

#### ③ 代价与风险

- **发行形态不可复制**：`link:` 依赖只在你这台机器成立；`dsh-pmboard` 要发 npm 或被别人安装时，四包无法随之而来（A 的 `workspace:*` 没有这个问题）。
- **两仓版本/CI 分裂**：本仓的门（boundary/typecheck/kb）管不到 `WP` 仓；`WP` 仓的 282 条测试也不进本仓基线。
- **边界门要改写**：本仓的门是"清单里的包必须有目录"（宁可不绿不可假绿）；B 必须为"仓外依赖"开一条显式口子，等于放宽这条门。
- **"核心调用"的语义最薄**：pm 只拿到服务面，workprocess 的阶段模型与 pm 的固定阶段流水线仍是两套并列的东西（人的口径：workprocess 无固定节点、pm 是固定阶段，`docs/strategy-research/workprocess-integration/01-facts.md:404`），B 不解决"两套怎么并存"。
- **改动面最小**：四包与 `WP` 仓保持单一事实源，pm 侧只加消费面 + 放宽一条门。

#### ④ 可跑验证判据

| 判据 | 命令 | 期望读数 |
|---|---|---|
| 跨仓依赖可解析 | `pnpm install && node -e "import('workprocess').then(()=>console.log('ok'))"`（在 `pm/` 下） | 打印 `ok`；`ls -l pm/node_modules/workprocess` 有链接 |
| 清单门放行外部依赖 | `pnpm boundary:check` | 退出码 0（豁免机制生效后不再点名四包） |
| 服务面单例 | 真机重启后 `get_workstage` 与 `/work` 命令同源；`grep -c "provide('workprocess')\|ctx.workprocess" pm/dist/index.mjs` | dist 内**不出现**内核实现（B1）；命令面与工具面读同一份状态 |
| 真机装载 | 五条 bundle 行不变、重启宿主 | 工具面在；`~/.dsh/storages/workprocess.json` 继续被写（现状读数见 `docs/strategy-research/workprocess-integration/01-facts.md:292` 起） |
| KB 门 | 可解析状态跑 `pnpm kb:check` | 退出码 0 |

#### ⑤ 三件实测缺口的落法

- **`workprocess/` 源码从哪来**：**不搬**，仍以 `WP` 仓为唯一事实源；本仓配置里的三组预置映射**撤掉**（它们指向本仓 `workprocess/`，本仓没有这个目录，`docs/strategy-research/workprocess-integration/01-facts.md:164`）。
- **命令包与客户端半**：都与本仓无关——命令包继续由 profile 那一行独立装载（`docs/strategy-research/workprocess-integration/01-facts.md:158` 的零预置在此形态下是**预期**而非缺口）；客户端半随 `workprocess` 那一行进浏览器（`docs/architecture/dsh-plugin-loading-rules.md:51`）。
- **`goal/*` 与 `pm-workflow`**：删除仍是最终态，但 B 下"接替者"是**仓外的 workprocess 服务**：17 个文件要么改读 `ctx.workprocess`（`docs/strategy-research/workprocess-integration/01-facts.md:255`），要么摘除；旧名映射与 boundary 的 `pm-goal` 行一起摘（`docs/strategy-research/workprocess-integration/01-facts.md:267` 起）。

**事实锚点**：`docs/strategy-research/workprocess-integration/01-facts.md:107`、`docs/strategy-research/workprocess-integration/01-facts.md:139`、`docs/strategy-research/workprocess-integration/01-facts.md:164`、`docs/strategy-research/workprocess-integration/01-facts.md:187`、`docs/strategy-research/workprocess-integration/01-facts.md:292`、`docs/strategy-research/workprocess-integration/01-facts.md:315`。

### C：混合——内核收进本仓，驱动器 / 工具面 / 命令行仍独立装载

**一句话**：只把 `workprocess`（内核 + 客户端半）搬进本仓 `workprocess/workprocess/`，另三个包留在 `WP` 仓独立装载；本仓的预置正好只覆盖内核（L1 已列 `workprocess`）。

#### ① 文件级改动清单

| 动作 | 路径 | 说明 |
|---|---|---|
| 新增 | `workprocess/workprocess/` | 只搬内核包（含 `client/`、`dist/invariant.js` 的伴生入口与 `./invariant` 子路径） |
| 修改 | `pnpm-workspace.yaml` | `workprocess/*` 保留（现在只匹配到内核一个目录） |
| 修改 | `tsconfig.json`、`vitest.base.mts`、`vitest.config.ts` | 保留内核映射；**删掉** `workprocess-round-driver` / `tool-workprocess` 两组（它们不在本仓） |
| 修改 | `scripts/package-boundary-check.mts` | L1 `workprocess` 行保留；`pm-core` 的 L1 allow 增 `workprocess`（缺口 2）；L2 去掉两个不在本仓的包（或为其开"仓外依赖"口子，同 B） |
| 修改 | `pm/package.json` | 增 `workprocess: workspace:*`；另需能解析 `workprocess-round-driver` 等（`link:` 指向 `WP` 仓）——**仅当真要 import 它们** |
| 修改 | `pm/tsdown.config.mjs` | `WORKSPACE_PACKAGES` 增 `/^workprocess/`（只内核） |
| 修改 | `pm/cordis.patch.yml` | 增 `workprocess` 一行（1 + 1 = 2 行） |
| 修改 | `WP/workprocess-round-driver/package.json`、`WP/tool-workprocess/package.json`、`WP/command-workprocess/package.json` | 三个包的 `workprocess: workspace:*` 必须改成 `link:<本仓>/workprocess/workprocess` 或版本范围——**跨仓耦合点**（`docs/strategy-research/workprocess-integration/01-facts.md:48`、`docs/strategy-research/workprocess-integration/01-facts.md:59`、`docs/strategy-research/workprocess-integration/01-facts.md:69`） |
| 删除 | `pm-workflow/`、`goal/*` | 同 A |

#### ② 宿主装载形态

profile **四条行**：`dsh-pmboard` + `workprocess-round-driver` + `tool-workprocess` + `dsh-command-workprocess`；
内核那条（`workprocess`）由 `pm/cordis.patch.yml` 提供（`id: workprocess`）。
⇒ `workprocess` 必须同时能被三处解析：本仓（`pm` 的 workspace）、`WP` 仓（三个包的依赖）、宿主装载器的解析表。

#### ③ 代价与风险

- **版本漂移风险最高（半搬半不搬）**：内核改了、驱动/工具没跟上（或反过来）就会出现跨仓不兼容；`WP` 仓三个包的 `workspace:*` 被改成 `link:`/范围后，本地路径失效即装载失败。
- **依赖图变成"两仓互指"**：本仓 `workprocess` ← `WP` 三包；`WP` 三包的 patch 又由 profile 提供 ⇒ 谁都不敢单独升级。
- **好处**：改动面最小（只搬一个包）、可**分两步走**（先内核 + 服务面打通，再决定是否把另三包也收进来 ⇒ 平滑过渡到 A）；本仓预置几乎就是为这条路径写的（L1 `workprocess` + L2 两包 + L3）。
- **客户端半口径**：内核的 `lib/client.js` 由本仓内核那条 entry 带来，装载 id 与 A 相同（`workprocess`），与 pm 的 client 半并存。

#### ④ 可跑验证判据

| 判据 | 命令 | 期望读数 |
|---|---|---|
| 内核对齐分层清单 | `pnpm install && pnpm boundary:check` | 退出码 0（内核目录在、L1/L2 自洽；若仍列 `workprocess-round-driver`/`tool-workprocess` 则须走仓外豁免口子） |
| 内核可被组合根内联 | `pnpm --filter dsh-pmboard build` + `grep -c "storageDomain" pm/dist/index.mjs` | 命中 > 0（内核在产物内），且 `pm/dist` 内无 `from "workprocess"` 裸说明符 |
| 跨仓三包仍可装载 | 宿主重启后 `get_workstage` 在 + `/work` 命令在 | 工具面与命令面都可用（说明 `WP` 三包解析到了本仓内核） |
| 驱动闭环 | 真机跑一条全 auto 流程（两阶段） | 阶段自动开工/收口、`~/.dsh/storages/workprocess.json` 里 `closedAt` 落下（流程收口） |
| KB 门 | 可解析状态跑 `pnpm kb:check` | 退出码 0 |

#### ⑤ 三件实测缺口的落法

- **`workprocess/` 源码从哪来**：**只搬内核**（`WP/workprocess/` → `workprocess/workprocess/`），另三包留 `WP` 仓——这正是本仓预置的覆盖面（只映射三包、L1 只列 `workprocess`）。
- **命令包与客户端半**：命令包留 `WP` 仓独立装载（与现状一致；`docs/strategy-research/workprocess-integration/01-facts.md:158` 的"零预置"在此形态下是预期）；客户端半随搬进来的内核那条 entry 走（`docs/architecture/dsh-plugin-loading-rules.md:51`）。
- **`goal/*` 与 `pm-workflow`**：删除最终态不变；内核收进本仓后，pm-core 接替面直接 `import 'workprocess'`（本仓包，走 tsconfig 映射），比 B 少一层跨仓 link（`docs/strategy-research/workprocess-integration/01-facts.md:255`、`docs/strategy-research/workprocess-integration/01-facts.md:267`）。

**事实锚点**：`docs/strategy-research/workprocess-integration/01-facts.md:48`、`docs/strategy-research/workprocess-integration/01-facts.md:59`、`docs/strategy-research/workprocess-integration/01-facts.md:69`、`docs/strategy-research/workprocess-integration/01-facts.md:130-133`、`docs/strategy-research/workprocess-integration/01-facts.md:165`、`docs/strategy-research/workprocess-integration/01-facts.md:167`。

## 三条候选的对照（不构成推荐）

| 维度 | A 四包收进 | B 全独立 | C 混合（内核收进） |
|---|---|---|---|
| 本仓新增包 | 4 | 0 | 1 |
| profile 里的 bundle 行 | 1（A1/A3：1 个包，行数 5/2 写在 pm 的 patch 里） | 5 | 4→2（内核行挪到 pm 的 patch） |
| `workspace:*` 是否成立 | ✅ 全部成立 | ❌ 跨仓（`link:`） | ⚠️ 内核成立、三包要改 |
| 发行形态可复制 | ✅ | ❌ | ⚠️ 一半 |
| 改动面 | 最大 | 最小（但门要放宽） | 中 |
| 最大风险 | 双仓分叉 | 发行形态 + 边界门放宽 | 内核与驱动版本漂移 |
| 事实锚点 | `docs/strategy-research/workprocess-integration/01-facts.md:164`、`docs/strategy-research/workprocess-integration/01-facts.md:171` | `docs/strategy-research/workprocess-integration/01-facts.md:187`、`docs/strategy-research/workprocess-integration/01-facts.md:292` | `docs/strategy-research/workprocess-integration/01-facts.md:130-133`、`docs/strategy-research/workprocess-integration/01-facts.md:165` |

## 推荐与先决条件

### 推荐（**唯一**）：A1 —— 四包收进本仓 `workprocess/*`、profile 只装一个 `dsh-pmboard`、装载清单由 `pm/cordis.patch.yml` 给五条 insert 行；pm 侧「**内核当库、服务当面**」调用

**形态一句话**：`WP` 的四个包整体搬进本仓 `workprocess/`（目录名与层级照抄，`workspace:*` 依赖图原样成立）；
宿主 profile 只列 `dsh-pmboard` 一个 bundle，它的 `cordis.patch.yml` 提供 **5 行**（`pmboard` + 四包各一行）；
`pm-core` 直接 import 内核（L1 依赖，纯函数/类型），`pm` 组合根与 pm-core 的运行时只经 **`ctx.workprocess`** 服务与 `work/changed` 事件消费领域值。

**为什么是它（逐条对照事实）**

| # | 依据 | 事实锚点 |
|---|---|---|
| 1 | 工作树**已经按 A 的骨架预置好了**：workspace glob、tsconfig 三组映射、vitest 别名与 include、boundary 的 L1 `workprocess` + L2 两包——这套预置只有在"四包是本仓 workspace 包"时才讲得通 | `docs/strategy-research/workprocess-integration/01-facts.md:147-158` |
| 2 | 预置里唯一没做的是"把目录搬进来"——A 正解这条缺口 | `docs/strategy-research/workprocess-integration/01-facts.md:164` |
| 3 | **"内核当库"是既定意图**：boundary 里 `workprocess` 那行写着「零依赖（**可被 core 引用**）」，只是 pm-core 的 allow 忘了放行 | `docs/strategy-research/workprocess-integration/01-facts.md:165` |
| 4 | 四包之间是 `workspace:*`，硬约束是**必须同处一个 workspace 根**——搬进本仓后这条自动成立，B/C 都要改依赖形态 | `docs/strategy-research/workprocess-integration/01-facts.md:130-133` |
| 5 | **客户端半的归属决定了不能走"纯内联单入口"**：浏览器半的扫描源是 host Loader 的 entry，没有 insert 行就没有客户端半 ⇒ 保留四包的 entry 是**成本最低**的形态（A1），纯内联（A2/A3）必须先把客户端半改挂到 `dsh-pmboard` | `docs/architecture/dsh-plugin-loading-rules.md:51` |
| 6 | 四包在桌面 profile 现在是**独立装载且确实在跑**（存储域已落盘）——A1 保留这层已验证过的运行形态，只改"包住哪、由谁的 patch 声明" | `docs/strategy-research/workprocess-integration/01-facts.md:292` |
| 7 | 两套装载哲学（一包一 patch vs 单包单 patch）在 A1 下**合并成一套**：pm 的 patch 变成"pm 全家桶的装载清单" | `docs/strategy-research/workprocess-integration/01-facts.md:139`、`docs/strategy-research/workprocess-integration/01-facts.md:167` |
| 8 | A1 同时把两条门拉绿：boundary 不再点名找不到的包目录（现 6 条红） | `docs/strategy-research/workprocess-integration/01-facts.md:187` |
| 9 | 与人的口径一致：`goal/*` 有意去掉、workprocess 是要的，且 workprocess 的阶段由 agent 依目标拆、与 pm 固定阶段是两种形态 | `docs/strategy-research/workprocess-integration/01-facts.md:404` |

**为什么不选另两条**：B 不解决"作为 pm 插件"（仍是 profile 五条 bundle 行、`link:` 依赖**发行形态不可复制**，还要为本仓的门开外部依赖口子）；
C 只搬一个包，另三包的 `workspace:*` 必须改成 `link:`（`docs/strategy-research/workprocess-integration/01-facts.md:48`、`docs/strategy-research/workprocess-integration/01-facts.md:59`、`docs/strategy-research/workprocess-integration/01-facts.md:69`），内核与驱动器跨仓版本漂移风险最高。

**A1 之后的可选收敛步**（不是首步）：把四包改成仅构建期内联 + 把 workprocess 的浏览器半并入 `dsh-pmboard` 的 client bundle，届时装载行可收到 1 行。
首步不做，是因为它会把"搬包"与"改客户端构建 + 改样式归属"两件事绑在一起，风险叠加。

### 先决条件清单（8 条；其中 P2b 是 P2 的发布面半边；每条 = 要改的文件 + 可跑命令 + 期望读数）

| # | 要改的文件 | 可跑命令 | 期望读数 |
|---|---|---|---|
| P1 | `scripts/package-boundary-check.mts:37`（`pm-core` 的 allow 尾加 `workprocess`） | `pnpm boundary:check` | 退出码 0；不再出现那 6 条"找不到包目录"（对照 `docs/strategy-research/workprocess-integration/01-facts.md:187`） |
| P2 | `pm/package.json:41-59`（`dependencies` 增四包：`workprocess` / `workprocess-round-driver` / `tool-workprocess` / `dsh-command-workprocess`，值 `workspace:*`） | `pnpm install && ls -l pm/node_modules \| grep -c workprocess` | 计数 ≥4（四条软链；现状 0，见 `docs/strategy-research/workprocess-integration/01-facts.md:172`） |
| P2b | 同上（**发布面**：四包现为 `private: true`，`pnpm publish` 不会把私有包换算成版本号） | `pnpm --filter dsh-pmboard publish --dry-run --no-git-checks` | 二选一且二选一写进裁定：① 四包去掉 `private` 并可发版 ⇒ 输出里 `workspace:*` 全部换算成版本号；② 明确本插件只走 `link:`/git 安装形态 ⇒ 该命令不在验收面（现状 desktop profile 就是 `link:`，见 `docs/strategy-research/workprocess-integration/01-facts.md:292`） |
| P3 | `pm/tsdown.config.mjs:19-24`（`WORKSPACE_PACKAGES` 增 `/^workprocess/`、`/^workprocess-round-driver/`、`/^tool-workprocess/`、`/^dsh-command-workprocess/`） | `pnpm --filter dsh-pmboard build && grep -c 'from "workprocess' pm/dist/index.mjs` | 内联命中 > 0 且**裸说明符 = 0**（不内联的后果见 `docs/strategy-research/workprocess-integration/01-facts.md:171`） |
| P4 | `pm/cordis.patch.yml:11-13` 追加四行（`id`/`name` 照抄各包现有 patch：`workprocess`、`workprocess-round-driver`、`tool-workprocess`、`dsh-command-workprocess`——注意命令包的 `name` 是**包名**）；config 照抄 `WP` 仓现值（`tick`/`drive`/`defaultMaxRounds`/`close`/`disarmOnResume`，以及工具面与驱动器**同值**的 `blockedAfterRounds`） | 按 `docs/architecture/dsh-plugin-loading-rules.md:85` 的 §5 第 5 条复现组合（`node --input-type=module -e "…composeEntries…"`），或重启宿主 | 该 profile 的 `composeEntries` 结果里出现 5 条 entry、`skippedBundles` 为空；重启后六个 `*_workstage`/`*_worktask` 工具在 |
| P5 | `tsconfig.json`（补命令包映射）、`vitest.base.mts`、`vitest.config.ts`（同上；预置只到三包，`docs/strategy-research/workprocess-integration/01-facts.md:158`） | `pnpm install && pnpm typecheck` | workprocess 相关 error = 0（goal 家族的红归 P6） |
| P6 | 17 个仍 `import pm-goal*` 的文件（`docs/strategy-research/workprocess-integration/01-facts.md:255` 起）；旧名三组映射（`docs/strategy-research/workprocess-integration/01-facts.md:267` 起）；boundary 的 `pm-goal` 行（`docs/strategy-research/workprocess-integration/01-facts.md:277`）；`pm-workflow` 与 `goal/*` 的删除保持不再复活 | `grep -rlE "from '(pm-goal\|tool-pm-goal)" --include='*.ts' . \| grep -v node_modules \| wc -l`，随后 `pnpm typecheck` | 前者 = 0；后者退出码 0（现 93 条 error，见 `docs/strategy-research/workprocess-integration/01-facts.md:187` 起的读数） |
| P7（可选收敛步，不在首步验收面） | `pm/tsdown.client.config.mjs`（把 workprocess 的 `client/index.tsx` 并入 pm 的 client bundle）、`pm/package.json` 的 `dsh.client.inject`（补 `@deepseek-ai/dsh-client-ui-conversation`） | `pnpm --filter dsh-pmboard build:client && node scripts/verify-client-build.mjs` | 退出码 0；`lib/client.js` 内含 workprocess UI，样式归属 `dsh-pmboard`（届时装载行可收到 1 行） |

### 若推荐被否：次选与差异（一行）

次选 **C**（只收内核）：差异 = 只搬 `workprocess/` 一个包、另三包仍由 `WP` 仓独立装载且必须把它们的 `workspace:*` 改成 `link:`/版本范围（`docs/strategy-research/workprocess-integration/01-facts.md:48`、`docs/strategy-research/workprocess-integration/01-facts.md:59`、`docs/strategy-research/workprocess-integration/01-facts.md:69`）——换来改动面最小、可分两步走，代价是内核与驱动器跨仓版本漂移。

### 本轮不实施

本卡**只出推荐与先决条件**：一行代码不改、一个包不搬、profile 不动。要动手，先由人在本文末「待人裁定」节（wt:options:3 装配）裁定选哪条路径与是否按 P1–P7（含 P2b）执行。

## 待人裁定（请人勾选；每条写明了「裁定后的下一步动作」）

> 这是本调研流程的终点站：裁定由人做，agent 不自签（阶段的 `done` 与流程收口都是真人专属）。
> 勾选方式随意——直接回话、或在对话里给出编号与选项。

| # | 裁定项 | 选项（勾选） | 裁定后的下一步动作 |
|---|---|---|---|
| **#1** | 选哪条路径 | ☐ **A1（推荐）** ☐ C（次选：只收内核） ☐ B（四包仍独立、只接服务面） ☐ 其他／重做候选 | 选 A1 ⇒ 按 P1–P7 另开实施流程（本调研流程只到裁定，不动手）；选 C ⇒ 只搬 `workprocess/`，先改三包依赖形态再开工；选 B ⇒ 先给 boundary 的"仓外依赖"开口子；选其他 ⇒ 回到候选章重做（wt:options:1） |
| **#2** | 是否按推荐先决条件执行 | ☐ 全部 P1–P7（含 P2b） ☐ P1–P6，P7 缓 ☐ 只做 P1–P5 的最小闭环（先让两条门绿） | 选定后把对应条目**逐条搬成实施任务**——每条的「命令 + 期望读数」直接当验收判据，不另写判据 |
| **#3** | `goal/*` 与 `pm-workflow` 的处置口径 | ☐ 删除即最终态（把 HEAD 里的旧形态也收编清掉） ☐ 只删工作树、HEAD 形态保留 ☐ 先归档一份旧实现再删 | 选① ⇒ 照 P6 清 17 个 import 与旧名映射，并把"退役"补成文档正史；选② ⇒ 与 A1 的收编并行会冲突，**先定序**（谁先谁后）；选③ ⇒ 先留档（如 `git archive` 或搬进 `docs/`）再删 |
| **#4** | P2b 发布面（四包现为 `private: true`） | ☐ 四包去掉 `private`、可发版 ☐ 明确只走 `link:`/git 安装形态（现状） | 选① ⇒ 四包 `package.json` 去 `private`，`pnpm publish --dry-run` 纳入验收；选② ⇒ 该命令移出验收面，并在 README 写明安装形态 |
| **#5** | 本流程是否就此收口 | ☐ 收口（两份文档即交付） ☐ 还需补充调研（写明补什么） | 选① ⇒ 由人收口 `options` 阶段、流程落幕；选② ⇒ 由人接着派（agent 不自行开新流程） |

## KB 门读数（`pnpm kb:check`）

| 状态 | 读数 | 说明 |
|---|---|---|
| **当前工作树** | **退出码 1** | 红因与 [`01-facts.md`](./01-facts.md) 的「KB 门读数」节**完全一致**：`kb-build` 崩在 `ERR_MODULE_NOT_FOUND: Cannot find package 'pm-goal' imported from …/pm-core/src/application/dive-core/round-state.ts`，`kb-probe` 的 K7 连带红。**没有新增红因** |
| 分步读数（当前工作树） | `kb-conventions-sync` **0**；`kb-build` **1**；`kb-probe` **1**（13/14，K7 红） | 与 01 记录的分步读数一致 |
| **对照：可解析状态**（临时 HEAD 工作树 + 把**两份**文档拷进去） | **退出码 0、14 项全过** | ⇒ 两份文档对 KB 门**零影响**、**无需登记 KB 入口** |

复跑命令（与 01 同口径，对象换成两份文档）：

```bash
# ① 当前工作树（预期红；红因 = goal/* 被删）
pnpm kb:check; echo "exit=$?"

# ② 对照：可解析状态（HEAD 里 goal/ 还在）+ 两份文档
git worktree add --detach /tmp/wp-verify2 HEAD
ln -sfn "$PWD/node_modules" /tmp/wp-verify2/node_modules
mkdir -p /tmp/wp-verify2/docs/strategy-research/workprocess-integration
cp docs/strategy-research/workprocess-integration/0{1,2}-*.md \
   /tmp/wp-verify2/docs/strategy-research/workprocess-integration/
( cd /tmp/wp-verify2 && pnpm kb:check ); echo "exit=$?"
git worktree remove --force /tmp/wp-verify2
```

**本次实测（wt:options:3）**：① 当前工作树 `exit=1`（栈顶即 `pm-goal`）；② 对照 `exit=0` + `kb-probe: 全部通过（14 项检查）`。临时工作树已 `git worktree remove` 清理。

## 交叉引用校验（02 → 01 的每条锚点）

```bash
# 只校验指向 01-facts.md 的锚点：文件在、行号在范围内、该行非空
DOC=docs/strategy-research/workprocess-integration/02-options.md
FACTS=docs/strategy-research/workprocess-integration/01-facts.md
awk '/^```/ {inb = !inb; next} !inb' "$DOC" \
  | grep -oE '01-facts\.md:[0-9]+(-[0-9]+)?' | sed "s|^01-facts.md:|$FACTS:|" | sort -u \
  | { fail=0; n=0
      while IFS= read -r a; do
        f="${a%:*}"; ln="${a##*:}"; rng=$(printf '%s' "$ln" | tr '-' ',')
        n=$((n+1))
        [ -f "$f" ] || { echo "MISSING FILE $a"; fail=1; continue; }
        [ "${ln##*-}" -le "$(wc -l < "$f")" ] || { echo "OUT OF RANGE $a"; fail=1; continue; }
        sed -n "${rng}p" "$f" | grep -q '[^[:space:]]' || { echo "EMPTY LINE $a"; fail=1; }
      done
      echo "01-facts 交叉引用 checked=$n fail=$fail"
      [ "$fail" = 0 ] && echo "cross-refs ok" || echo "cross-refs FAILED"
    }
```

**本次输出（wt:options:3，退出码 0）**：

```
01-facts 交叉引用 checked=22 fail=0
cross-refs ok
```

## 自查（锚点能否解析）

判据与 [`01-facts.md`](./01-facts.md) 的自查节同口径（锚点只认正文、代码块内的示例不算），`DOC` 换成本文：

```bash
# 锚点自查：在 dsh-pmboard 仓根跑
WP=/Users/mac/Documents/ai/dsh/dsh-workprocess
DOC=docs/strategy-research/workprocess-integration/02-options.md
awk '/^```/ {inb = !inb; next} !inb' "$DOC" \
  | grep -oE '`[^`]*:[0-9]+(-[0-9]+)?`' | tr -d '`' | sed "s|^WP/|$WP/|" | sort -u \
  | { fail=0; n=0
      while IFS= read -r a; do
        f="${a%:*}"; ln="${a##*:}"; rng=$(printf '%s' "$ln" | tr '-' ',')
        case "$f" in */*|*.*) ;; *) echo "SKIP(非路径) $a"; continue;; esac
        n=$((n+1))
        [ -f "$f" ] || { echo "MISSING FILE $a"; fail=1; continue; }
        [ "${ln##*-}" -le "$(wc -l < "$f")" ] || { echo "OUT OF RANGE $a"; fail=1; continue; }
        sed -n "${rng}p" "$f" | grep -q '[^[:space:]]' || { echo "EMPTY LINE $a"; fail=1; }
      done
      echo "checked=$n fail=$fail"
      [ "$fail" = 0 ] && echo "anchors ok" || echo "anchors FAILED"
    }
```

**本次输出（wt:options:3 时点＝装配「待人裁定 / KB 门读数 / 交叉引用校验」三节之后，退出码 0）**：

```
checked=29 fail=0
anchors ok
```

> 读数口径与 01 相同：锚点去重后 29 条（wt:options:1 时为 22 条，推荐章把它抬到 29；装配新增的三节只含链接与代码块，未新增锚点），逐条核对文件在、行号在范围内、该行非空。
> 每条候选引用 01-facts.md 的锚点数（该候选小节内去重）：A 16 处、B 10 处、C 9 处，均 ≥3；
> 「推荐与先决条件」章引用 01-facts.md 锚点 18 处（去重）；全文指向 01-facts.md 的锚点共 22 条，交叉引用校验见上节（退出码 0）。
