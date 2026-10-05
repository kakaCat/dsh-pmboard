# 测试证据 · REQ-261004174324-4195（知识层自动自举）

> **TL;DR**：本需求新增 **5 套用例 / 43 条**（另删 1 套 4 条旧用例），全部命令可复跑，原始输出留档 `evidence/`。
> 与改动前同窗口基线对比：**失败 97 → 97（零新增失败）**，通过 4276 → 4320（新增全绿）。

## 一、用例（`npx vitest run <file>`）

| 套件 | 条数 | 覆盖什么 | 结果 |
|---|---|---|---|
| `tests/kb-generate.test.ts` | 13 | 领域纯函数：抽取口径、签名截断、模块分组、库内口径对齐、**符号归属回归锁**、INDEX 骨架与两类结构异常 | ✅ |
| `tests/kb-ensure.test.ts` | 11 | 自举用例四态：空根生成 5 产物 / 二次零读零写 / 手写保护 / 半残只补缺件 / markers-missing 零写入 / 只读失败不抛 / 根漂移中止 | ✅ |
| `tests/kb-bootstrap-hooks.test.ts` | 9 | 宿主接线：三处通知点、同根并发只跑一次、失败不重试、开关三态、非布尔装配期抛错 | ✅ |
| `tests/kb-cli-parity.test.ts` | 2 | CLI 与用例同源（产物逐字节相等）+ `--check` 退 1 / 补写后回 0 | ✅ |
| `tests/kb-bootstrap-compat.test.ts` | 8 | 迁移与回退：三态开关、影子副本零写入（内容与 mtime）、两种读根不跨根写、关自举后手动路径仍可用 | ✅ |
| 删除 | −4 | `tests/kb-client-page.test.ts` 随知识库页一并删除（入口已不存在，复活即失败于 grep 零命中锚点） | — |
| 既有回归（抽样） | 79 | `kb-route` / `kb-repository` / `client-page-register` / `client-page-panel` / `client-view` 全绿 | ✅ 零回归 |

## 二、门禁与命令（命令 + 期望 + 留档）

| 命令 | 期望 | 实测 | 留档 |
|---|---|---|---|
| `pnpm build` | host + client 均出新产物，退出码 0 | exit=0 | `evidence/gates.txt` |
| `pnpm build:client` | `[verify-client] OK`（关键符号 / 样式归属章 / CSS 分片） | OK，bundle=388364 bytes | `evidence/t5-delete.txt` |
| `pnpm test` | 失败数 ≤ C-14 基线 106 | 97 failed / 4320 passed | `evidence/baseline.txt`、`evidence/gates.txt` |
| `npx tsc --noEmit` | 错误数 ≤ C-15 基线 223 | 152（新增文件 0 条） | `evidence/gates.txt` |
| `npx tsx scripts/kb-build.mts --check` | 退出码 0（零漂移） | exit=0 | `evidence/kb-check.txt`（改动前为红：`kb-check-baseline.txt`） |
| `grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS\|registerKnowledgePage" src/ scripts/ tests/` | 零命中 | exit=1（无输出） | `evidence/grep-deleted.txt` |
| `grep -c 'dsh-pm-kb' lib/client.js` | 0（产物内无残留样式） | 0 | `evidence/grep-deleted.txt` |
| `npx tsx scripts/kb-build.mts --write --root <mktemp 空项目>` | 5 产物齐备 | 5 份（INDEX 44 行） | `evidence/e2e-bootstrap.txt` |
| 同项目二次运行 | 全部 `[skip]` + mtime 不变 | 一致 | `evidence/e2e-idempotent.txt` |
| 手写 `architecture.md` + INDEX 手写行后强制重算 | 逐字保留 | 保留 | `evidence/manual-protect.txt` |

## 三、端到端场景（真实临时项目）

1. **空项目首次自举**：`mktemp -d` → `--write --root` → 生成 `INDEX.md` / `code-map.md` / `code-map.symbols.tsv` / `design-tokens.md` / `design-tokens.classes.tsv`，退出码 0。
2. **幂等**：紧接再跑一次 → 五份全部 `[skip]`，`stat` 逐个比对 mtime 完全一致。
3. **手写保护**：写入 `architecture.md` 与 INDEX 手写摘要行 → 强制重算后两者逐字不变。
4. **删除面**：源码零命中；客户端产物内 `dsh-pm-kb` 计数 0。

## 四、落地过程中发现并修的缺陷（响亮声明）

| # | 症状 | 处置 | 证据 |
|---|---|---|---|
| 1 | 旧生成脚本 `rel` 排序而 `abs` 未排序 → `code-map.symbols.tsv` 的 file 列与符号**整体错配一行**（`src/client/styles.ts` 被记成定义 `BASE_CSS`） | 纯函数按 path 一致配对；加回归锁；首次重跑生成物随之修正 | `tests/kb-generate.test.ts`「符号归属到真实定义它的文件」 |
| 2 | 按会话根自举时，用例按 `docs.workspaceRoot()` 写盘 → 会把知识层生成到**插件宿主目录**（`~/.dsh/profiles/<profile>`）而非用户项目 | 协调器增加 `docsFor(root)` 根绑定仓储；取不到则跳过并记日志（绝不退回共享仓储硬写） | `evidence/t6-compat.txt`、`tests/kb-bootstrap-compat.test.ts` |
| 3 | 本需求实现期引入的一处回归：索引已存在时 `--write` 不再刷新 INDEX 生成区（旧脚本每次都刷） | 补回（仍只动生成区、不碰手写行） | `evidence/t3-cli.txt` |

## 五、已知边界（不承诺的部分）

| 项 | 说明 |
|---|---|
| 冷启动问答质量 | 自举产出的是**骨架**：架构/规范/术语仍是「待写」，本需求不承诺新项目立刻能答架构问题 |
| 符号链接同项目 | 根的归一用纯字符串（application 层不许碰 fs），符号链接指向同一项目可能被算成两个键 → 最坏结果是重复跑一次内容比对的幂等写 |
| 跨进程互斥 | 多个宿主实例可能各跑一次；写入是内容比对后的幂等覆盖，最坏结果是重复写同内容 |
| 真实 GUI 截图 | 删除面以「源码零命中 + 产物内样式计数 0 + 注册单测」为准；侧栏外观请人在 http://127.0.0.1:19387 刷新后目视确认 |

## 六、任务覆盖（covers 对照）

> 门禁按 `covers: t-xxx` 逐卡核验测试覆盖；下表每行即一条标注。

- covers: t-87e952 · t1 领域生成器（父卡） → tests/kb-generate.test.ts 13 条
- covers: t-b45cfb · t1·研发 → tests/kb-generate.test.ts
- covers: t-377ab6 · t1·联调 → evidence/t1-integrate-smoke.txt（外部消费冒烟）
- covers: t-7df1d8 · t1·复核 → reviews/t1-review.md、evidence/t1-review-boundary.txt
- covers: t-8d270d · t1·测试 → knowledge 套件 83 条（82 绿，1 既有基线）
- covers: t-768db3 · t2 自举用例（父卡） → tests/kb-ensure.test.ts 11 条
- covers: t-93c308 · t2·研发 → tests/kb-ensure.test.ts
- covers: t-e38382 · t2·联调 → evidence/t2-integrate.txt（真文件系统 mtime 不变）
- covers: t-7b7398 · t2·复核 → 边界冲突裁定与偏离留痕（卡文档汇报）
- covers: t-ff79f1 · t2·测试 → evidence/baseline.txt
- covers: t-872d22 · t3 CLI 薄包装（父卡） → tests/kb-cli-parity.test.ts 2 条
- covers: t-ebc17e · t3·研发 → tests/kb-cli-parity.test.ts
- covers: t-e9dc15 · t3·联调 → evidence/t3-cli.txt（本仓 --write/--check 实跑）
- covers: t-aae371 · t3·复核 → 四处偏离留痕（卡文档汇报）
- covers: t-9fbbc6 · t3·测试 → evidence/t3-cli.txt
- covers: t-a74f54 · t4 宿主接线（父卡） → tests/kb-bootstrap-hooks.test.ts 9 条
- covers: t-15c9a6 · t4·研发 → tests/kb-bootstrap-hooks.test.ts
- covers: t-a0a37b · t4·联调 → evidence/t4-hooks.txt（公开入口触发验证）
- covers: t-5322fe · t4·复核 → 四处偏离留痕（含 legacy-cwd 门）
- covers: t-794841 · t4·测试 → evidence/t4-hooks.txt + tsc 152 ≤ 223
- covers: t-be4f48 · t5 删除面（父卡） → evidence/t5-delete.txt、grep-deleted.txt
- covers: t-c7e9dc · t5·研发 → grep 零命中锚点
- covers: t-a47379 · t5·联调 → pnpm build:client OK + 产物内 dsh-pm-kb = 0
- covers: t-d1021a · t5·复核 → 保留面核验（kb-route / kb-repository 全绿）
- covers: t-800d17 · t5·测试 → 修订后锚点逐条满足（evidence/t5-delete.txt）
- covers: t-a734f8 · t6 兼容与回退（父卡） → tests/kb-bootstrap-compat.test.ts 8 条
- covers: t-ba8bd1 · t6·研发 → tests/kb-bootstrap-compat.test.ts
- covers: t-274dc8 · t6·复核 → evidence/t6-compat.txt（两种读根 + 回退路径）
- covers: t-91c312 · t6·测试 → evidence/kb-check.txt（exit 0 零漂移）
- covers: t-54841e · t7 端到端（父卡） → evidence/gates.txt + 4 份 e2e 证据
- covers: t-2c1d91 · t7·演练 → evidence/e2e-bootstrap.txt、e2e-idempotent.txt、manual-protect.txt
- covers: t-b27618 · t7·复核 → 验收锚点逐条对回（evidence/gates.txt）
- covers: t-fb431f · t7·测试 → evidence/gates.txt（四门禁汇总）
