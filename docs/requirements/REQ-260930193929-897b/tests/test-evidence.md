# 测试证据（REQ-260930193929-897b · 2026-09-30）

## 环境

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0（`node_modules/.bin/vitest`）；类型检查 tsc 5.3.3
- **无 commit 可指**：本工作区在本需求开始前就带有大量未提交的在途改动，故本证据一律采用
  「改动前后基线对比」（而非 commit 对比）——这也是唯一能证明「零新增失败」的可复现口径。
- ⚠️ 宿主加载的是 `dist/index.mjs`（构建于 20:23），本次源码改动在 20:26–20:41 ⇒ **该证据验证到
  「真实 HTTP 处理链」这一层为止**，不含运行中宿主上的端到端复跑（原因见「失败与未跑项」）。

## 跑了什么

```
node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts
node_modules/.bin/vitest run --passWithNoTests          # 全量回归
node_modules/.bin/tsc --noEmit -p tsconfig.json         # 类型
```

## 结果摘要

| 命令 | 改动前基线 | 改动后 | 判定 |
|---|---|---|---|
| 定向（本需求新增文件） | 文件不存在 | `Test Files 1 passed (1)`；`Tests 13 passed (13)` | ✅ 全绿 |
| 全量 `vitest run` | `103 failed \| 2627 passed \| 20 skipped (2750)` | `103 failed \| 2641 passed \| 20 skipped (2764)` | ✅ 失败数持平、**零新增**；通过数 +14 |
| `tsc --noEmit` | 213 条 | 213 条 | ✅ 按错误文本（规范化行号）比对 **md5 完全一致**：零新增、零消失 |

## 覆盖与对照

| 验收标准 | 用例（TC-x） | 对应测试 | 结果 |
|---|---|---|---|
| 文档在需求根 → 放行并推进（FR-1） | TC-1 | 「正向：会话根 ≠ 需求根，文档在需求根 → 放行并推进」 | ✅ |
| 同一错误根下真缺文件 → 仍拦（FR-2） | TC-2 | 「反向：…仍拦」+「补齐 requirement.md 后缺口消失」 | ✅ |
| 拆分内容硬门不再静默放行（FR-1） | TC-3 | 「错误根下会静默放行」+「校正后被 design_contains_decomposition 拒」 | ✅ |
| 看板通道按需求记录解析（FR-1） | TC-4 | 「看板路径：外来根 A + 需求声明 B → 看板一键确认后仍能自动推进」+ 反向用例 | ✅ |
| 工具通道（FR-1） | TC-5 | **无行为用例**，仅由防旁路静态断言覆盖 | ⚠️ 部分 |
| 早返回通道（FR-1） | TC-6 | 「补齐 requirement.md 后缺口消失」（该调用走的正是 `AskConfirm` 早返回分支） | ✅ |
| 存量兼容 / no-op（FR-2） | TC-7 | 「存量兼容（行为级）」+ 三例 no-op 单测（缺字段 / undefined / 空串） | ✅ |
| 存量豁免（artifacts 空）（FR-2） | TC-8 | 未新增：该分支由 `content-gate-wiring` 的 `isLegacy` 提前返回，既有 `tests/design-completeness-gate.test.ts` 已覆盖 | ✅（既有） |
| 防新增旁路（FR-2） | TC-9 | 「四个文件的闸门调用点全部有前置校正」+「写侧入口仍委托同一实现」 | ✅ |

## 失败与未跑项

| 项 | 状态 | 处置 |
|---|---|---|
| 运行中宿主的端到端复跑（设计确认后自动推进） | **未跑** | 宿主经 `~/.dsh/profiles/web` 软链加载本仓 `dist/index.mjs`，而 dist 构建于 20:23、源码改动在 20:26–20:41 ⇒ 需先重建 dist 并重载宿主，而重载/重启会终止本会话。行为验证已覆盖到真实 HTTP 处理链（含看板确认端点）；是否重建 dist + 重载宿主**请人决定**，不擅自执行 |
| 工具通道（`reqboard_confirm_artifact`）行为用例 | **未写** | 只有接线位置的静态断言。判定可接受（接线位置是本缺陷的唯一变量），但如实列出，不粉饰为「四通道行为全覆盖」 |
| 仓内存量失败 103 条 | 失败（与本需求无关） | 改动前后均为 103，**零新增**；本需求不修这些存量问题 |
| 存量豁免（artifacts 空）新用例 | 未新增 | 既有用例已覆盖，不重复造用例 |

## 故障注入

只验成功路径等于没测，故对门禁路径做了两次**停用实验**（注入后必须变红，否则用例是空过的）：

| # | 注入 | 观测 | 处置 |
|---|---|---|---|
| 1 | 临时停用 `confirm-settle.ts:103` 的根校正 | 「拆分内容硬门」用例变红，并复现 fail-open（错误根下读到空数组而放行） | 实验后恢复；`grep -rn "TEMP-PROOF" src/ tests/` 无输出 |
| 2 | 临时停用 `ConfirmArtifact.ts` 的根校正 | 防旁路静态断言变红并精确点名 `ConfirmArtifact.ts:93 读盘前缺少根校正` | 实验后恢复；同上无残留 |

实验 1 还顺带暴露并修掉了静态断言自身的一个缺陷：原正则会把**被注释掉的调用**当成有效校正
（自欺式通过）。修复后该断言才真正具备拦截力——这一条已写入 `reviews/self-review.md` 问题清单 #1。

## 覆盖标注（covers，供 RTM 测试覆盖度门禁读取）

> 每张任务卡（4 父 + 13 子）对应的测试证据。父卡由其子卡证据汇总；复核类子卡无独立用例，
> 其证据是「对照结论 + 下述命令输出」，如实标注而不虚指。

### TC-1 覆盖 t-be2369（t1 父卡：唯一收敛入口）

covers: t-be2369

证据：`node_modules/.bin/vitest run tests/state-workspace-root.test.ts` → 7 passed；`grep -n "export function applyRequirementWorkspaceRoot" src/application/internal/support.ts` → 命中。

### TC-2 覆盖 t-b9d8e9（t2 父卡：7 处接线）

covers: t-b9d8e9

证据：`vitest run tests/design-gate-workspace-root.test.ts -t "四个文件的闸门调用点"` → 1 passed；正向用例 → 通过。

### TC-3 覆盖 t-211525（t3 父卡：正反双向测试）

covers: t-211525

证据：`vitest run tests/design-gate-workspace-root.test.ts` → 13 passed。

### TC-4 覆盖 t-671de7（t4 父卡：兼容与回滚）

covers: t-671de7

证据：`vitest run tests/design-gate-workspace-root.test.ts -t "看板路径"` → 2 passed；`-t "存量兼容"` → 4 passed；`test -f docs/requirements/REQ-260930193929-897b/notes/rollback.md` → ok。

### TC-5 覆盖 t-59fed4（t1·研发：抽取唯一入口）

covers: t-59fed4

证据：`vitest run tests/state-workspace-root.test.ts` → 7 passed；`tsc --noEmit` 中 support.ts 零错误。

### TC-6 覆盖 t-10098f（t1·复核：行为等价性）

covers: t-10098f

证据（复核类，无独立用例）：等价性逐行比对结论 + `vitest run tests/state-workspace-root.test.ts` → 7 passed（写侧行为未变）。

### TC-7 覆盖 t-85644c（t1·测试）

covers: t-85644c

证据：`vitest run` → 103 failed（与基线持平）；`tsc --noEmit | grep -c "error TS"` → 213（基线值）。

### TC-8 覆盖 t-79a599（t2·研发：7 处接线）

covers: t-79a599

证据：`grep -rn "applyRequirementWorkspaceRoot(" src/ | grep -v "export function" | grep -v "deps, requirement" | wc -l` → 7。

### TC-9 覆盖 t-359e38（t2·联调：口径一致）

covers: t-359e38

证据：四文件闸门调用点计数合计 7，且每条闸门调用前 12 行内都有校正（`-t "四个文件的闸门调用点"` → 1 passed）。

### TC-10 覆盖 t-904889（t2·复核）

covers: t-904889

证据（复核类）：正/反向用例均通过；偏离项 3 条已定性（参数面收窄、形参改名、拆分内容硬门纳入范围）。

### TC-11 覆盖 t-58c789（t2·测试）

covers: t-58c789

证据：`vitest run` → 103 failed | 2641 passed（基线 103 | 2627，零新增）。

### TC-12 覆盖 t-d4ec69（t3·研发：13 例）

covers: t-d4ec69

证据：`vitest run tests/design-gate-workspace-root.test.ts` → 13 passed；故障注入实验使对应用例变红。

### TC-13 覆盖 t-5da4f0（t3·复核）

covers: t-5da4f0

证据（复核类）：反向用例断言 code 与缺口文案齐备；静态断言「匹配注释」缺陷已修并复验。

### TC-14 覆盖 t-f9a205（t3·测试）

covers: t-f9a205

证据：`-t "反向"` → 3 passed；全量 103 failed（基线持平）。

### TC-15 覆盖 t-18a70f（t4·研发：看板行为用例 + 回滚说明）

covers: t-18a70f

证据：`-t "看板路径"` → 2 passed；`-t "存量兼容"` → 4 passed；rollback.md 存在。

### TC-16 覆盖 t-40797a（t4·复核）

covers: t-40797a

证据（复核类）：no-op 三种形态各有单测；回滚清单与 `grep -c applyRequirementWorkspaceRoot` 的落点逐条一致。

### TC-17 覆盖 t-eecd25（t4·测试）

covers: t-eecd25

证据：`vitest run tests/design-gate-workspace-root.test.ts` → 13 passed；全量 103 failed（基线持平）。

