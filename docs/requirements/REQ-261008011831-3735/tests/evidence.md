---
requirement_id: REQ-261008011831-3735
title: "测试证据：命令与读数摘要"
status: tests
category: chore
---

# 测试证据（REQ-261008011831-3735）

> 逐条命令与输出摘要；均为本工作区实测，读数为退出码 0 或注明因由。

| # | 命令 | 读数 | 判定 |
|---|---|---|---|
| 1 | `npx vitest run tests/live-tasks-single-source.test.ts` | `Tests 17 passed (17)`，exit 0（改前：2 failed——⑤新增即红 / ⑥清单漏判据） | ✅ CH-1 |
| 2 | `npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts` | `94 passed`，exit 0 | ✅ CH-2（行为不变） |
| 3 | `npx tsc --noEmit` | exit 0、`error TS 0 条` | ✅ |
| 4 | `npx vitest run tests/archive-*.test.ts tests/kb-*.test.ts` | `29 files / 263 passed`，exit 0（授权外扩修复零回归） | ✅ |
| 5 | `npx vitest run tests/baseline-triage.test.ts tests/compat-req-261006201814.test.ts` | `18 passed`，exit 0（三份清单同源不变量完好） | ✅ |
| 6 | `npx tsx scripts/test-baseline.mts --check` | `本次失败 16 条 / 基线 68 条 · 新增失败 0 / 不再失败 52 · tsc 退出码 0`，exit 1 | ⚠️ 唯一原因是基线陈旧（未引入新红） |
| 7 | `git diff --stat`（本需求落点） | `report-head.ts +2/-1`、`report-band.ts +2/-1`、`canceled-literal-baseline.json 0/-12` | ✅ 范围 |
| 8 | `git status --porcelain docs/reviews/`（跑 `--check` 前后） | 两次均为空 | ✅ 证明 `--check` 只读，不触碰他需求台账 |

**失败子集读数轨迹（供复盘）**：21（交接口径）→ 18（修掉本需求自伤 3 条）→ **16**（授权外扩再修 2 条）；16 条逐条归属见 `verification.md` 第三节，无一条属本需求。

## 任务卡覆盖对照（逐卡对到证据）

> 口径：每张卡的产出对应上表哪几行读数。**`covers:` 单独成行**——RTM 的测试文档解析器只认独立行上的标注，写进标题行不会被取到（本需求实测：写标题行时覆盖度为 0%）。

### 父卡 t1｜活卡单点改造

covers: t-67a687

- 对应读数：第 1、2、7 行（用例 17 passed、渲染 94 passed、diff 恰三文件）。

### 子卡｜研发段

covers: t-8116c8

- 对应读数：第 1 行（两处判定改走 `isCanceled` 后 2 failed → 17 passed）；改动文件见第 7 行。

### 子卡｜复核段

covers: t-11ca63

- 对应读数：第 2、7 行（渲染行为不变 + diff 范围）；逐条核对结论见 `reviews/review-notes.md` 第一节。

### 父卡 t2｜基线核对落账与类型检查收口

covers: t-e5617b

- 对应读数：第 5、6 行（三份清单同源 18 passed；`--check` 新增失败 0 / tsc 0）。

### 子卡｜研发段

covers: t-d97ccf

- 对应读数：第 6、8 行（只读取数与归属核对、`--check` 前后 `docs/reviews/` 均干净）。

### 子卡｜复核段

covers: t-03537d

- 对应读数：第 1、5、6 行；设计四文档与实测一致、16 条归属逐条有据（见 `reviews/review-notes.md` 第三节）。

### 子卡｜测试段

covers: t-18eb2a

- 对应读数：第 3、4 行（`tsc` 0 错误；锚点与相邻回归全绿）；失败数 16 ≤ 开工前基线 68 且新增 0。
