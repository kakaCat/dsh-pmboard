# 实施证据（REQ-261006164732-6503 t11 · t13 增补）

> serves: FR-6。汇总四门回归矩阵、三条「改坏必红」反向演练、全量基线差集与类型检查，并给出**归属**。
> 采集时间：2026-10-06 18:06–18:50（本机）。工作树指纹：HEAD `917b39d`，含未跟踪 483 个改动
> ——**同一工作区另有窗口在并发改动**（见第 4 节归属），故每条证据都标注归属。
> **t13 增补**：验收阶段的独立评审（`reviews/independent-review.md`）报了 2 条阻断 + 5 条重要发现，
> 整改与复测记录见文末第 6 节。

## 0. t13 整改后读数（最新）

| 项 | 读数 |
|---|---|
| 定向广度复跑（22 套件） | **231 passed / 0 failed** |
| `npx tsc --noEmit -p tsconfig.json` | 1 条错误，指向 `src/client/views/panels/verify.ts:36`（他人改动面），本需求改动零类型错误 |
| `node scripts/check-prompt-fragments.mjs` | exit 0（片段 ↔ 生成物一致） |
| `pnpm baseline:check` | 见第 6 节（整改后重跑） |

## 1. 四门回归矩阵（G1~G4）

```bash
npx vitest run tests/confirm-advance-deadlock.test.ts tests/ask-confirm-blocking.test.ts \
               tests/verification-no-second-gate.test.ts tests/verification-sheet.test.ts \
               tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts \
               tests/gate-request-uniqueness.test.ts tests/confirm-settle-preconditions.test.ts \
               tests/stale-answer-background.test.ts
```

结果：**9 套件 79 例全绿**。四门各自的落点：

| 门 | 正例 | 反例（守卫/早退） |
|---|---|---|
| G1 需求 | `ask-confirm-blocking` / `ask-confirm-pending`：首次请求照旧弹、肯定照旧落章并推进 | 门未答时 `reqboard_submit` 被 `REQBOARD_CONFIRM_PENDING` 拦（`confirm-pending-guard`） |
| G2 设计 | `ask-confirm-blocking` TC-10b：异门清理后新门在场 | 设计未确认时推进被内容门拒（`confirm-advance-deadlock` TC-2） |
| G3 拆分 | `gate-request-uniqueness` 联调例：自动弹建门 → agent 再请求 ⇒ 复用同一张票 | 未批准时 `reqboard_decompose` 被拒（既有用例） |
| G4 验收 | `verification-no-second-gate`：首次提交自动触发 | 门未答时第二次提交被守卫拦（同文件）；`blockers` 存在时不建门 |

## 2. 三条「改坏必红」反向演练

每条都做了「注入改坏 → 跑用例 → 记录必红 → **逐字节还原** → 复跑回绿」（`diff -q` 验证还原）。

| # | 改坏点 | 必红用例 | 结果 |
|---|---|---|---|
| 1 | `gate-request.ts` 删掉 `reused` 分支（忽略在途门，照旧登记新票） | `gate-request-uniqueness` U1/U2/U5 + 判定序口径 | **4 例真红**（`expected 'opened' to be 'reused'`、票表计数 3≠1） |
| 2 | `gate-request.ts` 删掉异门陈旧票清理 | `ask-confirm-blocking` TC-10b | **真红**（旧票 `outcome` 为 undefined） |
| 3 | `confirm-settle.ts` 去掉「首写不变」（改回无条件赋值） | `confirm-settle-preconditions` 部分落章用例 | **真红**（已盖过的产物被改写成新时间戳） |

探针自证：`npx tsx scripts/gate-inflight-probe.mts` → exit 0；把探针依赖的复用分支改坏后 → exit 1 并点名 A1/A2。

## 3. 全量基线与类型检查

```bash
pnpm baseline:check      # [基线] 本次失败 67 条 · 基线 68 条 · 新增失败 6 / 不再失败 7
npx tsc --noEmit -p tsconfig.json   # error TS 1 条
```

**修复前**：新增失败 12 条 → **修复后**：新增失败 6 条。被我修掉的 7 条及其原因：

| 修复前新增失败 | 原因 | 处置 |
|---|---|---|
| `ask-confirm.test.ts` ×1（target=plan 用例） | 我的 `onSourceStage` 判据过窄，误杀「设计阶段批准计划」这条受用例保护的既有路径 | 改成「门守的那次迁移是否已发生」 |
| `dive-gate-prompt.test.ts` ×3（TC-15） | 同上：`gateOpen` 判据误杀「已落章未推进 ⇒ 补推进」（REQ-261006094052-1da2 刻意修好的路径） | 收窄成只看迁移是否已发生（`gateOpen` 降为信息字段） |
| `prompt-baseline.test.ts` ×3（decomposing/light、decomposing/heavy、brainstorming/heavy） | t8 改了片段文本，P1 基线快照未同步 | 按脚本既定口径重跑 `node scripts/dump-stage-prompts.mjs`（diff 即变更留痕） |

## 4. 剩余 6 条新增失败的归属（均非本需求）

| 失败 | 归属依据 |
|---|---|
| `typecheck.test.ts`：src 与 tests 下 0 个类型错误 | `npx tsc --noEmit` 仅 1 条错误，指向 `src/client/views/panels/verify.ts`（18:01:36 由**另一窗口**改动，相对路径少一层：`../../../vendor/…`）；本需求 12 张卡改动**零类型错误** |
| `report-tabs.test.ts` ×2（验收面板占位/取数接线） | 同在 `src/client/views/panels/` 面板层——与上面同源 |
| `live-tasks-single-source.test.ts` ×2（单源扫描的新增即红/删条目即红） | 扫描对象是**他人新写的手写命中**；本需求未新增任何"任务单一来源"相关代码 |
| `kb-generate.test.ts` ×1（renderCodeMap 口径） | 知识层生成器（`scripts/kb-*`、`vendor/reqboard/src/rtm/**`）在并发窗口的改动面内 |
| `client-view.test.ts` ×3（拆分计划卡面徽章 / 验收区与归档区） | **该测试文件的 import 与本需求 17 个改动源文件零交集**（实测 grep）；mtime 17:20:46 属并发窗口那批测试改动 |

**判据**：这些失败涉及的模块与本需求 17 个改动源文件**无交集**；且第 1/2 条互相印证（同一个 `verify.ts`）。

**t13 最终读数**：`pnpm baseline:check` → 新增失败 **9 条**（client-view 3 / live-tasks-single-source 2 / report-tabs 2 / kb-generate 1 / typecheck 1），
**全部落在并发窗口改动面**；本需求整改过程中自己引入的 3 处副作用（prompt-tiers 1 / tools-dispatch 1 / stage-prompts 3）
已全部修掉（见第 6.3 节）。

## 4b. 最终 19 套件复跑（213 通过 / 2 失败）的逐条归属

```bash
npx vitest run tests/gate-request-uniqueness.test.ts tests/confirm-settle-preconditions.test.ts \
               tests/stale-answer-background.test.ts tests/auto-confirm-no-second-gate.test.ts \
               tests/verification-no-second-gate.test.ts tests/prompt-conditional-gate.test.ts \
               tests/pending-confirm-registry-findopen.test.ts tests/ask-confirm-pending.test.ts \
               tests/ask-confirm-blocking.test.ts tests/pending-guard.test.ts \
               tests/pending-guard-integration.test.ts tests/confirm-pending-guard.test.ts \
               tests/status-pending-confirm.test.ts tests/confirm-advance-deadlock.test.ts \
               tests/dive-gate-prompt.test.ts tests/ask-confirm.test.ts \
               tests/prompt-baseline.test.ts tests/stage-prompts.test.ts tests/output-contract.test.ts
# → 18 套件通过 / 1 套件失败；213 passed / 2 failed
```

失败的 2 例都在 `tests/dive-gate-prompt.test.ts`，归属依据（三条独立证据）：

| 证据 | 读数 |
|---|---|
| 该测试文件 mtime | **17:20:46** —— 与并发窗口那批测试改动同一分钟（同日 `receive-mark.test.ts` 也是这一刻） |
| 它依赖的驱动 mtime | `src/application/dive/round-driver.ts` **17:55:22**（并发窗口在本次实施期间改动） |
| 代码注释与用例期望冲突 | `src/application/dive/gate-prompt.ts` 明写「deliver 已删除：Dive 模式下降级时只记录日志，不投递」，而用例仍断言 `deliveries` 长度为 1——**该区正在被并发改动**，本需求未触碰这 4 个文件 |

**判据**：本需求改动面（`gate-request.ts` / `PendingConfirmRegistry.ts` / `auto-confirm.ts` / `AskConfirm.ts` /
`SubmitVerification.ts` / `confirm-settle.ts` / `pending-confirm.ts` / `pending-guard.ts` / `SubmitArtifact.ts` /
`capture-section.ts` / 3 份片段 + 产物 + 文案）与上述 4 个文件**无交集**；
且同文件的首条用例（TC-15 门已满足未推进 → 同意 → 推进）在本需求修复后**由红转绿**，反证该文件的其余用例与我的改动无关。

## 5. 复现方式（一条命令）

```bash
npx vitest run tests/gate-request-uniqueness.test.ts tests/confirm-settle-preconditions.test.ts \
               tests/stale-answer-background.test.ts tests/ask-confirm-pending.test.ts \
               tests/pending-guard.test.ts tests/pending-guard-integration.test.ts
npx tsx scripts/gate-inflight-probe.mts
```

## 6. t13：验收阶段独立评审的整改与复测

评审报告：[`reviews/independent-review.md`](../reviews/independent-review.md)（独立子代理只读评审，未改任何文件）。
它报了 **2 条阻断 + 5 条重要 + 5 条次要**；本节的每一条都给出「改了什么 / 怎么证」或「为什么没改」。

### 6.1 阻断项整改（各带承重用例 + 反向演练）

| 阻断 | 整改 | 承重用例 | 反向演练（改坏必红） |
|---|---|---|---|
| 门合并块无首写守卫 | 该块改用共用单点 `stampArtifactOnce`，「门合并」评论只在真的盖上时才写 | `confirm-settle-preconditions`：「门合并块（章已落 + 迁移未发生）⇒ 产物不被覆写」 | 恢复无条件赋值 ⇒ 该例红（`expected 999 to be 9`）；`diff -q` 逐字节还原后复跑绿 |
| 文字证据路径无守卫 | `ConfirmArtifact.ts` 改用 `stampArtifactOnce` / `stampPlanOnce`，评论只在真的盖上时才写 | `confirm-group`：「已落章的产物再走文字证据 ⇒ 时间戳与证据原文逐字不变、不再多写评论」 | 恢复无条件赋值 ⇒ 该例红（`expected '迟到的第二次文字确认' to be '第一次确认的原话'`）；还原后绿 |

**同源判据单点**：新增 `gateStaleReason` / `stampArtifactOnce` / `stampPlanOnce`（`confirm-settle.ts`），
四处写点（会话弹框主落章 / 门合并块 / 文字证据 / 看板）全部调用它——复核原话是「否则 FR-4 只兑现了 1/5 的写点」。

### 6.2 重要项处置

| # | 处置 | 证据 |
|---|---|---|
| 3 设计文档与实现口径不一致 | **未改已确认文档**，改在 `notes/execution-decisions.md` 落执行期偏差；设计原文的更新列为后续动作 | 同目录 `notes/execution-decisions.md` §1 |
| 4 `adopted_ticket` 可从工具面注入 | 工具边界就地 `delete args.adopted_ticket`（变量名仍叫 `args`，保持被静态断言钉住的分派形状） | 新增用例「工具面注入 adopted_ticket 无效」：`get('pc-forged')` 为 undefined |
| 5 FR-3 判据 3 的回执文案断言缺失 | **未补**（需驱动 plan 提交整链）；如实登记为未覆盖项 | `notes/execution-decisions.md` §5 |
| 6 G4 的 `reused` 分支零覆盖 | 新增 G4 专用用例：`kind=verification` 首请求 `opened`、再请求 `reused`（同一张票、票表不新增、只投递一次） | `gate-request-uniqueness.test.ts` |
| 7 Dive 弹框是第 6 条通道 | **本次不越界改**（该文件与 dive 驱动正被另一窗口改动）；登记为已知例外 | `notes/execution-decisions.md` §3 |

### 6.3 整改过程中**我自己引入并当场修掉**的两处（如实记账）

| 副作用 | 发现方式 | 处置 |
|---|---|---|
| `decomposing/light.md` 加了句子后 **2528 > 2500 字符上限** | 全量基线差集点名 `prompt-tiers.test.ts` | 精简为一句短提示；重生成产物与 P1 基线；`prompt-tiers` 40 例回绿 |
| 工具壳分派表达式被改名（`sanitized`）冲掉了静态断言 | 同一轮基线差集点名 `tools-dispatch.test.ts` | 就地清洗、变量名仍用 `args`，分派形状保持规范；该用例回绿 |
| 三处「下一步」行被改写，冲掉 `STAGE_CHAIN` 逐字校验 | `stage-prompts.test.ts`（37 例） | 恢复规范行，把条件式指导作为**附加句**；`stage-prompts` + `prompt-baseline` + `prompt-conditional-gate` 全绿 |

### 6.4 t13 复测读数

- 定向广度复跑 **22 套件 / 231 例全绿**
- 片段产物一致性：`node scripts/check-prompt-fragments.mjs` 退出码 0
- 类型检查：仅 1 条错误且指向他人改动面（`src/client/views/panels/verify.ts:36`）
- 全量基线：见本次整改后的 `pnpm baseline:check` 读数（本文件 §4 的归属判据同样适用）

## 7. 诚实边界（不声称已证明的部分）

- 「剩余基线新增失败非本需求引入」是**证据链**（模块无交集 + mtime + 同一文件首例由红转绿），**不是独立证明**：
  要独立证明得回滚整个工作区，会破坏并发窗口的在制品。
- 反向演练全部由实施窗口手工注入改坏并还原（`diff -q` 校验），**未由第三方复跑**。
- G1~G4 只跑到单元/集成层，未做浏览器或宿主侧端到端（本需求无界面变更）。


## 8. 测试覆盖标注（`covers:` —— 验收覆盖度门禁据此计算）

> 口径：本需求 12 张父卡 + 28 张子卡（每卡 dev / review / test 三段各一张）共 **40 个任务**。
> 每个任务都由其父卡那条链上的用例覆盖（子卡是同一张卡的阶段段，证据同源）。
> 下列标注逐条给出「哪个测试文件覆盖了哪些任务」。

covers: t-14f9c2, t-9ab60f, t-e2a84a
（`tests/pending-confirm-registry-findopen.test.ts` 9 例：findOpen 纯读 / 跨窗口 / 过期 / 键不同 / 不续期）

covers: t-073a6a, t-ca4313, t-d31b44
（`tests/gate-request-uniqueness.test.ts` 11 例：判定序三分支 / 键不同 / 跨窗口 / 联调复用 / G4 专用）

covers: t-989d03, t-15729f, t-d49de6
（`tests/auto-confirm-no-second-gate.test.ts` 3 例：已有门不弹 / 已落章不弹 / 沿用同一张票）

covers: t-aa311c, t-7539a9, t-8070c0, t-ffa853
（`tests/ask-confirm-blocking.test.ts` 7 例 + `tests/ask-confirm-pending.test.ts` 13 例：复用语义 / 异门清理 / 工具面注入无效）

covers: t-d35599, t-814b48, t-a40956
（`tests/verification-no-second-gate.test.ts` 2 例：门未答时守卫拦下且无第二框 / 通道不可用不建门）

covers: t-ac6dbe, t-1c7ffb, t-d09bda
（`tests/confirm-settle-preconditions.test.ts` 6 例 + `tests/confirm-group.test.ts` 新增 1 例：落章前提 / 首写不变 / 门合并块 / 部分落章 / 文字证据路径）

covers: t-34a881, t-5e297f, t-ae970a
（`tests/stale-answer-background.test.ts` 2 例：票已落定的迟到作答中性化 + 未失效对照）

covers: t-51ccb8, t-5322b6, t-1ffa51
（`tests/prompt-conditional-gate.test.ts` 3 例 + `tests/stage-prompts.test.ts` 37 例 + `tests/prompt-baseline.test.ts` 15 例 + `tests/prompt-tiers.test.ts` 40 例）

covers: t-610324, t-b9375c, t-13fd40
（`tests/pending-guard.test.ts` 20 例 + `tests/pending-guard-integration.test.ts` 8 例 + `tests/confirm-pending-guard.test.ts` 5 例 + `tests/status-pending-confirm.test.ts` 4 例：recovery 只列真实出路）

covers: t-33a14b, t-d358cb, t-0c5909, t-2f6133
（本文件第 2 节的反向演练 + `scripts/gate-inflight-probe.mts` 探针 exit 0 / 反证 exit 1）

covers: t-823389, t-be5ec5, t-be0627, t-508349
（本文件全文：四门矩阵 / 五条改坏必红 / 基线两次对照 / 逐条归属 / t13 整改复测）

covers: t-93db11, t-f8a8ce, t-de5a31
（`tests/output-contract.test.ts` 42 例：返回键零新增；清单见 `notes/migration-rollback.md`）
