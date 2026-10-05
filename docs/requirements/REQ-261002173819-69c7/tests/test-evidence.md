---
req: REQ-261002173819-69c7
kind: tests
title: 测试证据（目标用例 · 回归基线 · 故障注入 · 端到端）
---

# 测试证据 · REQ-261002173819-69c7

> 全部命令在 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 原样执行；**失败项不写成通过**。
> 更完整的收口记录见 [../evidence/t5-acceptance.md](../evidence/t5-acceptance.md)。

## 1 目标用例（本需求新增与扩写）

```
npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts \
               tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts \
               tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts
```

**结果：6 文件 61 例全绿，exit 0**（收口前最终复跑：2026-10-02 18:32）。

| 文件 | 例数 | 覆盖的断言 |
|------|------|-----------|
| advance-dispatch-owner | 7 | D-1/D-2/D-3/D-4a/D-4b/D-5/D-6/D-7（锁回收、owner 口径、留痕） |
| dive-rearm | 24 | 既有 + 新增 R-1..R-7（`armExplicit` 行为矩阵） |
| reqboard/autorun-rearm | 2 | R-8（路由级接回 + 不新增返回键）、R-9（暂停不动 dive） |
| tools-render-coverage | 3 | T-1（全工具渲染覆盖）、T-2（扫描器自证）、T-2b（clear_pause 有 render） |
| clear-pause-lossless | 9 | 既有 + 新增 T-3（渲染首行与 JSON）、T-4（回执与台账一致） |
| unit/dsh-jobs-adapter | 16 | owner 透传（夹具改为字符串 id，保留「透传不改写」） |

## 2 既有契约回归（不得回归）

```
npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts \
               tests/task-run-contract.test.ts tests/dive-round-state.test.ts tests/dive-round-driver.test.ts
```

结果：**125 passed / 3 failed**。3 例失败全在 `output-contract.test.ts`，断言 `TaskAdopt` / `Knowledge` /
`Regenerate` 三个工具缺响应源映射——与本需求零交集，且在 t1 开工前的全量回归里就已失败。

## 3 类型 / 全量 / 构建

| 项 | 命令 | 结果 | 基线 | 判定 |
|----|------|------|------|------|
| 类型 | `pnpm typecheck` | 187 条（本需求改动文件 0 条） | 223 | 通过 |
| 全量 | `pnpm test` | 329 文件 / 3446 例：**99 failed** / 3327 passed / 20 skipped | 106 failed | 通过 |
| 构建 | `pnpm build` | exit 0；`[verify-client] OK bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` | C-11/C-12 | 通过 |

## 4 回归失败集合逐文件比对（证明"没有新增失败"）

| 轮次 | 失败文件数 | 与上一轮相比 |
|------|-----------|--------------|
| t1 开工前 | 49 | — |
| t2 后 | 49 | 无新增、无消失 |
| t3 后 | 49 | 无新增、无消失 |
| t4 后 | 49 | 无新增、无消失 |

另：全量日志检索 `dispatchOwnerOf` / `DISPATCH_FAILED` / `armExplicit` / `releaseClaim` 命中数均为 **0**。

## 5 故障注入（证明守卫非空转）

```
临时新增 src/tools/__probe/ProbeTool.ts（defineTool 且无 render）
  → tests/tools-render-coverage.test.ts 的 T-1 变红，并打印：src/tools/__probe/ProbeTool.ts
删除探针后复跑 → 12 例全绿；src/tools 下无残留（ls 校验 __probe 计数 0）
```

同类自证还有两处：`tools-render-coverage` 的 T-2 用内存样例断言扫描器会报红；
`dsh-jobs-adapter` 保留「参数透传不改写」断言，防止适配器偷偷改写 owner。

## 6 端到端（两段）

### 6.1 真实台账副本 + 真实实现（可通过）

```
npx tsx docs/requirements/REQ-261002173819-69c7/evidence/t5-e2e-real-copy.mts
```

```
【副本端到端】台账需求总数 = 39
【基线】 REQ-261002161439-277d dive = {activation: disarmed, phase: idle, roundsInStage: 0, …}
【结果】 REQ-261002161439-277d dive = {activation: armed,    phase: active, roundsInStage: 0, …}
【判据】 isDrivableRequirement = true
【留痕】 含 [Dive 重新武装] = true
【响应键】 26 个 = 需求记录 25 字段 + advanceNote（未新增键）
【生产台账未被改写】 sha256 相同 = true
E2E-COPY: PASS
```

### 6.2 宿主内实机（人授权代点「继续」）

```
18:24:53 human  [Dive 重新武装] 人显式要继续（trigger=board-resume）：activation disarmed → armed；phase idle → active
18:24:53 system [自动链投递失败] … 锁已回收，可直接重试 reqboard_task_run
```

| 卡面项 | 结果 |
|--------|------|
| activation disarmed → armed | ✅ 生产台账实测 |
| phase idle → active | ✅ 生产台账实测 |
| `[Dive 重新武装]` 人工留痕 | ✅ `createdBy.kind=human` |
| `roundsInStage` 0 → 1 | ⚠️ 环境受限未实测（经人裁定降级；原因见 evidence §6.4） |

## 7 任务覆盖对照（每张卡对应哪份证据）

> 24 张卡（5 父卡 + 19 子卡）逐张给出可复核的测试或验证依据；父卡依据 = 其子卡链依据的合取。

| 卡 | 依据 | 覆盖标注 |
|----|------|----------|
| t-923a20（t1 父·owner 口径收口） | §1 + §3 | covers: t-923a20 |
| t-a33608（t1 研发） | §1（D-4a/D-4b/D-6） | covers: t-a33608 |
| t-dc5168（t1 联调） | §2（advance-chain/dive-round-state 跨层全绿） | covers: t-dc5168 |
| t-30dd7a（t1 复核） | §1 + §7 本表 | covers: t-30dd7a |
| t-0170cd（t1 测试） | §3（typecheck 187 / 全量 99） | covers: t-0170cd |
| t-884e02（t2 父·失败不留锁） | §1（D-1/D-2/D-3/D-5/D-7） | covers: t-884e02 |
| t-6ef68e（t2 研发） | §1（D-1/D-3） | covers: t-6ef68e |
| t-963c34（t2 联调） | §2（task-run-contract 全绿） | covers: t-963c34 |
| t-55c6f2（t2 复核） | §1 + §3 | covers: t-55c6f2 |
| t-52166a（t2 测试） | §4（失败集合与改动前一致） | covers: t-52166a |
| t-2c989c（t3 父·人能接回） | §1（R-1..R-9）+ §6.2 | covers: t-2c989c |
| t-f5a28b（t3 研发） | §1（R-1..R-7） | covers: t-f5a28b |
| t-8c5f5d（t3 联调） | §1（R-8/R-9 路由级） | covers: t-8c5f5d |
| t-65d479（t3 复核） | §1 + §2（dive-round-driver 26 例） | covers: t-65d479 |
| t-fc9099（t3 测试） | §3 + §4 | covers: t-fc9099 |
| t-08b330（t4 父·回执渲染） | §1（T-1..T-4） | covers: t-08b330 |
| t-7238c5（t4 研发） | §1（T-3/T-4） | covers: t-7238c5 |
| t-a4a561（t4 联调） | §2（tools-schema 45 例 / render-summaries 20 例） | covers: t-a4a561 |
| t-b066b1（t4 复核） | §1 + §2 | covers: t-b066b1 |
| t-dfa37e（t4 测试） | §5（故障注入变红后复绿、无残留） | covers: t-dfa37e |
| t-3d5305（t5 父·收口） | §1–§6 全部 | covers: t-3d5305 |
| t-b97221（t5 研发） | §3 + §6.1 | covers: t-b97221 |
| t-432253（t5 复核） | §6.2 + §7 | covers: t-432253 |
| t-3d66cd（t5 测试） | §1 + §3 + §6.2 | covers: t-3d66cd |

## 8 结论

本需求四条修复的测试面**全部跑通且可复核**；回归面零新增失败；唯一未实测项已如实降级并写明原因。
