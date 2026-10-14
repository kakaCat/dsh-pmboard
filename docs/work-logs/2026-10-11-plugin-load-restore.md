# 2026-10-11 插件加载修复（平铺布局后的二次失效）+ 装载形态定案

## 现象

- 宿主（profile `desktop`）里看板 API 全 404（`GET /dashboard/api/reqboard/state` → 404），
  `reqboard_*` 工具面不出现 ⇒ 插件整体未装载。
- 工作树里根 `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `tsconfig.json` /
  `vitest.config.ts` 与根 `node_modules/` 全部消失（仅 `git status` 记了 5 个 `D`）。

## 根因（两条独立断链，缺一即起不来）

1. **装载层断**：装载清单（含 `dsh.bundle.patch`）所在的那份 `package.json` 消失了。
   清单没了 ⇒ 装载层读不到 patch ⇒ `skipping profile bundle "dsh-pmboard"`，patch 层不应用
   ⇒ 工具与路由全不注册。
2. **入口解析断**：`pm/dist/index.mjs` 第 9 行 `import { parse, stringify } from "yaml"`
   是静态导入（`yaml` 按设计留外部）；根 `node_modules/` 消失后 `pm/node_modules/*` 的
   `.pnpm` 链接全部悬空 ⇒ 即使清单齐全，入口 import 也 `ERR_MODULE_NOT_FOUND`。

## 第一轮修复（止血）

- 重建根 `package.json`：兼 workspace 根与插件清单（`main`/`exports`/`dsh.*` 指回 `pm/` 产物）。
- 恢复 `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `tsconfig.json` / `vitest.config.ts`（HEAD 版本），
  重跑 `pnpm install` 重建根安装树（`pm/prepare` 顺带重建 `pm/dist` + `pm/lib`）。

## 第二轮（2026-10-11 用户裁定）：装载形态定案 = `pm/` 直载

「根清单代理」只是止血，代价是**两份清单 = 两份事实源**（正是两次失效的温床）。用户裁定改为单一直载：

| 项 | 改前（止血态） | 改后（定案） |
|---|---|---|
| 装载清单唯一事实源 | 仓库根 `package.json` | **`pm/package.json`**（本就在那里） |
| profile 依赖目标 | `link:<仓库根>` | **`link:<仓库>/pm`** |
| 仓库根 | private workspace 根 + 插件清单 | **private workspace 根**（改名 `dsh-pmboard-workspace`，无 `main`/`exports`/`files`/`dsh`/运行期 deps） |
| 守卫测试 | 断言根清单 | 断言 `pm/package.json` + 断言「根不持清单」 |

落点：profile `package.json` + `pnpm-lock.yaml`（备份 `*.bak-1791678180`）、`tests/plugin-manifest.test.ts`、
`docs/architecture/workspace-packages.md#loading`、`docs/knowledge/architecture.md#loading`、`CHANGELOG.md`。

## 验证（都是实跑，不是推断）

| 检查 | 命令 / 手段 | 结果 |
|---|---|---|
| profile 安装 | 用宿主同版本 pnpm（app 内置 `runtime/pnpm/bin/pnpm.cjs` = 11.7.0，仓库自带 pnpm 是 10.x，**不可混用**否则全量重装） | `node_modules/dsh-pmboard → …/dsh-pmboard/pm`，lock importer 同步 |
| 装载层组合（真 profile） | `loadProfile('dsh','desktop',…)`（宿主 `@deepseek-ai/dsh-app-boot`） | 层 `dir = …/dsh-pmboard/pm`、`patch = …/pm/cordis.patch.yml`、`insert:[{id:pmboard}]`、不在 `skippedBundles` |
| 入口/客户端解析 | `createRequire(<profile>/package.json).resolve('dsh-pmboard'[/client])` | `pm/dist/index.mjs` / `pm/lib/client.js`（均存在） |
| 入口可加载 | `import(<entry>)` | `name='dsh-pmboard'`、`apply=function` |
| 客户端半 | `pm/lib/client.js` 头部 | 注册 id `dsh-pmboard`；裸 `require` 仅 `react`（shell seed 提供） |
| 清单 + 内联回归锁 | `npx vitest run tests/plugin-manifest.test.ts` | 全绿 |
| 分层门禁 | `npx tsx scripts/package-boundary-check.mts` | OK（20/20 包） |
| 构建 | `pnpm build`（根脚本 `pnpm --filter dsh-pmboard build` → `pm`） | 服务端 dist + 客户端 lib（含 wrap 与产物校验门禁）全绿 |
| 资产包运行期解析 | `createRequire(pm/dist).resolve('pm-templates/package.json' …)` | 解析到 `<仓库>/pm-templates`（走 `pm/node_modules` 相对链接，与仓库根位置无关） |

## 备注 / 未做

- 宿主需**重启**才会重新装载（插件管理器把这类改动一律标 `restart-required`，无热重载）。
- 插件管理器从 GitHub 装的是**仓库根**，故镜像/发布形态与本地 link 形态不是一回事：
  `scripts/sync-to-github.sh` 的 `MIRROR_OVERRIDES.WANT.entryDefault` 仍是拆分前的 `./dist/index.mjs`，
  且 rsync 排除 `dist/`+`lib/`。要走 GitHub 安装需单独裁定发布形态，别顺手改一半。
