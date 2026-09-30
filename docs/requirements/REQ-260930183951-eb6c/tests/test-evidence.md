# 测试证据与覆盖标注 · REQ-260930183951-eb6c

> **TL;DR**：6 组测试用例覆盖全部 29 张任务卡；每组给出**可复核命令 + 实测结果**。
> 覆盖标注用 `covers: t-xxx`（RTM 覆盖度门禁据此计算，验收阶段要求 ≥80%）。
>
> 说明：本文件同时是「生产链路自证」的落盘证据；整链用例 `tests/sheet-selfproof.test.ts`
> 用真实 use case 跑通「验收单生成」这条链，不依赖宿主状态即可复跑。

## TC-1 前置修复：4 个缺失模块复原 + 插件装载层重建 serves: FR-1, FR-2, FR-3, FR-4
covers: t-947a4b, t-8c1d86, t-a36c24, t-b843eb, t-e1930c

**命令与实测**：

```
$ npx vitest run tests/verification-sheet.test.ts
  Test Files  1 passed (1) / Tests  10 passed (10)      # 修复前：Failed to load url ../internal/auto-confirm.js
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
  213                                                    # 修复前 220
$ cd ~/.dsh/profiles/desktop && node -e "import('dsh-pmboard')"
  LOAD OK（7 exports）
$ DSH 加载器 loadProfileDirectory + composeEntries（desktop profile）
  layers: dsh-pmboard, dsh-notice-webhook；skippedBundles 无 dsh-pmboard；组合结果含 {id:'pmboard', name:'dsh-pmboard'}
```

## TC-2 FR-1 任务投影透传 parentId serves: FR-1
covers: t-9b2ca1, t-d462dd, t-06cf08, t-e60138, t-b0f4de

**命令与实测**：

```
$ npx vitest run tests/sheet-projection.test.ts
  4 passed (4)
$ npx vitest run tests/sheet-projection.test.ts tests/verification-sheet.test.ts
  14 passed (14)
$ grep -c "toSheetTasks" src/application/use-cases/SubmitVerification.ts
  3
$ grep -c "acceptance: t.acceptance" src/application/use-cases/SubmitVerification.ts
  0
```

**证伪检查（可复核）**：临时删掉 `toSheetTasks` 返回对象里的 `parentId` 透传 → 重跑 `tests/sheet-projection.test.ts`
→ **2 failed | 2 passed**（TC-1.1、TC-1.4 变红）；恢复后 4 passed。证明该用例真的在守投影，而不是"碰巧绿"。

## TC-3 FR-2 验收锚点存在性守卫 serves: FR-2
covers: t-f38bac, t-d074c7, t-8e6449, t-31e937, t-738e2c

**命令与实测**：

```
$ npx vitest run tests/sheet-anchor-gaps.test.ts
  7 passed (7)          # 存在不报 / 缺失点名 / 多失效只出一条项 / pending+consistency / 非测试文件不触发 / canceled 不征集 / 无 tests 目录整段跳过
$ npx vitest run tests/sheet-selfproof.test.ts
  1 passed              # 断言出现以「验收锚点失效」开头的项，criterion 含 tests/gone-forever.test.ts
$ grep -n "anchorGaps" src/domain/workflow/AcceptanceSheetSpec.ts src/application/use-cases/SubmitVerification.ts
  两处均命中
```

## TC-4 FR-3 系统项编号连续化 serves: FR-3
covers: t-0cc3c9, t-8b745f, t-cfb44b, t-beb9d9, t-30a8aa

**命令与实测**：

```
$ npx vitest run tests/sheet-items-format.test.ts
  7 passed (7)          # 含 TC-3.2「只触发 E2E 缺口不跳号」（2d65 事故形态回归）
$ grep -c "taskCount +" src/domain/workflow/AcceptanceSheetSpec.ts
  0                     # 预留位已清除
$ npx vitest run tests/domain/acceptance-sheet.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts
  全绿
```

**整链断言**（tests/sheet-selfproof.test.ts）：`sheet.items.map(i => i.id)` 严格等于 `v1-1..v1-N`（N === items.length）。

## TC-5 FR-4 需求级项标题单点 serves: FR-4
covers: t-da9b73, t-9727d0, t-edf862, t-1caf34, t-543bfd

**命令与实测**：

```
$ npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts
  17 passed (17)
$ grep -rn "'需求级验收'" src
  只在 src/domain/workflow/AcceptanceSheetSpec.ts 命中（单点 + 一处解释性注释）
$ npx vitest run tests/verification-sheet.test.ts tests/accept-sheet-tool.test.ts
  全绿
```

**渲染断言**：同一张验收单内需求级项标题去重后数量 === 项数（无重名）。

## TC-6 端到端回归 + 生产链路自证 serves: FR-1, FR-2, FR-3, FR-4
covers: t-299ce9, t-4d15ad, t-fd23ce, t-ba0429

**命令与实测**：

```
$ npx tsdown -c tsdown.config.mjs 2>&1 | tail -1
  Build complete in 1203ms                       # dist/index.mjs 1,102,507B
$ npx vitest run 2>&1 | grep "Tests "
  103 failed | 2628 passed | 20 skipped (2751)   # 失败数与施工前基线同为 103（零新增）
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
  213                                            # 不高于基线
$ npx vitest run tests/sheet-selfproof.test.ts
  1 passed                                       # 1 父卡 + 3 子卡 + 1 失效锚点，一次断言 FR-1~FR-4
```

**整链自证断言**（`tests/sheet-selfproof.test.ts`，不依赖宿主状态、可复跑）：

| FR | 断言 |
|---|---|
| FR-1 | `taskIds === ['t-parent','t-broken']`（3 张子卡一张未进） |
| FR-2 | 存在以「验收锚点失效」开头的项，criterion 含 `tests/gone-forever.test.ts`，`gapKind=consistency`、`status=pending` |
| FR-3 | `items.map(i => i.id)` 严格等于 `v1-1..v1-N` |
| FR-4 | 需求级项标题去重后数量 === 项数（无重名） |

**如实声明（未美化）**：宿主 19:44 加载的是 18:43 的构建，本轮代码改动（19:21 之后）尚未被运行实例加载，
`dist` 于 20:23 重建。因此「宿主已加载新构建」这一条件**不成立**——本组自证以可复现的整链用例替代，
**不声称**运行实例端到端自证通过。补做方式：重启宿主后重交 `verification`，验收单将由新构建生成。
