# 测试证据（REQ-261006201508-5cb6 · 2026-10-06）

## 环境

> 采集时间：2026-10-06 20:53 · HEAD `d0f01d6`
> 本需求改动面：`README.md | 82 +++---`、`package.json | 2 +-`、`src/index.ts | 8 ++-`、`src/tools/index.ts | 11 ++-`
> （4 files changed, 75 insertions(+), 28 deletions(-)）+ 新增 `tests/readme-tool-face.test.ts`(125) / `tests/registry-log.test.ts`(110)
>
> **同刻工作树指纹（必须一起读）**：`git status --short` 共 **156 条**脏条目——本仓多窗口共用工作树，
> 采集期内有另一处未提交改动在并发写入（同一批命令前后几次读到的报错文件各不相同，见「失败与未跑项」）。
> 因此本表的「本需求读数」可复现，而「全仓读数」只代表 20:53 这一刻。

## 跑了什么

```bash
npx vitest run tests/readme-tool-face.test.ts tests/registry-log.test.ts
npx vitest run tests/apply-wiring.test.ts tests/tools-dispatch.test.ts tests/output-contract.test.ts
pnpm test                     # 全量（含外部在制改动）
npx tsc --noEmit -p tsconfig.json
grep -c '^| `reqboard_' README.md
comm -13 <(grep -o '`reqboard_[a-z_]*`' README.md | tr -d '`' | sort -u) \
         <(grep -o "toolName: 'reqboard_[a-z_]*'" src/tools/registry.ts | grep -o 'reqboard_[a-z_]*' | sort -u)
comm -23 <(同上两条)          # 反向差集
grep -c 'reqboard_advance' README.md
grep -c '13 个\|21 个' README.md package.json
```

## 结果摘要

| 命令 | 读数 |
|---|---|
| 两条新用例 | `Test Files 2 passed (2)` / `Tests 8 passed (8)` |
| `apply-wiring` + `tools-dispatch` | `Tests 11 passed (11)` |
| `output-contract` | `42 条中 1 条红`（外部在制改动，见下） |
| README 表内工具行数 | `27` |
| README ↔ 登记面 双向差集 | 两条命令均**无输出**（0 条） |
| `grep -c reqboard_advance README.md` | `0` |
| `grep -c '13 个\|21 个' README.md package.json` | `0` / `0`；「27 个」README 3 次、package.json 1 次 |
| `pnpm test`（全量） | `Test Files 45 failed / 490 passed / 3 skipped`、`Tests 82 failed / 6234 passed`（逐条归属见下） |
| `npx tsc --noEmit` | `3` 处错误，全在外部在制文件；本需求 6 个文件 0 处 |

## 覆盖与对照

> 编号口径：本需求的用例编号沿用 `design/test-cases.md` 的 **T-x**（该设计文档未使用 TC-x）。
> `covers:` 标注按覆盖度门禁口径**逐卡给全**：4 张父卡 + 10 张子卡 = 14 条，全部由下面两张新用例承担。

| 验收标准 | 用例 | covers（任务） | 对应测试 | 结果 |
|---|---|---|---|---|
| README 表与登记面逐条对齐（27 行 / 双向差集空 / 无幽灵名） | T-1, T-2, T-4, T-5 | covers: t-2cf2af covers: t-609b14 covers: t-69202f | `npx vitest run tests/readme-tool-face.test.ts` | ✅ 5 passed |
| README 与 package.json 的计数口径归一到 27 | T-2, T-3, T-8 | covers: t-2cf2af covers: t-609b14 | 同上 + `grep -c '13 个\|21 个'` | ✅ 0 命中 |
| README 守卫用例本身（含两条故障注入） | T-1 ~ T-6 | covers: t-a4da76 covers: t-545020 covers: t-ffd628 covers: t-ea8989 | `npx vitest run tests/readme-tool-face.test.ts` | ✅ 5 passed |
| 注册日志的 N 与名单从登记面派生 | T-7 | covers: t-185fe6 covers: t-4494d0 covers: t-1a20d3 | `npx vitest run tests/registry-log.test.ts` | ✅ 3 passed |
| 日志守卫用例本身（含故障注入） | T-7 | covers: t-256bec covers: t-12da46 covers: t-b33784 covers: t-b6c809 | 同上 | ✅ 3 passed |
| 全仓不残留矛盾计数 | T-8 | covers: t-2cf2af covers: t-185fe6 | `grep -rn '13 个\|21 个\|13 → 9' README.md package.json src/tools/index.ts` | ✅ 无输出 |
| 类型检查 / 全量回归 | T-9, T-10 | covers: t-2cf2af covers: t-185fe6 covers: t-a4da76 covers: t-256bec | `npx tsc --noEmit` / `pnpm test` | ❌ 见下（外部在制改动，非本需求） |
| 既有工具面门禁不被破坏 | T-10 | covers: t-2cf2af covers: t-185fe6 | `apply-wiring` + `tools-dispatch` | ✅ 11 passed |

**14 张卡的 covers 对照**（逐条点数，便于复核不漏）：`t-2cf2af` / `t-609b14` / `t-69202f`（README 与计数）、
`t-185fe6` / `t-4494d0` / `t-1a20d3`（日志派生）、`t-a4da76` / `t-545020` / `t-ffd628` / `t-ea8989`（README 守卫）、
`t-256bec` / `t-12da46` / `t-b33784` / `t-b6c809`（日志守卫）——14/14，无遗漏。

## 失败与未跑项

| 项 | 状态 | 处置 |
|---|---|---|
| `tests/output-contract.test.ts` → `archive_submit（含 unlisted_files 警告路径）` | 失败（外部） | 报错为「说明书更新点的 path 必须是路径#锚点形态」，属归档材料校验的在制改动；同刻 `tsc` 报 `src/application/use-cases/SubmitArchive.ts:206 Cannot find name 'manualUpdateLabelOf'`，明证该文件正在被编辑。**本需求不认领、不改动** |
| `pnpm test` 的 82 条红（45 文件） | 失败（外部） | 逐条归属核查：失败消息点名的文件均为外部在制改动（`src/client/views/report-band.ts`、`report-head.ts`、`tests/helpers/tool-deps.ts` 等）；`query-report` 那条是 `chainMissing` 任务形状；`zero-arg-binding` 三条是「向上找不到含 `pnpm.patchedDependencies` 的仓库根」——当前与 HEAD 两版 `package.json` 都不含该键，故预先就红。**本需求改动面在失败消息中一次都没出现** |
| `npx tsc --noEmit` 的 3 处错误 | 失败（外部） | 全在 `SubmitArchive.ts` / `client/views/panels/docs.ts` / `tests/helpers/tool-deps.ts`；本需求 6 个文件零错误 |
| T-11「README 表可读性人评审」 | 未跑（人看） | 属人工判据：验收人打开 README「提供的工具」一节看 27 行 / 6 组 / 描述是否可信。agent 不代替人判 |

## 故障注入

三条逆验证都**实测到红**（不是"应该会红"），且每条都用 `md5` 校验还原为逐字节一致，随后复绿：

| 注入 | 期望 | 实测读数 |
|---|---|---|
| 删掉 README 里 `reqboard_kb` 那一行 | 红且点名 | `表内缺行：reqboard_kb（登记面有这张卡，表里没有）`；还原后 `5 passed` |
| 在 README 加一行幽灵工具 `reqboard_advance` | 红且点名 | `README 多：reqboard_advance` + `表内多行：reqboard_advance`；还原后 `5 passed` |
| 把 `src/index.ts` 注册日志改回字面量 `(13)` + 2 个名 | 红且点名 | `日志写 13 个 / 登记面 27 条` + 点名 25 个缺失工具；还原后 `3 passed` |

还原保真度：三次注入后 `md5 -q` 与注入前一致（README `2d3a5028…`、`src/index.ts` `d828408c…`）。
