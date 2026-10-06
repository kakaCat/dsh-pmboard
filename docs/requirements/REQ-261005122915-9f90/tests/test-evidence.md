# 测试证据（REQ-261005122915-9f90）

> 一句话：本需求 **9 个用例文件 / 70 例全绿**；对 **HEAD 基线**逐条比对，**本次新增失败 0**；
> 四条逆验证（注入旧实现）**全部如期变红**、还原后全绿。
> 原始输出在 `../evidence/` 下，命令可直接重跑（工作区根执行）。

## 〇、任务覆盖标注（covers）

covers: t-7af9da, t-a01528

`tests/rework-placeholder.test.ts`（FR-1/FR-2 判据单点）：
covers: t-7af9da

`tests/decompose-stale-rework.test.ts`（回退态收敛单一实现）：
covers: t-a01528

`tests/approved-plan-landing-rework.test.ts`（落库幂等只看真卡 + 回退态前置收敛）：
covers: t-f92ad7

`tests/reqboard/plan-landing-parity.test.ts`（既有 parity，锁落库层无回归）：
covers: t-f92ad7

`tests/reqboard/board-plan-approve.test.ts`（两条批准路径推进判据）：
covers: t-a31e2a

`tests/rollback-tasks.test.ts` + `tests/rollback-materialize.test.ts`（占位卡取消而非复位）：
covers: t-9a8894

`tests/client-rollback-cleanup.test.ts` + `tests/rollback-cleanup.test.ts`（看板清场入口与回执）：
covers: t-661b0f

`scripts/rework-inverse-verification.mts` + `scripts/rollback-landing-replay.mts`（逆验证与现场复演）：
covers: t-a1a67b

`../notes/compat-check.md`（兼容与存量核对、既有红归因）：
covers: t-fa6136

## 一、本需求的用例矩阵（9 文件 / 70 例）

| 用例文件 | 例数 | 覆盖 |
|---|---|---|
| `tests/rework-placeholder.test.ts` | 8 | FR-1/FR-2：占位卡判据单点（占位/canceled 不进真卡、空串与缺键非占位、纯函数、只有占位卡时真卡为 0） |
| `tests/decompose-stale-rework.test.ts` | 4 | FR-2：回退态收敛（全取消 + rollback 修订、无候选零写入、已取消不重复留痕、跨需求不误伤） |
| `tests/approved-plan-landing-rework.test.ts` | 5 | FR-1/FR-2：**核心判据**（占位卡不再冒充已落库、3b02 现场形态、连调幂等、非回退态仍拒重复拆分） |
| `tests/rollback-tasks.test.ts` | 10 | FR-4：占位卡不得被复位（第二轮回退保持 canceled、不产生重做卡的重做卡、真子卡仍复位不误伤） |
| `tests/rollback-materialize.test.ts` | 10 | 回退物化既有性质 + 净增为 0（按新语义改准）+ 批量清理整链 |
| `tests/rollback-cleanup.test.ts` | 12 | FR-5 服务端：清场两条匹配路径、幂等、不碰 done 卡、逐条 skipped |
| `tests/client-rollback-cleanup.test.ts` | 6 | FR-5 客户端：有回退记录才渲染且 `data-seq` 正确、无记录不渲染、终态只读、打点与 body、服务端拒绝原样抛出 |
| `tests/reqboard/board-plan-approve.test.ts` | 8 | FR-1/FR-3：看板批准落库 + 幂等回执 + 覆盖缺口不推进 + **只剩占位卡先收再落再推进** + **空计划拒绝推进** |
| `tests/reqboard/plan-landing-parity.test.ts` | 7 | 既有 parity（无落点卡不拖垮整批）——**回归锁定，本次零改动** |

命令与结果：

```
npx vitest run <上表 9 个文件>
  Test Files  9 passed (9)
  Tests  70 passed (70)
```

原始输出：`../evidence/tests-9-suites.txt`。

## 二、逆验证（「测试是否钉在修复上」）

```
node --import tsx/esm scripts/rework-inverse-verification.mts
[A · FR-1 判据回退] 注入=红（✅ 如期） 还原=绿（✅ 如期）
[B · FR-2 收敛缺席] 注入=红（✅ 如期） 还原=绿（✅ 如期）
[C · FR-4 占位卡复位] 注入=红（✅ 如期） 还原=绿（✅ 如期）
[D · FR-3 无条件推进] 注入=红（✅ 如期） 还原=绿（✅ 如期）
退出码 0
```

留档：`../notes/inverse-verification.md`。脚本每处注入都用 `try/finally` 还原并按内容哈希复核
（还原失败即抛，不留半改的仓库）。

**首轮暴露的测试盲区（已修）**：只回退 FR-1 判据时测试仍绿——因为 FR-2 的收敛在回退态下先一步把占位卡收掉了。
⇒ 补了一条**只有 FR-1 能挡**的用例（3b02 现场形态：状态已越过回退、占位卡还活着）。

## 三、全量套件与基线对比（新增失败 0）

| 观测 | 读数 |
|---|---|
| `git worktree add /tmp/pmb-head HEAD` + 全量套件（同口径过滤） | 失败项 **125** |
| 当前工作区全量套件（同口径） | 失败项 **105** |
| 工作区相对 HEAD 新增的失败文件 | 仅 `apply-wiring` / `move-rollback` 两个 |
| **定点归因**：临时把本次改动的 7 个文件还原到 HEAD 后重跑这两个文件 | **仍然失败** ⇒ 与本次无关（根因是工作区里别的窗口对 `category-doc-sets.ts`/`support.ts`/`ports.ts`/`MoveRequirement.ts` 的未提交改动） |
| **定点归因**：`tests/decompose-tools.test.ts` 在还原态与本次态 | 均为 `5 failed / 25 passed` ⇒ **逐条一致** |

逐条读数与归因方法：`../notes/compat-check.md` §4。

## 四、类型检查与构建

```
pnpm typecheck        → 零输出（全绿）          原始输出：../evidence/typecheck.txt
pnpm build            → 构建通过；verify-client OK
                        lib/client.js 含 rollback-cleanup 与「清理误物化重做卡」文案
                        dist/index.mjs 含 staleReworkCanceled / liveRealCards
```

## 五、现场复演（REQ-261005105032-3b02）

```
node --import tsx/esm scripts/rollback-landing-replay.mts
  需求状态 implementing · 已批准计划 23 张
  队列 73 张 = canceled 26 + 活卡 47（父卡 23 + 子卡 24）
  活卡·真卡 47 · 活卡·占位重做卡 0 · 与计划已对齐
  执行进度：done 66 / in_progress 2 / todo 13（后续复核读数）
```

授权代跑清场入口两次：`canceled = 0`、`matchedBy = reworkOf+title-prefix` ⇒ **两次都是空操作**
（现场已被 peer 窗口解开，无残留可清）。详见 `../verification.md` §四之二。
