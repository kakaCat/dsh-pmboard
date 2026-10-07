# 测试证据（REQ-261007160829-1991）

> 口径：下表每条都注明**谁跑的**。凡标「本窗口」的，是主窗口在落台账前独立复跑得到的读数，不是子代理自述。

## 一、逐卡验收读数（本窗口复跑）

| 卡 | 命令（原文） | 读数 |
|---|---|---|
| t1 字段 + 判定单点 | `npx vitest run tests/verdict-downgrade-reason.test.ts` | 12 passed，EXIT=0 |
| t3 提交侧体检入桶 | `npx vitest run tests/result-anchor-submit.test.ts` | 16 passed（桶级），EXIT=0 |
| t5 文案单点 | `npx vitest run tests/accept-result-question-wording.test.ts` | 10 passed，EXIT=0 |
| t2 裁决侧接线 | `npx vitest run tests/verdict-human-anchor-reject.test.ts` | 13 passed，EXIT=0 |
| t4 提交侧拒绝 | `npx vitest run tests/result-anchor-submit.test.ts tests/accept-sheet-zero-input.test.ts tests/accept-sheet-tool.test.ts tests/verify-item-result.test.ts tests/error-code-inventory.test.ts` | 5 files / 86 passed，EXIT=0 |
| t6 弹框接线 | `npx vitest run tests/accept-result-question-wording.test.ts tests/accept-sheet-tool.test.ts tests/capture-output-contract.test.ts tests/output-contract.test.ts` | 4 files / 87 passed，EXIT=0 |
| t7 HTTP 接线 | `npx vitest run tests/accept-result-question-wording.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-rtm-integration.test.ts` | 3 files / 36 passed，EXIT=0 |
| t8 契约钉死 | `npx vitest run tests/accept-verdict-reason-contract.test.ts tests/accept-result-question-wording.test.ts` | 2 files / 33 passed，EXIT=0 |

类型检查：`pnpm typecheck`（即 `tsc --noEmit -p tsconfig.json`）→ **退出码 0**，每张卡落地后本窗口都重跑过一次。

## 二、新增/修改的用例文件

| 文件 | 状态 | 覆盖 |
|---|---|---|
| `tests/verdict-downgrade-reason.test.ts` | 新建（t1） | 判定纯函数六条顺序、字段可选性 |
| `tests/result-anchor-submit.test.ts` | 新建（t3，t4 追加） | 体检桶五条件与排除项、端到端拒绝与零改动 |
| `tests/accept-result-question-wording.test.ts` | 新建（t5，t6/t7/t8 追加） | 形态常量、汇总与补法、两通道接线、反向防第二份文案 |
| `tests/verdict-human-anchor-reject.test.ts` | 新建（t2） | 破坏性改写拒绝、零输入通过不误伤 |
| `tests/accept-verdict-reason-contract.test.ts` | 新建（t8） | 字段镜像、值域两值、可选性双保险 |
| `tests/accept-sheet-tool.test.ts`、`tests/accept-sheet-zero-input.test.ts`、`tests/verify-item-result.test.ts` | 夹具锚点化（t4） | 新门生效后的既有夹具修正（**未**为变绿而改判据） |
| `tests/verdicts-and-rework.test.ts` | 1 条期望值（t7） | 该正则原本钉的正是被删的旧文案；「挂起」语义由同用例 `pending===2` 与 `status==='accepting'` 另行锁住 |

## 三、全量套件与基线对比

```
$ npx vitest run --reporter=dot
 Test Files  36 failed | 547 passed | 3 skipped (588)
      Tests  68 failed | 6920 passed | 22 skipped (7010)
 Duration  121.30s
```

**关键判据：失败清单与本需求相关文件交集为空。**

```
$ npx vitest run --reporter=dot 2>&1 | grep -oE "FAIL +tests/[^ >]+" | awk '{print $2}' | sort -u   # 36 个文件
$ grep -E "result-anchor|verdict|accept-sheet|acceptance|accept-result|unverified|anchor" <该清单>
（无：本需求相关文件零失败）
```

失败文件全部属**存量**（本需求未追、未修），例如：`tests/size-budget.test.ts`（30+ 个 src 文件 >400 行）、`tests/project-scope.test.ts`（docs.write 守卫盘点，涉事 `SubmitArchive.ts` 最后改动为 10-06 22:08）、`tests/layer-boundary.test.ts`、`tests/live-tasks-single-source.test.ts`、`tests/application/repository.test.ts`（REQ id 形态，属另一窗口在制的改动）、`tests/zero-arg-binding.test.ts`（找不到含 `pnpm.patchedDependencies` 的仓库根）等。

**基线漂移说明**：实施期间工作树长期被其它窗口并发编辑（约 445 个无关改动文件）。t4 记录的中途读数为「改前 39 文件 / 72 用例红 → 改后 37 文件 / 67 用例红」，本窗口最终读数 36 文件 / 68 用例；三次读数的**失败文件集合**都落在上述存量清单内，**没有一次出现本需求相关文件**。因此以「失败文件集合不含本需求相关文件」为自证口径，而不是以绝对计数相等为口径。

## 四、其它可复核读数

- `git diff --stat` 核对该需求涉及的源码文件（含 `src/shared/protocol.ts`、`src/domain/workflow/AcceptanceSheetSpec.ts`、`src/domain/workflow/ResultBinding.ts`、`src/application/use-cases/AcceptSheet.ts`、`src/application/use-cases/SubmitVerification.ts`、`src/http/routers/verdicts.ts`、新增 `src/domain/workflow/VerdictNotices.ts`）；`src/client/**` 零改动（与 `sides: [backend]` 声明一致）。
- t2 的穷举等价性探针：2016 组输入（result 7 值 × needsHuman/gapKind/前缀项 × 4 status × 9 opinion）逐组比对——1415 组可比输入 `status` 零不一致、588 组既有抛错文案与码不变、13 组新拒绝逐条满足「`judge=unverified(anchor_missing)` ∧ `isHumanAuthored`」且该项字段 JSON 前后全等（拒绝 = 台账零改动）。
- t4 的端到端零改动读数：拒绝时 `store.peekRevision()`、需求 `version`、`sheet.version` 三者全不动，单里一条 `result` 都没落。

## 五、逐卡 → 用例映射（RTM 覆盖标注）

> 每张卡（含子卡）的 `covers:` 标注，供测试覆盖度门禁与追溯链读取；用例文件与命令见上文第一、二节。

### t1 落「未复核原因」字段与降级判定单点

covers: t-3951af, t-8c6d01, t-a0729c, t-987e33, t-cf7280

`tests/verdict-downgrade-reason.test.ts`（12 passed）；等价性探针 2016 组输入零不一致。

### t3 提交侧锚点体检入桶

covers: t-80b0dc, t-7251a1, t-9838ac, t-5161a6, t-73f724

`tests/result-anchor-submit.test.ts`（桶级 16 passed）；回归 `tests/result-binding.test.ts`（30 passed）。

### t5 新建回执文案单点 VerdictNotices

covers: t-59a3e5, t-434480, t-8f7951, t-43959f, t-1dca26

`tests/accept-result-question-wording.test.ts`（单点段 10 passed）。

### t2 裁决侧写降级原因并在人工自填无锚点时拒绝

covers: t-b44770, t-f00610, t-e3ebb1, t-242d3d, t-2eabc4

`tests/verdict-human-anchor-reject.test.ts`（13 passed）；隔离副本回归 31 文件 306 passed。

### t4 提交侧锚点拒绝分支与错误码

covers: t-269ffb, t-18b65a, t-780cb1, t-c45612, t-ec1b56

`tests/result-anchor-submit.test.ts`（端到端 21 passed）；含 3 个既有夹具的锚点化修正。

### t6 弹框侧接线（题干形态提示 + 回执分派）

covers: t-ef6a16, t-cefd51, t-c017dc, t-161118, t-cae74b

`tests/accept-result-question-wording.test.ts`（接线段 13 passed）；相邻 11 文件 108 passed。

### t7 HTTP 回执按真实原因分派

covers: t-f12b83, t-696ac5, t-2e6d81, t-683821, t-4bf569

`tests/accept-result-question-wording.test.ts` + `tests/verdicts-and-rework.test.ts`（36 passed）；走真实 HTTP 链。

### t8 契约与文案单点的机械钉死

covers: t-389b23, t-9a94ec, t-b4a254, t-a95264

`tests/accept-verdict-reason-contract.test.ts`（10 passed）+ 文案文件追加段（合计 33 passed）。
