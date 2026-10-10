# 测试用例（REQ-261009174713-7bc8 重构）

本需求是**结构性重构**，判据以「等价性」为主；测试面分四层，逐条如下。

## A. 结构判据（新增/沿用）

| 编号 | 用例 | 判据 |
|---|---|---|
| A-1 | 19 包骨架 | `ls packages \| wc -l == 19`；每包含 `package.json`(private+exports src)/`tsconfig.json`/`README.md`/`tests/` |
| A-2 | 分层声明面 | `node scripts/package-boundary-check.mts` → exit 0（19 包声明白名单） |
| A-3 | 分层使用面（四类越界） | 夹具逐类非零退出并点中 `layer-declaration`/`undeclared-import`/`cross-dir-import`/`asset-import` |
| A-4 | 类型契约 | `npx vitest run packages/pmboard-type-kit/tests` → 10/10；缺字段装配期即抛 |
| A-5 | 六类型规格 | 六包各 4 例（共 34 例）全绿；`category` 集合 == 六类 |
| A-6 | 规格快照 | `tests/type-spec-snapshot.test.ts` 5/5；注入一节即红（非空转） |

## B. 等价性判据（五类迁移基线）

| 类别 | 判据 | 实测 |
|---|---|---|
| 宿主可见面 | `dist` 导出名单与基线逐字一致 | 8 项一致 ✓ |
| 工具面 | 19 工具名逐字一致 + `schemaHash` 一致 | 19/19 ✓（哈希为布局无关投影） |
| 判据面 | 六类型规格快照一致 | 6=6 ✓ |
| 资产面 | 资产清单与基线逐字一致 | 212=212 ✓ |
| 测试面 | 用例总数 ≥ 基线(7197) 且失败集 ⊆ 基线清单 | 7268 ≥ 7197 ✓、失败集 ⊆ ✓ |

## C. 纯搬迁的字节判据

| 对象 | 判据 | 实测 |
|---|---|---|
| RTM 引擎 | 与 git 原始 blob 逐一 sha256 | 28/28 相同 ✓ |
| 三个资产包 | 同上 | 302/302 相同 ✓ |
| 测试随包迁移 | 文件守恒（617 + 8 = 625）与用例守恒 | 546 进包 / 79 留根 ✓ |

## D. 回归与门禁

| 编号 | 命令 | 判据 |
|---|---|---|
| D-1 | `npx tsc --noEmit` | exit 0 |
| D-2 | `pnpm test` | 用例 ≥ 基线且失败集 ⊆ 清单（7268 / 失败 19） |
| D-3 | `pnpm prompts:check` | exit 0（探针缺口 0） |
| D-4 | `pnpm kb:check` | exit 0（14/14） |
| D-5 | `pnpm templates:check` | exit 0（6 类双向一致） |
| D-6 | `pnpm build` / `pnpm build:client` | exit 0；`verify-client-build` OK bundle=764536 |

> 口径备注：本仓 `baseline:check` 在改造前即红（记录陈旧），故 D-2 采用**用例级集合差**口径；跨搬迁比较集合时键按 `basename` 归一（否则「两态都失败」会被误判为新增）。
