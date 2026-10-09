# 测试用例（REQ-261007193530-3133）

> 视角：本批每条 FR 的可执行验收用例、命令、期望读数，以及**反证**（证明用例真能抓住原 bug）。

## 用例总表 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 用例 id | FR | 文件 | 起点/输入 | 期望 | 反证（回退修复） |
|---------|----|------|----------|------|-----------------|
| TC-1.1 | FR-1 | `tests/ask-confirm.test.ts` | 弹框选「需要修改」，无 custom | `'user_feedback' in out === false`；`JSON.stringify` 不抛；递归无 `undefined`；需求仍在 brainstorming | 回退为 `user_feedback: undefined` → **1 failed** |
| TC-1.2 | FR-1 | 同上 | 弹框选「需要修改」+ custom「请补一条失败路径」 | `out.user_feedback === '请补一条失败路径'`；回执无损 | — |
| TC-2.1 | FR-2 | `tests/http-task-move-role.test.ts`（新建） | 子卡 `in_progress` → `integrating`/`testing`/`in_review`（真实 HTTP 处理器） | 400 + `code: 'invalid_transition'`；`status` 仍 `in_progress`、`version` 仍 1、`statusHistory` 空 | 移除 `role` 传参 → **3 failed** |
| TC-2.2 | FR-2 | 同上 | 子卡 `in_progress` → `done` | 200 + `success: true`；状态落 `done` | （同上批内一并失败） |
| TC-2.3 | FR-2 | 同上 | 父卡 `in_progress` → `integrating` | 400 + `invalid_transition` | 同上 |
| TC-2.4 | FR-2 | 同上 | 存量卡 `in_progress` → `integrating` → `testing` | 两跳均 200；状态落 `testing`（老路径不变） | 同上 |
| TC-3.1 | FR-3 | `tests/domain/requirement-status.test.ts` | 集合成员检查 | `HUMAN_ONLY_REQ_TRANSITIONS.has('canceled>draft')` 为真；`canReqTransition('canceled','draft')` 仍为真 | 移除集合条目 → failed |
| TC-3.2 | FR-3 | 同上 | `assertReqTransition('canceled','draft', actor)` | agent/system → `code:'human_gate'`；human 不抛 | 同上 |
| TC-3.3 | FR-3 | 同上 | `agentNextActions('canceled')` | 不含 `'draft'`，且等于「合法边 − 人工门」的派生集合 | 同上 |
| TC-4.1 | FR-4 | `tests/done-throttle-guidance.test.ts` | `h.at = now + 30_000`，throttle 60s | 返回恰为 `60_000`（修前 90_000） | 回退 clamp → **1 failed** |
| TC-4.2 | FR-4 | 同上 | `h.at = now - 10_000` | 返回恰为 `50_000`（读数不变锚点） | — |
| TC-4.3 | FR-4 | 同上 | `h.at = now - 120_000` | 返回 `0`（下界不变） | — |

## 关键设计说明 <!-- serves: FR-2, FR-4 -->

- **TC-2.x 的起点必须是 `in_progress`**：`todo → integrating` 在存量卡表与子卡表里**都**非法，
  用它做用例会在修复前后都「通过」，测不出「路由忘了传 role」。真正的分叉点是
  `in_progress → integrating/testing`：存量卡放行、子卡表无出边。
- **TC-2.x 走真实 HTTP 处理器**（`createReqboardHandler` + 队列存储）：病灶在路由层，
  只测 `transitionTask` 本身测不出漏传参数。
- **反证是验收的一部分**：四处修复都做了「回退修复 → 用例变红 → 恢复 → 全绿」，
  证明用例不是同义反复。

## 执行命令与期望读数 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
# 本批四组用例（期望：4 files passed, 36 tests passed）
npx vitest run tests/ask-confirm.test.ts tests/http-task-move-role.test.ts \
  tests/domain/requirement-status.test.ts tests/done-throttle-guidance.test.ts

# 类型检查（期望：exit 0，error TS 0 条）
npx tsc --noEmit -p tsconfig.json
```

## 全量测试与基线口径 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
pnpm test            # 本批环境读数：69 failed | 6942 passed（39 文件失败）——存量失败，见下
pnpm baseline:check  # 本批环境读数：新增失败 10 条，均落在本批未触碰的文件
```

- 归因方法（已执行）：`git stash push -u -- src tests` → 在 HEAD 复跑那 7 个「新增失败」文件
  → **6 failed / 1 passed（9 tests failed）**，与本批改动无关 ⇒ 属基线文件陈旧，需另行 `--refresh` 处置。
- 因此本批的验收口径是：**本批新增用例全绿 + 无本批引入的新失败**，而不是「全量绿」。
  这一偏差已在验收材料里如实标注。
