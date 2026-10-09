---
title: 红测试分诊与收口：三类成因、定性纪律、基线与打包门
updated: 2026-10-08
source: REQ-261008004324-81df
---

# 红测试分诊与收口

> 面向**面对一片红不知道该改哪的人与 agent**。本页是 REQ-261008004324-81df（红测试收口）的合并去向：
> 把「红不是一种东西」讲成可操作的判据，避免下一次再从零取证。

## 一、先分诊：三类成因，修法完全不同

| 类 | 特征 | 修哪里 | 判据锚点 |
|---|---|---|---|
| **A 夹具/断言滞后** | 被测语义**已提交变更**，测试没跟上（回执改名、文案换措辞、门禁收紧、状态读数前移） | 改测试侧夹具/断言 | 找到「事实源」（`src/` 现形态或引入它的需求 id），事实源 ≠ 测试期望 |
| **B 真实技术债 / 真缺陷** | 门禁零调用点、字段丢了、注入点未接线、写入器丢失 | **改生产代码**（另立项） | 期望与事实源**一致**，而实现不一致 |
| **C 环境与基线** | 缺宿主包、探针锚点消失、生成物陈旧、环境产物混进打包树 | 改环境 / 基线 / 清理产物 | 与语义无关；重生成或显式跳过即收 |

**归属口径**：以「干净 HEAD 是否同样红」判定，而不是猜谁改坏的。
`git worktree add /tmp/probe HEAD --detach && ln -s "$PWD/node_modules" /tmp/probe/node_modules` 单跑该文件即可。

## 二、定性纪律：禁「为绿而绿」

- 每条修复旁必须写**一句依据**（命令读数 / 需求 id / `文件:行`）；没有依据的「改断言」一律退回。
- **B 类不许改断言转绿**：留在失败清单里当证据，另案点名（本次实测：三要素门零调用点、
  `doc_sync_warning` 无出口面、`CaptureGuidanceDeps.address` 死参数、`round-state` 旧相位判定、
  `ExecuteTask` 内联回退吃掉 `revisions`、`MoveRequirement` 丢 `stampCheckpoint`、
  组合根 `src/index.ts` 漏传 `store` ⇒ 真实链路节点隔离静默失败）。
- 定性为「B」的，需求范围要**当时**收敛（本次 37 文件 / 67 用例 → 28 文件内修 + 11 用例另案）。

## 三、环境类的两条硬口径

- **缺依赖不许静默跳过**：用 `describe.skipIf` / `it.skipIf` + 文件头写跳过依据与显式跑法
  （先例 `tests/decision-gates.test.ts`）。跳过数要在 `skipped` 计数里可见——
  本次 `tests/isolate-node-context.test.ts` 原先是**模块级 import 失败**，整文件 29 条一条都跑不到；
  改成惰性取包后 24 条在跑、5 条显式跳过。
- **守护对象消失要退休，不要假装还在守**：`tests/zero-arg-binding.test.ts` 的守护对象
  （`dsh-ptc-runtime-node` + 补丁）已从仓里消失（无 `patches/`、无 `pnpm.patchedDependencies`），
  留着 4 条环境断言只会常红 ⇒ 改成一条**显式声明式断言**并写明依据与时点。

## 四、基线：三份清单必须同源

`docs/reviews/test-baseline.{md,failures.txt}` 只是**一份**基线；
分级台账由 `failures.txt` + `reverse.txt` + `other.txt` 三份共同承载，不变量是
`failures = reverse ∪ other`（由 `tests/baseline-triage.test.ts` 守卫）。

**只用 `scripts/test-baseline.mts --refresh` 刷 `failures.txt` 会立刻引入 3 条新红**——本次实测并回滚。
刷分类文件是**人的动作**（`tests/drill/triage-baseline.mts` 头注明写「脚本只报告、不落盘」）。
另注意两条顺序相关 flaky（`tests/header-progress-e2e.test.ts`、`tests/reqboard/settings-init.test.ts`）
会让「集合差为空」在不同跑法间抖动：判定前先单跑确认，别把抖动当回归。

## 五、打包门与打包器差异

- `skills/**/__pycache__` 这类环境产物**会真的进包**：`.gitignore` 不管 npm/pnpm 的 `files` 白名单。
  清理后要验**真实 tarball**，不是看 `git status`。
- **`pnpm pack --dry-run` 在 pnpm 10.22 已不存在**（`Unknown option`，exit 1）——
  用它写判据会得到「grep 计数 0」的**假绿**。真验法：
  `pnpm pack --pack-destination /tmp/x --config.ignore-scripts=true`（必须加 `ignore-scripts`，
  否则 `prepare → pnpm build` 会重写 `dist/`、`lib/`）。
- **子目录 `.npmignore` 对 pnpm 打包器不生效**（对 npm 生效）：要持久防复发，得收窄
  `package.json` 的 `files`（本次未做，留给后续需求）。

## 六、本次收口读数（可复核）

| 项 | 开工前 | 收口后 |
|---|---|---|
| `pnpm test` 失败文件 / 用例 | 37 / 67 | **12 / 21**（另案 11 + B 类 10） |
| 其中既有红（干净 HEAD 同样红） | 36 文件 / 66 用例 | — |
| `npx tsc --noEmit` | 9 条既有报错 | **exit 0** |
| `pnpm kb:check` | 4 处生成物漂移 | 漂移已绿（K7 零漂移）；仍红：K1 `INDEX.md` 超长、K3 `conventions.md` 超行、K14 新增不可判定条目 |

需求目录：`docs/requirements/REQ-261008004324-81df/`（定性台账 `qualitative-ledger.md`、
收口实测 `tests/closeout-readings.md`、评审 `reviews/review-notes.md`）。
