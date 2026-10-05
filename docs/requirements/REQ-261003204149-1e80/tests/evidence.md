# 测试证据（REQ-261003204149-1e80）

> 全部命令均在本仓工作区实跑，输出摘要如实摘录；失败数一律与**现场基线**（同一工作区、只差本需求改动）比对。

## 一、分项证据

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/rollback-domain.test.ts` | 19 passed |
| `npx vitest run tests/rollback-revocation.test.ts` | 9 passed |
| `npx vitest run tests/rollback-tasks.test.ts` | 7 passed |
| `npx vitest run tests/move-rollback.test.ts` | 19 passed（≥16 验收要求） |
| `npx vitest run tests/artifact-gates.test.ts` | 32 passed |
| `npx vitest run tests/decompose-tools.test.ts` | 25 passed / 5 failed（与基线逐字相同 → 既有失败） |
| `npx vitest run tests/output-contract.test.ts -t 回退` | 1 passed |
| `npx vitest run tests/queue tests/reqboard` | 471 passed（数据契约兼容性验收命令） |
| `npx vitest run tests/reqboard.test.ts tests/api-client.test.ts tests/board-info-fixes.test.ts` | 全绿（看板回执消费方回归） |

## 二、判别力 A/B（撤掉修复 → 期望用例必红）

| 撤掉什么 | 期望红 | 实测 |
|---|---|---|
| 产物门豁免 | TC-4 | `1 failed \| 18 skipped` |
| 撤销语义 | TC-7 | `1 failed \| 18 skipped` |
| 拆分守卫放行 | TC-11 | `1 failed \| 18 skipped` |
| 编排顺序（两行赋值互换） | 原子性 | `1 failed \| 1 passed` |
| 工具侧不编排 | 双通道 | `1 failed \| 1 passed` |
| 断点/自动链重算 | 注入 | `1 failed \| 1 passed` |
| `tasks_reworked` 声明 | 回退契约用例 | `1 failed`，消息含「未在 output.schema 声明」且指向 `rollback.tasks_reworked` |
| 状态机回退边（`rollbackTargetsOf` 恒空） | 域用例 | `5 failed` |
| 撤章逻辑（恒不执行） | 撤销用例 | `3 failed` |
| 重做卡关系（切断 `reworkOf`） | 卡处置用例 | `1 failed` |

恢复后各套件均回到全绿（已逐次验证）。

## 三、全量回归（现场基线对照）

```
含本需求改动：Tests  98 failed | 3418 passed | 20 skipped (3536)
现场基线     ：Tests  98 failed | 3356 passed | 20 skipped (3474)
仅本需求新增失败：∅（comm -13 差集为空）
通过数增量      ：+62 = 本需求新增用例 19+9+7+19+5+2+1 …
```

`npx tsc --noEmit`：**150 = 基线 150**（无新增）。
`pnpm build`：退出码 0，`[verify-client] OK  bundle=337856 bytes`。

## 四、代码回滚演练

```
git stash push -u（本需求 14 源文件 + 10 测试文件）
npx vitest run tests/queue   → 122 passed
git stash pop                → 恢复成功（4 个新增源文件与 2 个新增测试文件均在位）
npx vitest run tests/move-rollback.test.ts tests/rollback-domain.test.ts → 38 passed
```

## 五、归属对照（证明"既有失败"不是本次引入）

对 `routes-rollup`（2 例）、`layer-boundary`（3 例）、`interruption-checkpoint`（3 例）、
`decompose-tools`（5 例）四组失败均做过 `git stash` 对照：**改动前同样红**，
且命中文件均非本需求文件。基线清单逐字比对见 `/tmp/fa*.txt` 的 `comm` 差集输出。

## 六、任务覆盖标注（covers）

本需求的 13 张父卡与 44 张子卡，其验收标准均由上文各套件覆盖：

- covers: t-267cd0
- covers: t-65ce9a
- covers: t-7ef8ec
- covers: t-323848
- covers: t-101332
- covers: t-222a7f
- covers: t-290834
- covers: t-8b1e60
- covers: t-0b9f35
- covers: t-c822dd
- covers: t-1770d4
- covers: t-2ebbbc
- covers: t-962b4d
- covers: t-a377ac
- covers: t-9c26be
- covers: t-a8880e
- covers: t-6be981
- covers: t-52cd3a
- covers: t-55ad43
- covers: t-a413ec
- covers: t-b6359e
- covers: t-377d5e
- covers: t-03d205
- covers: t-40f29b
- covers: t-ab6907
- covers: t-1654f9
- covers: t-9e383e
- covers: t-adbd05
- covers: t-206787
- covers: t-415fbf
- covers: t-32ac13
- covers: t-bd1129
- covers: t-47be24
- covers: t-8e34c0
- covers: t-c5ccfc
- covers: t-10b21c
- covers: t-8cee43
- covers: t-f0ea81
- covers: t-9c5b64
- covers: t-c137d0
- covers: t-54a996
- covers: t-88e6a5
- covers: t-a74caa
- covers: t-f77cc9
- covers: t-ebba71
- covers: t-cdb5b9
- covers: t-c72a54
- covers: t-336b7c
- covers: t-bcc7e8
- covers: t-8ccbdf
- covers: t-60f39e
- covers: t-5828e7
- covers: t-a17161
- covers: t-8b9244
- covers: t-6e64ce
- covers: t-23fc04
- covers: t-c49f13
- covers: t-44e588
- covers: t-0f32e9
