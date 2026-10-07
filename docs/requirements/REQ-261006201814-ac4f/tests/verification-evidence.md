# 验收证据（REQ-261006201814-ac4f · 复核用）

> 每条都是**可直接重跑**的命令 + 当时的输出摘要。工作树指纹同刻：HEAD `d0f01d6` ·
> `git status --porcelain` 433 个改动（含别的窗口的在飞改动）。

## 一、判据命令与结果

| # | 命令 | 结果摘要 |
|---|---|---|
| 1 | `npx vitest run tests/error-code-matrix.test.ts` | 22/22 通过；读数「大写码 132 · 字面量覆盖 120 · 常量覆盖 7 · 零覆盖 5 · 假阴性率 5.51%」 |
| 2 | `npx vitest run tests/error-code-inventory.test.ts` | 11/11；口径守卫（缺码 / 假阴性双形态 / 排除项恰 5 条）全绿 |
| 3 | `npx vitest run tests/error-code-exempt.test.ts` | 3/3；三个反例（删条目 / `frozenCount` 加一 / 清空 `reason`）各自变红后还原逐字节一致 |
| 4 | `npx vitest run tests/baseline-triage.test.ts` | 11/11；`reverse ∪ other == failures`、互斥、notes 双向相等、类别受控 |
| 5 | `npx tsx tests/drill/triage-baseline.mts` | 差集全 0（新增未分诊 0 / 消失 0 / 重叠 0 / notes 双向差 0），退出码 0 |
| 6 | `npx vitest run tests/hermetic-guard.test.ts` | 8/8；仓内写入 `ERR_ACCESS_DENIED`、临时目录放行、仓内零残留、契约三条在场、已知残留洞在案 |
| 7 | `npx vitest run tests/workspace-root.test.ts` | 8/8；测试根解析与 `resolveWorkspaceRoot` 语义逐字保留 |
| 8 | `npx tsx tests/drill/ab-attribution.mts` | `introduced=0 · fixed=3 · stable=true`（4 文件 × 两侧各 2 次）；产物 `docs/reviews/REQ-261006201814-ac4f-ab.json` |
| 9 | `npx vitest run tests/ab-attribution.test.ts` | 6/6；四个合成反例（真回归 / 无改动 / 复跑不一致 / 空侧）逐条 |
| 10 | `npx vitest run tests/drill/../tests/authorization-matrix.test.ts tests/concurrency-matrix.test.ts tests/empty-input-matrix.test.ts` | 19/19；越权 24 格、并发 4 格、空输入 8 格，每格三件套 + 计数断言 |
| 11 | `npx tsx tests/drill/reverse-drill-error-codes.mts` | 退出码 0；五条演练全部 `exit=1`、`named=true`、`restored=true` |
| 12 | `npx vitest run tests/compat-req-261006201814.test.ts` | 7/7；交付清单无 `src`、基线不增、分诊自洽、契约双层、自助路径在场 |
| 13 | `npx tsx tests/drill/compat-probe.mts` | 删除断言行数 105（棘轮上界 105，未抬高）；`src` 改动 96 个文件（**全部来自别的窗口**，如实报出） |
| 14 | `npx tsc --noEmit -p tsconfig.json` | 0 错误（全仓） |
| 15 | `npx tsx scripts/test-baseline.mts --check` | 新增失败 7 / 不再失败 9；差的 7 条经「带沙箱 / 去沙箱」同批 A/B 逐条相同 ⇒ 非本次引入 |

## 二、本需求新增/修改的文件（28 项，无 `src/`）

**新增（19）**：`tests/helpers/code-trigger-harness.ts`、`tests/helpers/code-assert.ts`、
`tests/helpers/ledger-probe.ts`、`tests/helpers/ab-attribution.ts`、`tests/error-code-matrix.test.ts`、
`tests/error-code-exempt.test.ts`、`tests/baseline-triage.test.ts`、`tests/authorization-matrix.test.ts`、
`tests/concurrency-matrix.test.ts`、`tests/empty-input-matrix.test.ts`、`tests/ab-attribution.test.ts`、
`tests/compat-req-261006201814.test.ts`、`tests/fixtures/error-code-exempt.json`、
`tests/drill/triage-baseline.mts`、`tests/drill/ab-attribution.mts`、
`tests/drill/reverse-drill-error-codes.mts`、`tests/drill/compat-probe.mts`、
`docs/reviews/REQ-261006201814-ac4f-ab.json`、`docs/reviews/REQ-261006201814-ac4f-compat.json`。

**修改（9）**：`vitest.config.ts`、`tests/application/harness.ts`、`tests/helpers/workspace-root.ts`、
`tests/helpers/tool-deps.ts`、`tests/setup/hermetic-guard.ts`、`tests/setup/hermetic-contract.ts`、
`tests/hermetic-guard.test.ts`、`tests/fixtures/error-code-inventory.json`、
`tests/workspace-root.test.ts`（后两者为 v1 落地/本需求刷新）。

**断码升级触及的既有测试文件（26）**：上半批 4 + 下半批 18 + v1 一次性点位 4，均为**只追加**。

## 三、怎么独立复核（给验收人）

1. 跑「一、判据命令」的 1–15（约 3 分钟，除 15 要跑全量）。
2. 想验「判据真的在判」：`npx tsx tests/drill/reverse-drill-error-codes.mts` —— 它会把五个目标改坏、
   确认变红并点名、再逐字节还原；跑完 `git status` 对五个目标文件应无残留改动。
3. 想验「归因不是空话」：`npx tsx tests/drill/ab-attribution.mts` —— 产物里 `introduced` 必须为空。
4. 想验「没靠删断言变绿」：`npx tsx tests/drill/compat-probe.mts` —— 删除断言行数不得高于 105。

## 四、任务覆盖标注（台账 41 张卡 ↔ 测试证据）

> 验收的测试覆盖度门按 `covers: <taskId>` 统计。下表把本需求台账里**每一张卡**映射到承载它的
> 测试证据（守卫用例 / 矩阵 / 演练脚本 / 复核用例）。第二版实际执行的是 12 张父卡及其子卡；
> 少量 v1 遗留卡（t-f4d774 / t-b729f1 / t-222f06 / t-4ccfd6 / t-549fd6 / t-4594a8）的产物由第二版
> **沿用或另机制承接**（见 `../reviews/delivery-review.md` 第四节与卡文档说明）。

### 口径与矩阵（FR-1 / FR-2 / FR-3）
covers: t-f4d774
covers: t-b729f1
covers: t-e965b8
covers: t-dea44a
covers: t-780910
covers: t-0f2829
covers: t-a1ac90
covers: t-90aa93

### 基线分诊（FR-4）
covers: t-30e361
covers: t-6ce03a
covers: t-826916

### hermetic 三层（FR-5）
covers: t-222f06
covers: t-4ccfd6
covers: t-549fd6
covers: t-4594a8
covers: t-494cf9
covers: t-588db4
covers: t-d0015d
covers: t-707495
covers: t-a35a46
covers: t-78d787
covers: t-bb286e
covers: t-f780bf
covers: t-0ef7ef

### 断码升级（FR-6）
covers: t-644550
covers: t-af996f
covers: t-c3f340
covers: t-500e70
covers: t-2c5be8
covers: t-6ee399

### 三张矩阵（FR-7）
covers: t-007168
covers: t-a1dcc3
covers: t-e60b41

### 反向演练（FR-8）
covers: t-d25b30
covers: t-0df2f6
covers: t-8f2d59

### A/B 归因（FR-10）
covers: t-88a974
covers: t-8191a7
covers: t-0ebf90

### 收口（FR-1 / FR-2 / FR-4 / FR-5 / FR-9 / FR-10）
covers: t-4c2f6a
covers: t-4a486d
