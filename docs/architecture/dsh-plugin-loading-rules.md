# DSH 插件加载规则（宿主契约）

> 事实源：宿主 `deepseek-harness` 的 `packages/boot/app-boot/src/profile.ts`（profile/bundle/patch 组合与运行期解析）、
> `packages/client/modules/src/index.ts`（客户端半扫描与分发）、`packages/util/package-manifest/src/types.ts`（清单字段）、
> `packages/client/web/src/platform.ts` + `packages/client/tsdown.client.ts`（浏览器模块表与产物形态）。
> 本页只写「宿主怎么读、读什么、读不到会怎样」；本仓自己的落点见文末。
> 相关：本插件视角的三条前提与排障见 [`plugin-runtime-prerequisites.md`](./plugin-runtime-prerequisites.md)。

## 0. 三层对象：profile → bundle → entry #three-layers

| 层 | 是什么 | 宿主读哪个字段 |
|---|---|---|
| profile | `$DSH_HOME/profiles/<name>/`（`DSH_PROFILE`） | `package.json` 的 `dsh.profile.bundles`（**有序**）+ 同目录 `cordis.patch.yml`（用户层） |
| bundle | `dsh.profile.bundles` 里的一项＝**包名** | 该包 `package.json` 的 `dsh.bundle.patch`（字符串或字符串列表，相对包根，按序） |
| entry | patch 里的行 `{ id, name, config?, disabled? }` | `insert` 列表；`name` = 插件模块说明符 |

**组合顺序**（`composeEntries` → `applyEntryPatches([], …)`，作用在**空条目表**上）：
各 bundle 的 patch 按 `dsh.profile.bundles` 顺序 → profile 自己的 `cordis.patch.yml` → 启动器层（`--patch` 文件与命令行 flag 派生）。

## 1. bundle 解析与「静默跳过」 #bundle

- **目录解析**（`resolveBundleDir`）：用 `createRequire(anchor).resolve.paths(pkg)` 按 **node_modules 查找序**逐级探测
  `node_modules/<pkg>/package.json`。**不要求**该包导出 `./package.json`。
- **锚点顺序：先「dsh 安装」，再「profile 目录」**。这是硬契约——`@deepseek-ai/dsh-base` 这类内置 bundle 永远取
  与运行中 dsh 同一份安装，绝不会被 profile 本地同名包顶掉。
- **bundle 必须声明 `dsh.bundle`**；否则 skip。
- **兼容性**：`evaluatePluginCompatibility(bundleManifest, exemptions)` 不过、且 profile 的 exemptions 没豁免 → skip。
- **patch 文件读不到/解析不了 → 整个 bundle 被跳过**（不是启动失败）。
- 跳过是**逐 bundle 的 try/catch**：结果进 `skippedBundles[{packageName, reason}]`，`reportSkippedBundles` 每个打**一行 stderr**：
  `dsh: skipping profile bundle "<name>": <reason>`，然后宿主照常启动。
  ⇒ **症状是「插件凭空消失」**（工具 unknown tool、路由 404、侧栏无入口），板子与宿主都还活着。
- 反向例外：**profile 自身**的 manifest 或用户 patch 出错会**抛**（不静默）。

## 2. entry 解析（插件模块怎么被找到） #entry

- `name` 的三种形态（`anchorInsertedPluginNames`）：
  - **裸包名** → Node 包解析（由下条的运行期解析表供给）；
  - **`./x` · `../x` · 绝对路径** → 转成 **相对 patch 文件所在目录**的 `file://` URL。
- **运行期解析表**（`createRuntimeResolution`）＝ 安装范围（安装包依赖图 BFS，**含 peerDependencies**）
  ＋ profile 范围（profile 依赖及其依赖树）；被 skip 的 bundle **不参与** BFS；
  profile 里 `link:` 到仓库外的目录进 `linkedRoots`——导入方走**真实祖先链**，各 node_modules 位置各自带 peer 映射。
  ⇒ 推论：插件**可以不安装** `@deepseek-ai/*` 宿主包（安装侧供给）；但插件产物里留成外部的**普通 npm 包必须自己能解析到**。
- **模块契约**（cordis 插件）：导出 `name`（稳定字符串）＋ `apply(ctx, config)`；可选 `inject`（服务名数组）、
  `Config`（schemastery schema）、`reusable`。产物是 dist 还是 TS 源码都行，只要解析得到。
- **入口解析的 CJS 条件**：本仓 2026-10-09 实测——入口解析走 `createRequire` 口径，`exports["."]` **必须给 `default`**，
  只写 `import` 会 `ERR_PACKAGE_PATH_NOT_EXPORTED`（记录见 `scripts/sync-to-github.sh` 头注）。
- `id` 不是装饰：HMR 粒度、样式归属、客户端行匹配都以它为准；`disabled: false` 是 profile 用户层「重新启用」的常规写法。

## 3. 客户端半（浏览器侧） #client

- **扫描源 = host Loader 的 entry**：没有 insert 行就没有客户端半。取该 entry 的包清单 `dsh.client`；
  `platform !== 'web'` ⇒ 记为「非客户端包」（按 Loader 说明符缓存，直到重启）。
- 声明了 `dsh.client` 却**没有 `exports["./client"]` ⇒ 直接抛**：
  `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`。
- **浏览器模块 id = 包名**；产物必须是 `window.__ModuleLoader__.load({ id: <包名>, factory })` 形态
  （本仓 `scripts/wrap-client.mjs` 就是包这一层）。
- **模块表（seed）只有**：`react` · `react/jsx-runtime` · `react-dom` · `react-dom/client` · `@deepseek-ai/cordis` ·
  `@deepseek-ai/dsh-client-store` · `@deepseek-ai/dsh-client-ui-slots` · `@deepseek-ai/dsh-client-ui-primitives` ·
  `@deepseek-ai/dsh-client-ui-dockkit`（另有 `PRELOADED_CLIENT_EXTERNALS`，当前为空）。
  ⇒ **client 代码 import 的任何其它裸 npm 包都必须打进 bundle**（构建器 `noExternal`），否则运行期
  `require("x") missed the module table`，且**侧栏入口会静默消失**。
- `dsh.client.external`：超出基线的**精确**模块请求（可含子路径，如 `<pkg>/client`）；一行**不得声明自己**（抛）；
  图按 external 依赖排序——**被请求的行必须排在消费者之前**，出现环即抛（factory 形态 CJS 给不出部分导出）。
- `dsh.client.inject`：**信息性**（不是 cordis 服务注入）；`immediately: true`：第一阶段注册屏障（其余进共享批次）。
- **同一包名的两个不同活跃 Loader 来源 = 组合错误**（等于"两份同样的半"）。
- 样式归属：`<style data-plugin="<装载 id>" data-plugin-css="<id>/<file>">`，且**必须在 bundle 工厂执行期注入**
  （时机、幂等与判据见 [`plugin-runtime-prerequisites.md`](./plugin-runtime-prerequisites.md) 第四节）。
- 客户端包地址带 `rev`（入口产物 mtime/ctime/size 合成），宿主**只服务当前 rev**：重建后旧地址 404，靠 HMR/刷新自愈。

## 4. 生命周期：什么时候才真的生效 #lifecycle

| 改了什么 | 生效方式 |
|---|---|
| `dsh.profile.bundles` / patch / 任一清单字段 / `dist` 重建 | **重启宿主**（组合只发生在启动时；插件管理器把这类改动标 `restart-required`） |
| 客户端 bundle 内容 | HMR 通道（`plugins/events`）或刷新页面；地址 `rev` 变化即旧地址失效 |
| 宿主重启 | 现有页面的 HMR 连接被掐断，需刷新 |

## 5. 核对清单（本地 `link:` 开发形态） #checklist

1. `pnpm-workspace.yaml` 列出该包；`pnpm install` 成功——**入口里留成外部的 npm 包要能解析**（这一条最容易漏）。
2. profile `package.json`：`"<包名>": "link:<路径>"` 且 `dsh.profile.bundles` 含该包名。
3. 该包 `package.json`：`main` ＋ `exports["."]`（含 `default` 条件）＋ `exports["./client"]`（若声明 `dsh.client`）
   ＋ `dsh.bundle.patch`（**文件真实存在**）＋ `dsh.client.platform = "web"`。
4. `dist`/`lib` 已构建且**自包含**（无 workspace 裸说明符；有 `prepare` 的包在安装时会构建）。
5. **不重启即可判定**——用宿主自己的加载器复现组合：
   ```bash
   node --input-type=module -e "
   const m = await import('<dsh>/packages/boot/app-boot/lib/index.js')
   const p = m.loadProfile('dsh', '<profile 名>', '<dsh>/package.json')
   console.log('skipped:', p.skippedBundles)
   console.log('entries:', m.composeEntries([...p.layers.map(l => l.patches), p.patches])
     .filter(e => e.name === '<包名>'))
   "
   ```
6. 重启宿主后再核三处：工具面出现、HTTP 路由非 404、侧栏入口在；浏览器控制台无
   `missed the module table` / 包地址 404。

## 6. 本仓落点（dsh-pmboard） #local

| 规则 | 本仓现状 |
|---|---|
| 插件包（清单唯一事实源） | **`pm/`**（包名 `dsh-pmboard`）：`main`/`exports`（含 `default`）/`exports["./client"]`/`dsh.bundle.patch`/`dsh.client` |
| profile 依赖形态 | `"dsh-pmboard": "link:…/dsh-pmboard/pm"`（2026-10-11 起） |
| patch 层 | `pm/cordis.patch.yml`：`insert: [{ id: pmboard, name: dsh-pmboard }]` |
| 仓库根 | **private workspace 根**（`dsh-pmboard-workspace`），不持插件清单——两份清单＝两份事实源 |
| 构建 | `pm/tsdown*.config.mjs` 内联全部 workspace 组件包（`noExternal`），宿主包 `@deepseek-ai/*` 保持外部 |
| 回归锁 | `tests/plugin-manifest.test.ts`（清单 + 内联 + 「根不持清单」） |
