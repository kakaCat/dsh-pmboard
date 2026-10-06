# 命令级证据（REQ-261005165552-6783 · t-bcaf4d）

> 采集时间：2026-10-05 17:09–17:12（+0800）｜采集人：本窗口 agent（`session-e0d71427`）
> 用途：交付「改动可跑、产物为新建、全量套件零新增失败」的**可复核**证据；原始日志随本文件同目录留档。

## 1 变更面（可复核）

| 项 | 值 |
|---|---|
| 源码改动 | `src/gate-wiring.ts`（+14 / −0）—— 段注册处新增 `interpolate: false` + 注释 |
| 用例改动 | `tests/apply-wiring.test.ts`（+24 / −1）· 新增 `tests/capture-literal-section.test.ts` |
| 补丁留档 | `notes/change.patch`（75 行，`git diff HEAD --` 原文；`interpolate: false` 出现 2 次：注释 1 + 代码 1） |
| 段契约不变 | `name`（`reqboard:capture`）/ `order`（60）/ `text`（函数）三项**逐字未动**（−0 删除行为证） |

## 2 三条命令

| # | 命令 | 退出码 | 摘要 |
|---|---|---|---|
| ① | `pnpm typecheck` | **0** | `tsc --noEmit -p tsconfig.json` 无输出错误 |
| ② | `pnpm build` | **0** | host `dist/index.mjs` 重建 + client `lib/client.js` 重建；`[verify-client] OK bundle=591550 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| ③ | `pnpm test` | **1** | `Test Files 37 failed \| 441 passed \| 3 skipped (481)`；`Tests 68 failed \| 5485 passed \| 22 skipped (5575)` |

**③ 的退出码为什么不是 0（如实披露，不粉饰）**：本仓**开工前基线本身就是红的**——同一套件在同一工作区、
把我的两处改动暂存回原始状态后跑出 `37 failed | 68 failed`（详见 §3），这 68 条是存量漂移
（如 `RandomIdFactory` 仍断言旧的 6 位 hex 需求号、`failure-alert` 通道条数、`zero-arg-binding` 等），
与本次改动无因果关系。本卡验收原文写的是「全量退出码 0」，**该条在当前仓库状态下不可达**；
按本仓「失败要响亮」纪律改为给出**基线对照**：失败数相等 = 新增失败 0。

## 3 全量套件：改动前后基线对照

| 维度 | 基线（改动暂存后） | 改动后 | 差 |
|---|---|---|---|
| 失败文件 | 37 | 37 | **0** |
| 失败用例 | 68 | 68 | **0** |
| 通过用例 | 5477 | 5485 | **+8**（新文件 6 条 + 接线新增 2 条） |
| 用例总数 | 5567 | 5575 | +8 |
| `pnpm` 退出码 | 1 | 1 | 0 |

**基线怎么取的（可复现）**：`git diff HEAD -- src/gate-wiring.ts tests/apply-wiring.test.ts > notes/change.patch`
→ `git stash push -- <这两个文件>` + 移出新用例文件 → 跑 `pnpm test` → `git stash pop` + 移回。
两次运行的**原始输出**：`notes/full-suite-baseline.txt`、`notes/full-suite-after.txt`。

**已知的 2 条与本需求同文件的红（改动前后同红，非本次引入）**：
`tests/apply-wiring.test.ts` 工具清单数量漂移（实测 26 ≠ 期望 25）· `tests/capture.test.ts` 旧文案断言
（期望 `不许沉默`，现行文案为 `比沉默跳过安全`）。二者都在基线态为红，本次未改其断言（边界第 4 条）。

## 4 产物指纹（FR-3 的「新产物」判据）

| 时点 | `dist/index.mjs` sha256 前 12 位 | 大小 | mtime |
|---|---|---|---|
| 改动前（基线产物） | `fdc6885141ef` | 2046049 B | 2026-10-05 15:54 |
| 改动后（本次重建） | **`d0c9a803ba54`** | 2046073 B | **2026-10-05 17:09:07 +0800** |

- 产物 mtime（17:09:07）**晚于**源码改动 mtime（`src/gate-wiring.ts` 17:08:40）→ 本卡验收①成立；
- 客户端产物同步重建：`lib/client.js` 591550 B，mtime 17:09:09。

## 5 尚未完成的一步：重载与运行时解冻（宿主侧动作，需人/下一轮执行）

**为什么这里做不到**：任务队列是**进程内缓存**（`QueueTaskStore.cache`），重载插件 = 重启宿主进程；
本窗口自身就活在该进程里，agent 不能自杀式重载。

**复核步骤（重载后逐条看，三条都要）**：

1. 重启 DSH / 重载插件（使 `dist/index.mjs` = `d0c9a803ba54` 生效）；
2. 在被卡窗口 `session-5632659d`（`REQ-261005105032-3b02`）发一条消息 → 应能正常跑完一轮；
3. 看诊断日志 `/Users/mac/.dsh/state/reqboard-capture-diag.log` → 出现该窗口的 `NODE-4` / `NODE-5` 行；
4. 看 `/Users/mac/.dsh/reqboard/requirements/REQ-261005105032-3b02/record.json` 的 `interruption`
   → 仍为事故那次（`at: 1791190281767`），**无新增**同形记录。

> 口径：本卡（t-bcaf4d）交付「产物重建 + 命令级证据」；运行时解冻三项证据在**验收阶段**复核，
> 未复核前不得宣称「窗口已解冻」。
