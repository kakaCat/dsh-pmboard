# 测试证据 · REQ-261007135258-331a

> 全部命令在本仓根目录实跑（2026-10-07），输出摘要如下。

## 1. 需求自身验收用例（10 文件）

```
$ npx vitest run tests/artifact-confirm-board.test.ts tests/confirm-advance-deadlock.test.ts \
      tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts \
      tests/awaiting-clear-notice.test.ts tests/dive-confirm-advance.test.ts \
      tests/confirm-channel-parity.test.ts tests/confirm-advance-finish.test.ts \
      tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts

 ✓ tests/artifact-confirm-board.test.ts  (4 tests)
 ✓ tests/confirm-advance-deadlock.test.ts  (11 tests)
 ✓ tests/confirm-evidence.test.ts  (9 tests)
 ✓ tests/confirm-settle-preconditions.test.ts  (6 tests)
 ✓ tests/awaiting-clear-notice.test.ts  (5 tests)
 ✓ tests/dive-confirm-advance.test.ts  (5 tests)
 ✓ tests/confirm-channel-parity.test.ts  (5 tests)
 ✓ tests/confirm-advance-finish.test.ts  (4 tests)
 ✓ tests/decision-gates.test.ts  (36 tests | 2 skipped)
 ✓ tests/stage-gate-timeline.test.ts  (20 tests)
 Test Files  10 passed (10)
      Tests  103 passed | 2 skipped (105)
```

## 2. 类型门禁

```
$ pnpm typecheck
> tsc --noEmit -p tsconfig.json
typecheck exit=0
```

## 3. 静态断言（推进与指路都只经单点）

```
$ grep -rn "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts
（空输出，exit 1）

$ grep -n "applyConfirmedAdvance" src/http/routers/requirements.ts
43:import { applyConfirmedAdvance, stampArtifactOnce, stampPlanOnce } from ...confirm-settle.js
522:      const advancedBy = await applyConfirmedAdvance(
（确认即推进分支只调单点；236 人工 move / 359 批准计划落库为其它路由合法调用，按 FR-1 精确口径保留）

$ grep -rn "reqboard_move(requirement_id" \
      src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts
（空输出，exit 1）
```

## 4. 逆验证一：对拍用例非空转（FR-6）

在推进单点收尾前临时短路（跳过 `finishConfirmAdvance`）：

```
$ npx vitest run tests/confirm-channel-parity.test.ts
 × evidence（文字证据） ⇒ 推进到 design + 停手位清 + 健康位复位 + 章已落
 × board（看板一键） ⇒ 推进到 design + 停手位清 + 健康位复位 + 章已落
 × 四通道四元组逐项相等（本用例才是"对拍"本体）
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

恢复后：

```
$ npx vitest run tests/confirm-channel-parity.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## 5. 逆验证二：证据路径停手位清位断言非空转（FR-3）

在文字证据路径临时传 `clearStopPosition: false`（跳过收尾）：

```
$ npx vitest run tests/confirm-evidence.test.ts
 × FR-3：证据确认推进后停手位被清（awaiting-confirm → healthy）且留「等待结束」痕
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

恢复后：

```
$ npx vitest run tests/confirm-evidence.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

## 6. 全量对照（如实读数，非本需求归因）

```
$ pnpm test（HEAD d0f01d6 干净工作树）
 Test Files  41 failed | 484 passed | 3 skipped (528)
      Tests  76 failed | 6125 passed | 22 skipped (6223)
 exit=1

$ pnpm test（当前工作树）
 Test Files  52 failed | 519 passed | 3 skipped (574)
      Tests  100 failed | 6695 passed | 22 skipped (6817)
 exit=1
```

差额主因：当前树 `vitest.config.ts` 的 Node 权限模型未放行 `child_process`（在飞需求 REQ-261006201814-ac4f），
`Access to this API has been restricted` 出现 53 次，命中依赖 `execSync` 的用例；本需求改动模块不在失败集合内。
经人工裁决（2026-10-07），t-391a5b 验收收窄为需求自身判据，全量红如实留痕、不阻塞本卡。

## 7. 任务覆盖标注（covers）

> 每个任务 id 对应上方可复核的命令读数；父卡与其子卡共用同一组证据。

covers: t-cd1673 — 单点收尾与推进接线：§1 confirm-advance-finish（4 例）、§3 grep 空输出
covers: t-668b4f — 同上（子卡·研发）：§1 confirm-advance-finish（4 例）
covers: t-f677ce — 同上（子卡·联调）：§1 artifact-confirm-board / confirm-evidence 接线
covers: t-fc4732 — 同上（子卡·复核）：§5 逆验证与失败路径复核
covers: t-fc2a6a — 同上（子卡·测试）：§2 typecheck 0
covers: t-4fae3f — 看板确认推进改走单点 + 窗口在线解耦：§1 artifact-confirm-board（4 例）
covers: t-d413a8 — 同上（子卡·研发）：§1 artifact-confirm-board（4 例）
covers: t-ce2730 — 同上（子卡·联调）：§1 artifact-confirm-board 请求/响应一致
covers: t-689c9b — 同上（子卡·复核）：§3 确认分支 grep 读数
covers: t-67f4b5 — 同上（子卡·测试）：§1 + §2
covers: t-a1b3e5 — 文字证据确认推进改走单点：§1 confirm-evidence（9 例）、§5 逆验证二
covers: t-167e72 — 同上（子卡·研发）：§3 ConfirmArtifact grep 空输出
covers: t-b8a3b7 — 同上（子卡·联调）：§1 confirm-settle-preconditions（6 例）
covers: t-e78d50 — 同上（子卡·复核）：§5 逆验证二
covers: t-1eded6 — 同上（子卡·测试）：§5 逆验证二（跳过收尾必红）
covers: t-9373c5 — 门禁 how 指路改指 reqboard_ask_confirm：§1 decision-gates / stage-gate-timeline、§3 第二条 grep
covers: t-3c4004 — 同上（子卡·研发）：§3 grep reqboard_move(requirement_id 空输出
covers: t-ea5c7e — 同上（子卡·复核）：§3 第二条 grep
covers: t-64982e — 同上（子卡·测试）：§1 decision-gates / stage-gate-timeline（56 例）
covers: t-3bb415 — 四通道对拍用例与起轮回归锁：§1 confirm-channel-parity（5 例）、§4 逆验证一
covers: t-3e6726 — 同上（子卡·研发）：§1 confirm-channel-parity
covers: t-983312 — 同上（子卡·复核）：§4 逆验证一
covers: t-b414bc — 同上（子卡·测试）：§1 + §4
covers: t-391a5b — 全量回归与静态断言收尾：§1 + §2 + §3 + §6
covers: t-4d8dc0 — 同上（子卡·校验）：§1 + §2 + §3 + §6

