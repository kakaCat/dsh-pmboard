# 事实账：把 dsh-workprocess 收进 dsh-pmboard（作为 pm 插件的一部分并由 pm 核心调用）

> 本文是**事实账**，不含建议与取舍（建议在 `02-options.md`）。写作口径：
> - 每条断言后带 `<path>:<line>` 锚点；**跨仓锚点用绝对路径**（`WP = /Users/mac/Documents/ai/dsh/dsh-workprocess`），
>   pm 仓内的锚点用**仓根相对路径**（跑命令时 cwd = `/Users/mac/Documents/ai/dsh/dsh-pmboard`）。
> - 计数类断言注明**取值方法**（命令），因为"多少条测试"随口径变。
> - 文末「自查」节给出可复跑命令：逐条核对锚点能否解析（文件在、行号在范围内、该行非空）。
>   语义是否对得上由人读，不由脚本判。

## 一、dsh-workprocess 现状

### 1.1 仓身份

| 事实 | 锚点 |
|---|---|
| 仓根 `WP = /Users/mac/Documents/ai/dsh/dsh-workprocess`，当前分支 `main`，HEAD `5c1efed`（2026-10-12）。取值：`git -C $WP log -1 --format='%H %ad %s' --date=short` | `WP/.git/HEAD:1`（内容 `ref: refs/heads/main`）、`WP/.git/refs/heads/main:1` |
| 该仓是 **private workspace 根**，包名 `dsh-workprocess-workspace` | `WP/package.json:2`、`WP/package.json:3` |
| workspace 成员**恰好四个**（目录名 = 四个包目录） | `WP/pnpm-workspace.yaml:1-5` |
| 仓根脚本：`pretest` 先构建浏览器半、`test` = `vitest run --passWithNoTests`、`typecheck`、`build` = `pnpm -r build` | `WP/package.json:8`、`WP/package.json:9`、`WP/package.json:10`、`WP/package.json:11` |
| 四包的定位与依赖（README 自述）：领域插件 / 回合驱动器 / 工具插件 / 命令行插件 | `WP/README.md:48`、`WP/README.md:49`、`WP/README.md:50`、`WP/README.md:51` |

### 1.2 四包清单字段（逐包）

**① `workprocess`（领域插件 + 内核 + 客户端半）**

| 字段 | 值 | 锚点 |
|---|---|---|
| `name` | `workprocess` | `WP/workprocess/package.json:2` |
| `private` / `type` | `true` / `module` | `WP/workprocess/package.json:4`、`WP/workprocess/package.json:5` |
| `main` | `./dist/index.js`（宿主只认这个） | `WP/workprocess/package.json:7` |
| `exports` | `.` → `dist/index.js`（**有 `default` 条件**） | `WP/workprocess/package.json:9-13` |
| | `./invariant` → `dist/invariant.js` | `WP/workprocess/package.json:14-17` |
| | `./client` → `./lib/client.js` | `WP/workprocess/package.json:18` |
| `files` 白名单 | 只发 `dist/index.js` + `dist/invariant.js` + `dist/types/**/*.d.ts` + `lib/client.js` + patch + README | `WP/workprocess/package.json:21-28` |
| 构建 | `tsc -p tsconfig.build.json && tsdown`；另有 `build:client` | `WP/workprocess/package.json:30`、`WP/workprocess/package.json:31` |
| `dependencies` | `@deepseek-ai/dsh-storage-domain@0.2.0-rc.2`（**唯一运行时依赖**） | `WP/workprocess/package.json:36` |
| `peerDependencies` | `@deepseek-ai/cordis ~4.0.4`、`zod ^4.4.3` | `WP/workprocess/package.json:39-40` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | `WP/workprocess/package.json:44` |
| `dsh.client` | `platform: web`，`inject: ["@deepseek-ai/dsh-client-ui-conversation"]` | `WP/workprocess/package.json:47-50` |

**② `workprocess-round-driver`（回合驱动器）**

| 字段 | 值 | 锚点 |
|---|---|---|
| `name` | `workprocess-round-driver` | `WP/workprocess-round-driver/package.json:2` |
| `main` / `exports` | `./dist/index.js`；`.` 与 `./invariant` 两个子路径 | `WP/workprocess-round-driver/package.json:6`、`WP/workprocess-round-driver/package.json:8-18` |
| 构建 | `tsc -p tsconfig.build.json && tsdown` | `WP/workprocess-round-driver/package.json:20` |
| `dependencies` | `@deepseek-ai/dsh-llm@0.2.0-rc.2`、**`workprocess: workspace:*`** | `WP/workprocess-round-driver/package.json:25`、`WP/workprocess-round-driver/package.json:26` |
| `peerDependencies` | cordis / dsh-agent / dsh-session-projection / dsh-session | `WP/workprocess-round-driver/package.json:29-32` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | `WP/workprocess-round-driver/package.json:36` |
| 浏览器半 | **无**（exports 无 `./client`，`dsh` 里无 `client` 段） | `WP/workprocess-round-driver/package.json:8-18` |

**③ `tool-workprocess`（工具插件，六个工具）**

| 字段 | 值 | 锚点 |
|---|---|---|
| `name` | `tool-workprocess` | `WP/tool-workprocess/package.json:2` |
| `main` / `exports` | `./dist/index.js`；只有 `.` 一个子路径（无伴生件） | `WP/tool-workprocess/package.json:6`、`WP/tool-workprocess/package.json:8-14` |
| `dependencies` | `workprocess: workspace:*`、`dsh-tools@0.2.0-rc.2`、`dsh-llm@0.2.0-rc.2` | `WP/tool-workprocess/package.json:21-23` |
| `peerDependencies` | cordis / dsh-agent / dsh-session-projection / dsh-system-prompt | `WP/tool-workprocess/package.json:26-29` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | `WP/tool-workprocess/package.json:33` |

**④ `command-workprocess`（`/work` 命令行；注意包名 ≠ 目录名）**

| 字段 | 值 | 锚点 |
|---|---|---|
| `name` | **`dsh-command-workprocess`**（带 `dsh-` 前缀，与目录名不同） | `WP/command-workprocess/package.json:2` |
| `main` / `exports` | `./dist/index.js`；只有 `.` | `WP/command-workprocess/package.json:6`、`WP/command-workprocess/package.json:8-14` |
| `dependencies` | `dsh-llm@0.2.0-rc.2`、`workprocess: workspace:*` | `WP/command-workprocess/package.json:21-22` |
| `peerDependencies` | cordis / **dsh-commands** | `WP/command-workprocess/package.json:26-27` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | `WP/command-workprocess/package.json:31` |

### 1.3 构建链与产物形状

| 事实 | 锚点 |
|---|---|
| 四包 **同一个构建形状**：`tsc -p tsconfig.build.json && tsdown`（先出中间态、再按装载入口收成单文件） | `WP/workprocess/package.json:30`、`WP/workprocess-round-driver/package.json:20`、`WP/tool-workprocess/package.json:16`、`WP/command-workprocess/package.json:16` |
| `tsconfig.build.json` 口径：extends `../tsconfig.base.json`、`declaration: true`、`outDir: dist/types`、`rootDir: src`、`include: src/**/*.ts` | `WP/workprocess/tsconfig.build.json:2`、`WP/workprocess/tsconfig.build.json:6`、`WP/workprocess/tsconfig.build.json:7`、`WP/workprocess/tsconfig.build.json:8`、`WP/workprocess/tsconfig.build.json:11-13` |
| tsdown 入口 = 中间态（`dist/types/index.js` → `dist/index.js`，esm / node / es2022） | `WP/workprocess/tsdown.config.ts:16-19` |
| 伴生件入口（`dist/types/invariant.js` → `dist/invariant.js`）：`workprocess` 与 `workprocess-round-driver` 各一份 | `WP/workprocess/tsdown.config.ts:26-29`、`WP/workprocess-round-driver/tsdown.config.ts:22-25` |
| `tool-workprocess` / `command-workprocess` **只有单入口**（无伴生件） | `WP/tool-workprocess/tsdown.config.ts:12`、`WP/command-workprocess/tsdown.config.ts:12` |
| `workprocess` 的 tsdown 配置**三段合一**：node 入口 + 伴生件 + `clientConfig` | `WP/workprocess/tsdown.config.ts:35` |
| 浏览器半：`client/index.tsx` → `lib/client.js`（format cjs、outDir `lib`、固定产物名 `client.js`） | `WP/workprocess/tsdown.client.ts:27`、`WP/workprocess/tsdown.client.ts:29`、`WP/workprocess/tsdown.client.ts:30`、`WP/workprocess/tsdown.client.ts:82` |
| 浏览器半的模块 id 用 `CLIENT_ID/client`、CSS Modules 以 `${CLIENT_ID}/${basename}` 归属 | `WP/workprocess/tsdown.client.ts:26`、`WP/workprocess/tsdown.client.ts:64` |
| **实测产物**（2026-10-12 21:39 构建）：`workprocess` dist/index.js 75053B、dist/invariant.js 27224B、lib/client.js 17152B；`workprocess-round-driver` 36045B / 27418B；`tool-workprocess` 61834B；`command-workprocess` 14421B。取值：`ls -la <pkg>/dist/index.js <pkg>/dist/invariant.js <pkg>/lib/client.js` | 见上列路径（产物文件本身，非文本行） |
| `dist/` 与 `lib/` **都不入库**（构建产物，靠 `prepare`/`build` 生成） | `WP/.gitignore:2`、`WP/.gitignore:4` |
| 「一个装载入口 = 一个文件」（宿主只认 `main`）是**显式设计口径** | `WP/README.md:57` |

### 1.4 测试规模（计数口径写死）

命令：`ls <pkg>/tests/*.spec.ts | wc -l`（文件数）、`grep -rhoE "^\s*(it|test)(\.\w+)?\(" <pkg>/tests/*.spec.ts | wc -l`（用例数）。

| 包 | spec 文件 | 用例（本口径） | src 规模 |
|---|---|---|---|
| `workprocess` | 7 | 128 | 13 个 `src/*.ts` + 2 个 `client/*.tsx` |
| `workprocess-round-driver` | 4 | 68 | 4 个 `src/*.ts` |
| `tool-workprocess` | 5 | 64 | 5 个 `src/*.ts` |
| `command-workprocess` | 1 | 18 | 1 个 `src/*.ts` |
| **合计** | **17** | **278** | 23 个 `src/*.ts` + 2 个 `client/*.tsx` |

| 对照事实 | 锚点 |
|---|---|
| README 自述「282 条（17 个 `*.spec.ts`）」并逐包拆到 128/72/64/18 | `WP/README.md:94` |
| ⇒ **文件数一致（17）**；用例数 README 记 282、本口径数到 278（差 4，来自计数正则口径：README 的 72 对驱动器、本口径 68）；本卡只记两个读数，不裁谁对 | `WP/README.md:94` |
| 内核纯度由机械守卫守住（`tests/kernel-purity.spec.ts`） | `WP/README.md:48` |

### 1.5 装载方式：四个包 = 四条独立 patch 行（一包一 patch）

| 包 | insert 行（id / name） | 锚点 |
|---|---|---|
| `workprocess` | `id: workprocess` / `name: "workprocess"`（不变量伴生件那两行**注释掉**） | `WP/workprocess/cordis.patch.yml:10-12`、`WP/workprocess/cordis.patch.yml:17-18` |
| `workprocess-round-driver` | `id: workprocess-round-driver` / `name: "workprocess-round-driver"` | `WP/workprocess-round-driver/cordis.patch.yml:6-8` |
| `tool-workprocess` | `id: tool-workprocess` / `name: "tool-workprocess"` | `WP/tool-workprocess/cordis.patch.yml:6-8` |
| `command-workprocess` | `id: command-workprocess` / `name: "dsh-command-workprocess"`（**name 用的是包名，带 `dsh-` 前缀**） | `WP/command-workprocess/cordis.patch.yml:6-8` |

驱动器那行的 config 是这套装载的**行为参数面**（逐项锚点）：

| 配置 | 值 | 锚点 |
|---|---|---|
| `tick` | `true` | `WP/workprocess-round-driver/cordis.patch.yml:11` |
| `drive` | `true` | `WP/workprocess-round-driver/cordis.patch.yml:14` |
| `defaultMaxRounds` | `20` | `WP/workprocess-round-driver/cordis.patch.yml:15` |
| `blockedAfterRounds` | `3` | `WP/workprocess-round-driver/cordis.patch.yml:19` |
| `close` | `auto` | `WP/workprocess-round-driver/cordis.patch.yml:21` |
| `disarmOnResume` | `true` | `WP/workprocess-round-driver/cordis.patch.yml:23` |
| 工具面那行的 `blockedAfterRounds` | `3`（与驱动器**必须同值**） | `WP/tool-workprocess/cordis.patch.yml:11` |
| 「两个包各自独立装载、读不到对方 config，故只能靠写同一个数」的理由 | 注释在驱动器行内 | `WP/workprocess-round-driver/cordis.patch.yml:16-19` |
| 「`dsh.bundle.patch` 指向的文件读不到 ⇒ 宿主**整个跳过**该 bundle」 | 各 patch 头注 + README 装载节 | `WP/tool-workprocess/cordis.patch.yml:3-4`、`WP/README.md:103` |

**四包互相依赖只用 `workspace:*`**（驱动器 / 工具 / 命令行 → 领域包），没有跨包相对路径引用：
`WP/workprocess-round-driver/package.json:26`、`WP/tool-workprocess/package.json:21`、`WP/command-workprocess/package.json:22`。
⇒ 这四包**换仓**（从 `WP/` 搬到别的 workspace 根）在依赖声明层面没有阻力，唯一硬约束是**必须同处一个 workspace 根**，
否则 `workspace:*` 解析不到。

### 1.6 本卡遗留（交给后续卡，本卡不裁）

- 装载行的 `name` 与目录名/包名的对应关系有**三种形态**（`workprocess`、`workprocess-round-driver`、`dsh-command-workprocess`）——
  收进 pm 仓后这些模块说明符怎么解析，属"宿主装载契约"卡（wt:facts:3）。
- 四包 `dsh.bundle.patch` 的"一包一 patch"与 pm 现有"单包单 patch（`pm/cordis.patch.yml` 只一行 pmboard）"是**两套装载哲学**——
  属"pm 仓预置与缺口"卡（wt:facts:2）与方案卡（`02-options.md`）。

## 二、pm 仓预置与缺口

> 本章只记**事实**：工作树（未提交改动）里已为 workprocess 预置了什么、还缺什么、两条门现在的红绿读数。
> 取值时点 2026-10-12（wt:facts:2）；pm 仓内锚点一律**仓根相对路径**，跨仓锚点仍用 `WP/…`。

### 2.1 已预置的 5 处（工作树改动，均未提交）

| # | 位置 | 预置内容 | 锚点 |
|---|---|---|---|
| 1 | workspace 成员 | 新增 `- 'workprocess/*'`（goal 侧两行仍在：`tool-pm-goal`、`goal/*`） | `pnpm-workspace.yaml:7`、`pnpm-workspace.yaml:5-6` |
| 2 | TS 路径映射 | 三组 —— `workprocess` / `workprocess-round-driver` / `tool-workprocess`，每组两条（入口 + `src/*`），落点 `./workprocess/<目录>/src/…` | `tsconfig.json:120-136` |
| 3 | vitest 别名 | 同样三组（目录别名 + 入口别名，共 6 条） | `vitest.base.mts:143-148` |
| 4 | vitest include | 新增 `'workprocess/*/tests/**/*.test.ts'` | `vitest.config.ts:19` |
| 5 | 分层白名单 | L1 新增 `{ layer: 'L1', pkgs: ['workprocess'], allow: [] }`；L2 的 pkgs 增 `workprocess-round-driver`、`tool-workprocess`，allow 增 `workprocess` | `scripts/package-boundary-check.mts:41`、`scripts/package-boundary-check.mts:44-46` |

预置落点与 dsh-workprocess 仓的目录名 / 层级**逐个对上**（`workprocess/workprocess/`、`workprocess/workprocess-round-driver/`、`workprocess/tool-workprocess/`，见 1.2 与 1.3）。
**命令行包零预置**：`dsh-command-workprocess` 在 tsconfig / vitest 里没有任何映射（只有 workspace glob 会覆盖它的目录）——pm 侧的命令面一直是 `command-pm`。

### 2.2 尚缺的 4 处（卡面点名的）

| # | 缺口 | 事实 | 锚点 |
|---|---|---|---|
| 1 | `workprocess/` 目录不存在 | `ls -d workprocess` → `No such file or directory`；`boundary:check` 直接点名三个 workprocess 包找不到目录 | `pnpm-workspace.yaml:7`（该 glob 目前不匹配任何目录）、`scripts/package-boundary-check.mts:41` |
| 2 | pm-core 的 L1 allow 未含 workprocess | `pm-core` 行 allow 止于 `pm-goal`，而**紧接的注释**写着「同样零依赖（**可被 core 引用**）」；同时 L2 的 allow 却已放行 `workprocess` —— 同一文件内自相矛盾 | `scripts/package-boundary-check.mts:37`、`scripts/package-boundary-check.mts:40`、`scripts/package-boundary-check.mts:46` |
| 3 | `pm/package.json` 依赖表未列四包 | 依赖表 workspace 项止于 `tool-pm`；**goal 家族同样不在表里**（无 `pm-goal` / `pm-goal-round-driver` / `tool-pm-goal`），而 `pm/src` 却 import 它们 ⇒ 依赖表不是本仓现行走的接线方式 | `pm/package.json:41-59`、`pm/package.json:58`、`pm/src/index.ts:46`、`pm/src/index.ts:135` |
| 4 | `pm/cordis.patch.yml` 只有一行 | 只有 `- id: pmboard` / `name: "dsh-pmboard"` ⇒ 与 dsh-workprocess「一包一 patch、四条 insert 行」是两套装载形态 | `pm/cordis.patch.yml:11-13`、`WP/workprocess-round-driver/cordis.patch.yml:6-8` |

### 2.3 追加发现（卡面外，同属缺口）

- **构建内联正则不覆盖 workprocess**：`WORKSPACE_PACKAGES = [/^pm-/, /^tool-pm/, /^command-pm/, /^reqboard-rtm/]` —— `workprocess` / `workprocess-round-driver` / `tool-workprocess` / `dsh-command-workprocess` **一个都不匹配**；而同文件头注正记着「不内联 ⇒ 运行期按 exports 解析到不存在的 `src/*.js` ⇒ 插件整体加载失败」。锚点：`pm/tsdown.config.mjs:19-24`、`pm/tsdown.config.mjs:11-16`、`pm/tsdown.config.mjs:34`。
- **pnpm 安装态比源码旧**：`pm/node_modules` 里只有 17 个 workspace 软链（1 个 `command-pm` + 7 个 `pm-category-*` + `pm-client` / `pm-common` / `pm-core` / `pm-scripts` / `pm-skills` / `pm-templates` + `reqboard-rtm` + `tool-pm` + 悬空的 `pm-workflow`），**没有任何 goal / workprocess 软链**；`pm-workflow` 那条指向已删目录（悬空）。锚点：`pm/package.json:43-58`（声明面）。
- 命令包在 pm 侧的预置为**零**（见 2.1 末条）。

```
$ cd /Users/mac/Documents/ai/dsh/dsh-pmboard
$ ls pm/node_modules | tr '\n' ' '
@deepseek-ai @types command-pm pm-category-bug pm-category-chore pm-category-doc pm-category-feature
pm-category-kit pm-category-refactor pm-category-spike pm-client pm-common pm-core pm-scripts pm-skills
pm-templates pm-workflow reqboard-rtm tool-pm tsdown tsx typescript vitest yaml
$ ls -la pm/node_modules/ | grep pm-workflow
lrwxr-xr-x@ 1 mac  staff  17 Oct 10 18:52 pm-workflow -> ../../pm-workflow
$ ls -d pm/node_modules/pm-workflow/
ls: pm/node_modules/pm-workflow/: No such file or directory      # 悬空
```

### 2.4 两条门的当前红绿（原始输出）

**① `pnpm boundary:check` → 退出码 1**

```
> dsh-pmboard-workspace@0.1.0 boundary:check /Users/mac/Documents/ai/dsh/dsh-pmboard
> tsx scripts/package-boundary-check.mts

FAIL：清单里声明了却找不到包目录（宁可不绿，不可假绿）：
  - pm-goal
  - workprocess
  - tool-pm-goal
  - pm-goal-round-driver
  - workprocess-round-driver
  - tool-workprocess
 ELIFECYCLE  Command failed with exit code 1.
```

**② `pnpm typecheck` → 退出码 2，共 93 条 error**

| 错误码 | 条数 | 读数（本卡只记读数与首因，不逐条归因） |
|---|---|---|
| TS2307「找不到模块」 | 34 | **全部是 goal 家族**：`pm-goal` ×14、`pm-goal-round-driver/*` ×17（driver.js 9 / heartbeat.js 3 / subscriptions.js 2 / stage-prompt.js 2 / prompt.js 1 / decide.js 1）、`tool-pm-goal/*` ×2 |
| TS7006「隐式 any」 | 59 | `pm/` 40、`pm-core/` 10、`tests/` 8、`tool-pm/` 1；采样（如 `pm/src/adapters/goal-round-lifecycle.ts:92`、`pm-core/tests/dialog-inflight-stop.test.ts:70`）都落在 unresolved 模块的下游 |

**关键读数：34 条 TS2307 无一指向 `workprocess*`** —— 工作树里目前**没有任何代码 import workprocess**，预置只到配置面（与 1.6 的遗留项一致）；typecheck 的红是 `goal/*` 被删的账，不是 workprocess 的账。

## 三、已删包与遗留引用

> 本章记「goal 家族被删 / pm-workflow 退役」这份**既成事实**的边界：删了什么、删到哪一层（工作树还是提交）、
> 谁还在引用旧名。取值时点 2026-10-12（wt:facts:3）。

### 3.1 删除读数：64 条，全部是**未暂存删除**（` D`）

`git status --porcelain | grep '^ D'` 的分组：

| 目录 | 条数 | 细分 | 锚点 |
|---|---|---|---|
| `goal/` | 51 | `pm-goal` 14 · `pm-goal-round-driver` 25 · `tool-pm-goal` 12 | `pnpm-workspace.yaml:6`（`goal/*` 仍在成员表里） |
| `pm-workflow/` | 9 | README / package.json / scripts·src·tests 各 2 / tsconfig.json / vitest.config.mts | `scripts/package-boundary-check.mts:45`（该包已从 L2 pkgs 里去掉） |
| `pm-core/` | 2 | `src/application/internal/workflow-script.ts`、`tests/workflow-script-contract.test.ts` | `pm-core/src/application/ports.ts:1773`（工作树里只剩"已退役"注释） |
| `tests/` | 2 | `dive-abort-latch.test.ts`、`support/dive-loop-harness.ts` | `tests/support/goal-round-harness.ts:1`（同目录仍在的 goal 桩件） |

**删除只发生在工作树**（` D` 的第二列 = 工作树删除、未进暂存区）：

| 判据 | 读数 | 锚点 |
|---|---|---|
| HEAD 里 goal 文件数 | 51（`git ls-tree -r --name-only HEAD goal \| wc -l`） | `pnpm-workspace.yaml:6` |
| HEAD 里 pm-workflow 文件数 | 9（同上） | `scripts/package-boundary-check.mts:45` |
| HEAD 的 `ports.ts` 仍定义 `WorkflowRunner` 端口（`WorkflowRunOutcome` / `WorkflowStartInput` / `WorkflowRunner` 三段），工作树同名文件已无该端口、只剩注释 | `git show HEAD:pm-core/src/application/ports.ts \| grep -n WorkflowRunner` 有输出；工作树 `grep -c WorkflowRunner` = 0 | `pm-core/src/application/ports.ts:1773` |
| main 分支 | `goal` / `pm-workflow` / `workprocess` **一个都没有** | `pnpm-workspace.yaml:7`（`workprocess/*` 是工作树新增） |
| 暂存区 / stash | 空（`git stash list` 无输出；`git diff --cached` 无内容） | —— |

⇒ 复原成本为零：`git checkout -- goal pm-workflow pm-core/src/application/internal/workflow-script.ts …` 即可回到 HEAD 形态。

### 3.2 删除时点：**没有"删包"提交**，退役叙述也只到工作树

| 判据 | 读数 | 锚点 |
|---|---|---|
| `git log --oneline -3 -- goal/` | `1bf9b21c`（包级接线）、`ef2aaa91`（新增双层 goal）——**无删除提交** | —— |
| `git log --oneline -3 -- pm-workflow/` | `1bf9b21c`、`6c95900a`、`fec68fa2`——同样无删除提交 | —— |
| 号称退役的 `308197bf`（chore(retire)：147 文件 / −5217 行） | **没碰** `pm-workflow` / `goal/` / `workflow-script`（`git show --stat 308197bf \| grep` 空） | `pnpm-workspace.yaml:5-6`（两行仍在） |
| HEAD 的两份文档仍把 `pm-workflow` 列在 L2 包表里 | 有（未写退役） | `docs/architecture/workspace-packages.md:31`（工作树版本已改成"2026-10-11 退役"）、`docs/knowledge/architecture.md:10` |
| 退役叙述的落点 | 工作树：`docs/architecture/workspace-packages.md`、`docs/knowledge/architecture.md`、`docs/architecture/plugin-runtime-prerequisites.md`、`docs/diagrams/README.md` | `docs/architecture/plugin-runtime-prerequisites.md:138` |

⇒ 一句话：**「删 `goal/*` + 退役 `pm-workflow` + 给 workprocess 腾位置」是一整套尚未提交的在飞改动**；
HEAD 是旧形态（包在、端口在、文档未写退役），工作树是目标形态（包删、端口删、文档已写退役、workprocess 配置已预置）。

### 3.3 仍 import `pm-goal*` 的活代码：17 个文件（旧名还没人改）

取值：`grep -rlE "^\s*(import|export)[^/]*from ['\"](pm-goal|pm-goal-round-driver|tool-pm-goal)" --include='*.ts' --include='*.mts'`（排除 node_modules / dist）→ **17 个文件**。

| 文件 | 行 | 锚点 |
|---|---|---|
| `pm/src/index.ts` | 46（`tool-pm-goal/plugin.js`）、135（`pm-goal`） | `pm/src/index.ts:46`、`pm/src/index.ts:135` |
| `pm/src/adapters/goal-round-lifecycle.ts` | 22–28（driver.js / subscriptions.js / heartbeat.js / stage-prompt.js） | `pm/src/adapters/goal-round-lifecycle.ts:22-28` |
| `pm/src/adapters/goal-round-ports.ts` | 23、28、31（`pm-goal` 值与类型、driver.js 类型） | `pm/src/adapters/goal-round-ports.ts:23`、`pm/src/adapters/goal-round-ports.ts:31` |
| `pm-core/src`（5 个） | dive-core/round-state.ts:18,22,23、internal/stage-advance.ts:20、domain/requirement/RequirementSummary.ts:32,177、domain/workflow/StageGoalSeed.ts:15,16、protocol-domain.ts:21（**行号随文件重命名会漂，落地时以 grep 为准**） | `pm-core/src/application/internal/stage-advance.ts:20`、`pm-core/src/protocol-domain.ts:21` |
| `pm-core/tests`（5 个）+ `tests`（3 个）+ `tool-pm/tests`（1 个） | 见 typecheck 的 34 条 TS2307 | `tool-pm/tests/apply-wiring.test.ts:20` |

**配置面也仍指向 `goal/*`**（与 2.1 的 workprocess 预置并存）：

| 位置 | 内容 | 锚点 |
|---|---|---|
| `tsconfig.json` | 三组映射 `tool-pm-goal` / `pm-goal-round-driver` / `pm-goal` 全在 | `tsconfig.json:96-118` |
| `vitest.base.mts` | 同名三组别名 | `vitest.base.mts:135-142` |
| `vitest.config.ts` | include 里 `goal/pm-goal`、`goal/pm-goal-round-driver`、`goal/tool-pm-goal` 三条仍在 | `vitest.config.ts:19` |
| `scripts/package-boundary-check.mts` | pm-core 的 allow 含 `pm-goal`；L1 单列 `pm-goal`；L2 pkgs 含 `pm-goal-round-driver`、`tool-pm-goal` | `scripts/package-boundary-check.mts:37`、`scripts/package-boundary-check.mts:39`、`scripts/package-boundary-check.mts:45` |
| `pm/tsdown.config.mjs` | 内联注释把 goal 家族算作 `pm-*` / `tool-pm*` 的覆盖对象 | `pm/tsdown.config.mjs:20-21` |

⇒ 工作树当前是**两套名并置**：新名（workprocess 三组映射，2.1）与旧名（goal 三组映射，本节）同时映射，而**代码只写旧名**（17 个文件）——这正是 `pnpm typecheck` 93 条 error 的来源（2.4）。

### 3.4 `pm-workflow` 的残留引用：6 处，全是注释（无 import）

| 文件 | 行 | 性质 | 锚点 |
|---|---|---|---|
| `tests/application/teams-fake.ts` | 4 | 「引擎适配器与其端口已删」 | `tests/application/teams-fake.ts:4` |
| `pm-core/src/application/use-cases/ExecuteTask.ts` | 496 | 「退役 workflow 引擎：包与端口一并删除」 | `pm-core/src/application/use-cases/ExecuteTask.ts:496` |
| `pm-core/tests/advance-engine-precheck.test.ts` | 88 | 退役后唯一定义处 | `pm-core/tests/advance-engine-precheck.test.ts:88` |
| `pm-core/tests/advance-chain.test.ts` | 7 | 子卡产出不再来自假引擎 | `pm-core/tests/advance-chain.test.ts:7` |
| `pm-core/tests/execute-subtask-team.test.ts` | 7 | 团队是唯一执行面 | `pm-core/tests/execute-subtask-team.test.ts:7` |
| `pm-core/tests/stage-model-routing.test.ts` | 4 | 删包 + 删 `workflow-script.ts` | `pm-core/tests/stage-model-routing.test.ts:4` |

## 四、本机装载实况（两个 profile）

### 4.1 desktop profile —— workprocess 四包**独立装载**，且确实在跑

| 事实 | 读数 | 锚点 |
|---|---|---|
| 依赖声明：四个 workprocess 包各一条 `link:` | `dsh-command-workprocess` → `…/dsh-workprocess/command-workprocess`；`workprocess` / `tool-workprocess` / `workprocess-round-driver` 同理 | `/Users/mac/.dsh/profiles/desktop/package.json:9-12` |
| 同 profile 也装 `dsh-pmboard`（**指向 `…/dsh-pmboard/pm`**） | `link:/Users/mac/Documents/ai/dsh/dsh-pmboard/pm` | `/Users/mac/.dsh/profiles/desktop/package.json:7` |
| bundle 表：四个 workprocess 包各占一行 | `workprocess`、`workprocess-round-driver`、`tool-workprocess`、`dsh-command-workprocess` | `/Users/mac/.dsh/profiles/desktop/package.json:22-25` |
| bundle 表里 `dsh-pmboard` 一行 | 与四包并列 | `/Users/mac/.dsh/profiles/desktop/package.json:20` |
| 用户层 patch **没有** workprocess 行 | 该层只做 id 定向覆盖 / 禁用（文件头写明"作用在每一层 bundle 之后"），全文 `grep -n workprocess` 无输出；与本方案相关的一行是把 pmboard 重新启用（`- id: pmboard` / `disabled: false`），另有同类的 id 定向条（如 `web-ui-usage`） | `/Users/mac/.dsh/profiles/desktop/cordis.patch.yml:1-3`、`/Users/mac/.dsh/profiles/desktop/cordis.patch.yml:143-144`、`/Users/mac/.dsh/profiles/desktop/cordis.patch.yml:182-183` |
| ⇒ 四包的装载行来自**各包自带的** `dsh.bundle.patch` | 与 1.5 的四条 insert 行一一对应 | `WP/workprocess/cordis.patch.yml:10-12` |
| **活证据**：workprocess 存储域已落盘 | `~/.dsh/storages/workprocess.json`，27073 字节，mtime 2026-10-12 21:56（就在本会话的轮次里被写） | 见下方 `ls` 读数 |

```
$ ls -la ~/.dsh/storages/
drwx------  5 mac staff   160 Oct 12 21:56 .
drwx------ 22 mac staff   704 Oct 12 21:48 ..
drwx------  3 mac staff    96 Sep 29 15:14 session_projcache
-rw-------  1 mac staff 27073 Oct 12 21:56 workprocess.json     # ← 本流程的阶段/任务/回合账在这里
-rw-------  1 mac staff 27842 Oct 12 21:49 workspace.json
```

这也是**本会话能调 `get_workstage` / `create_worktask` / `update_worktask` 的原因**：桌面 profile 装了 `tool-workprocess`，其数据落 `workprocess.json`。

### 4.2 web profile —— 没装 workprocess，只有 `dsh-pmboard`

| 事实 | 读数 | 锚点 |
|---|---|---|
| 依赖声明只有 `dsh-pmboard`（声明写的是**仓根**，不是 `pm/`） | `"dsh-pmboard": "link:/Users/mac/Documents/ai/dsh/dsh-pmboard"`；同文件头部是 profile 名 `dsh-profile-web` / `private: true` | `/Users/mac/.dsh/profiles/web/package.json:1-3`、`/Users/mac/.dsh/profiles/web/package.json:5` |
| bundle 表：只有 base / web-app / dsh-pmboard 三行，**无 workprocess** | —— | `/Users/mac/.dsh/profiles/web/package.json:10-12` |
| 用户层 patch 里 `dsh-pmboard` 的插入行 | `- insert: - id: pmboard / name: "dsh-pmboard"`；该文件也是"作用在 bundle 层之后"的 id 定向层（末尾是 `agent-default-model` 条） | `/Users/mac/.dsh/profiles/web/cordis.patch.yml:1-3`、`/Users/mac/.dsh/profiles/web/cordis.patch.yml:14-16`、`/Users/mac/.dsh/profiles/web/cordis.patch.yml:36-40` |
| **声明与安装态不一致** | 已安装软链实际指向 `…/dsh-pmboard/**pm**`（`readlink ~/.dsh/profiles/web/node_modules/dsh-pmboard`），而 `package.json:5` 声明的是仓根 | `/Users/mac/.dsh/profiles/web/package.json:5` |
| 按宿主装载规则，指向仓根会在下次 `pnpm install` 后**静默跳过**该 bundle | 仓根 `package.json` 是 private workspace 根、无 `dsh.bundle`（见 `pm/cordis.patch.yml:1-10` 的同类坑记述） | `pm/cordis.patch.yml:3-6` |

⇒ 本机是**两套并存**实况：desktop = `dsh-pmboard(pm/)` + workprocess 四包各占一行（四个独立 bundle）；
web = 只有 `dsh-pmboard`（无 workprocess 工具面）。收编方案的直接对照物就是 desktop 那四行。

## 自查（锚点能否解析）

判据：**每条锚点都指向一个存在的文件、且行号在范围内、且该行非空**。语义是否对得上由人读（抽查见下）。
锚点只认**正文**——代码块里的示例不算锚点（故本节的命令里出现的同形字符串不会被自己当成锚点）。

```bash
# 锚点自查：在 dsh-pmboard 仓根跑
WP=/Users/mac/Documents/ai/dsh/dsh-workprocess
DOC=docs/strategy-research/workprocess-integration/01-facts.md
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

**本次输出（wt:facts:4 装配时点，退出码 0）**：

```
checked=148 fail=0
anchors ok
```

**语义抽查（人读）**：wt:facts:1 抽 5 条、wt:facts:2/wt:facts:3 各抽若干条，逐条 `sed -n` 打印原文比对。

| 锚点 | 打印到的行（摘要） | 与断言是否相符 |
|---|---|---|
| `WP/README.md:51` | `command-workprocess` 行：命令行插件 `/work`、独立装载行 | 相符 |
| `WP/README.md:50` | `tool-workprocess` 行：工具插件、六个工具、数据只经 `ctx.workprocess` | 相符 |
| `WP/workprocess/package.json:14-17` | `"./invariant"` → `dist/invariant.js`（含 `default`） | 相符 |
| `WP/workprocess/tsconfig.build.json:6` | `"declaration": true` | 相符 |
| `WP/command-workprocess/package.json:31` | `"patch": "./cordis.patch.yml"` | 相符 |
| `scripts/package-boundary-check.mts:37` | `{ layer: 'L1', pkgs: ['pm-core'], allow: [ … 'pm-goal'] }`（**无 workprocess**） | 相符 |
| `scripts/package-boundary-check.mts:40` | 注释「…同样零依赖（可被 core 引用）」 | 相符 |
| `pm/tsdown.config.mjs:19-24` | `WORKSPACE_PACKAGES = [/^pm-/, /^tool-pm/, /^command-pm/, /^reqboard-rtm/]` | 相符 |
| `pm/cordis.patch.yml:11-13` | `- insert: - id: pmboard / name: "dsh-pmboard"`（仅一行） | 相符 |
| `/Users/mac/.dsh/profiles/desktop/cordis.patch.yml:143-144` | `- id: pmboard` / `disabled: false` | 相符 |
| `/Users/mac/.dsh/profiles/web/package.json:1-3` | `dsh-profile-web` / `private: true` | 相符 |

## KB 门读数（`pnpm kb:check`）

| 状态 | 读数 | 说明 |
|---|---|---|
| **当前工作树** | **退出码 1** | `kb-build` 崩在 import 链上：`ERR_MODULE_NOT_FOUND: Cannot find package 'pm-goal' imported from pm-core/src/application/dive-core/round-state.ts`（该 import 就在 `pm-core/src/application/dive-core/round-state.ts:18`）；随后 `kb-probe` 的 K7 生成物漂移跟着红（漂移文本就是那份崩溃输出）。红因 = `goal/*` 被删（见 §三），**与本文档无关** |
| 分步读数（当前工作树） | `kb-conventions-sync.mts --check` **退出码 0**（「覆盖度与清单一致」）；`kb-build.mts --check` **1**；`kb-probe.mts` **1**（14 项里 13 项过，K7 红） | —— |
| **对照：可解析状态**（临时 HEAD 工作树 + 把本文档拷进去） | **退出码 0，14 项全过**（K1–K14 无一条提到本文档） | ⇒ **本文档对 KB 门零影响、无需登记 KB 入口**；当前工作树那条红只能靠「恢复 `goal/*`」或「落地收编方案」消掉——两者都属 §四 之后的实施方案，不在本卡权限内 |

复跑命令（两个状态并排）：

```bash
# ① 当前工作树（预期红：红因 = goal/* 被删）
pnpm kb:check; echo "exit=$?"

# ② 对照：可解析状态（HEAD 里 goal/ 还在）+ 本文档
git worktree add --detach /tmp/wp-verify HEAD
ln -sfn "$PWD/node_modules" /tmp/wp-verify/node_modules
mkdir -p /tmp/wp-verify/docs/strategy-research/workprocess-integration
cp docs/strategy-research/workprocess-integration/01-facts.md \
   /tmp/wp-verify/docs/strategy-research/workprocess-integration/
( cd /tmp/wp-verify && pnpm kb:check ); echo "exit=$?"
git worktree remove --force /tmp/wp-verify
```

> 装配说明（wt:facts:4）：本文件四节（一 dsh-workprocess 现状 / 二 pm 仓预置与缺口 / 三 已删包与遗留引用 / 四 本机装载实况）由 wt:facts:1–3 分卡写入，本节由 wt:facts:4 装配并刷新读数；
> 被删文件本身无法给行锚点（文件已不在盘上），故 §3.1 的锚点给的是**删除的旁证**（仍在盘上的引用点或同目录的兄弟件）。
> 本文只记事实与本机读数，不含建议与取舍——建议在 `02-options.md`。

### 人工输入（2026-10-12，原文照录，非本账推论）

问「kb:check 在当前工作树为红（因 goal/* 被删）这条判据怎么算」时，人的答复原文：

> pm的goal有问题 dsh-workprocess是我需要的，dsh-workprocess没有固定节点，pm是固定阶段，我直接给dsh-workprocess

由此确定的两点口径（**人为授权，非本文推断**）：

1. **`goal/*` 的删除是有意的**（pm 的 goal 被判定有问题），因此**不**恢复 `goal/*` 来换 kb:check 绿；
   ⇒ 本文档记录的 kb:check 红属**过渡态**（红因见上表），不是本文档的缺陷。
2. **目标是 dsh-workprocess**：采用它的两层模型 —— 它**没有固定阶段**（阶段由 agent 依目标拆），
   与 pm 现有流水线的**固定阶段**是两种形态；「我直接给」= 源在 `/Users/mac/Documents/ai/dsh/dsh-workprocess`（§一即该仓读数）。
