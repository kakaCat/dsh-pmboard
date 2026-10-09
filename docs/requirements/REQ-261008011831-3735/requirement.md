---
id: REQ-261008011831-3735
title: 测试卫生收尾：活卡单点新红 + 基线落账
category: chore
status: brainstorming
created_at: 2026-10-08T01:18:31+08:00
source: P1（REQ-261007223647-da5d）审计发现的尾巴，经 session-be1b4f3d 交接立项
---

# 测试卫生收尾：活卡单点新红 + 基线落账

> **TL;DR**：基线清单里两条旧行原文随源码重写漂移，致活卡单点用例双向红；
> 两处 status-label 判定改走 `isCanceled` 单点、清掉失效条目、基线重新落账，三条命令转绿。

## 背景（审计结论，已复核属实）

`npx vitest run tests/live-tasks-single-source.test.ts` 2 failed（⑤新增即红 / ⑥清单漏判据）。
根因不是「新增了手写活卡判定」，而是**基线清单条目文本漂移**：

- 1c22464（源码累积同步）改写了两处既有 status-label 行的形态：
  - `report-band.ts:290`：`? (status === 'canceled'`（三元）→ `if (status === 'canceled') {`
  - `report-head.ts:485`：行尾 `</div></div>` → `</div>`（结构重做少了一层壳）
- 449f730 同步基线夹具时仍登记**旧行原文**，于是同一逻辑点在测试眼里同时是
  「基线外新命中」（⑤红）与「清单条目源码里已不存在」（⑥红）。

两行均为终态文案分支（已取消 vs 已归档），语义未变。

| # | 文件 | 位置 | 现状（红线因） | 改法 |
|---|------|------|----------------|------|
| 1 | report-head.ts | :485 | `h.status === 'canceled'` 手写，且行尾从 `</div></div>` 漂成 `</div>` | `isCanceled(h)` |
| 2 | report-band.ts | :290 | 三元 `? (status === 'canceled'` 被重写成 `if (status === 'canceled') {` | `isCanceled(report.head)` |
| 3 | canceled-literal-baseline.json | baseline ×2 | 两条条目指向的旧行原文已不在源码中（⑥红的另一半） | 逐条核对后删除 |

## 边界

**做（in-scope）**：

- `src/client/views/report-head.ts` 仅 485 行：`(h.status === 'canceled' ? …)` → `isCanceled(h)`
- `src/client/views/report-band.ts` 仅 290 行：`if (status === 'canceled')` → `isCanceled(report.head)`
- `tests/fixtures/canceled-literal-baseline.json`：删除两条失效 baseline 条目（行原文已不在源码中）
- `npx tsx scripts/test-baseline.mts --refresh` 落账（两处收掉、确认无新引入失败之后）

**不做（out-of-scope）**：

- report-head.ts / report-band.ts 其余行一律不动
- 工作树 234 个在途改动（其他需求）一律不碰、不提交
- 不顺手「优化」基线清单里其余 37 条存量条目

## 功能条款（CH）

- **CH-1: 活卡单点用例清零新红**——`npx vitest run tests/live-tasks-single-source.test.ts` 全绿（17/17，
  退出码 0）；改前读数为 2 failed（⑤/⑥各一条）。
- **CH-2: 两处判定改走单点**——改动后两行原文不再命中 `/status\s*(?:!==|===)\s*['"]canceled['"]/`，
  且渲染输出不变（终态仍出「已取消/已归档，无可执行动作」与「已取消：无验收结论」）；
  `git diff` 仅含两处判定式替换 + 两条 import，无其他行改动。
- **CH-3: 基线落账转 PASS**——refresh 前 `--check` 先核对 21 条失败均非本次新引入，
  之后 `npx tsx scripts/test-baseline.mts --refresh` 落账，再 `--check` 输出 PASS。

## 失败与并发路径

- **改单点后 ⑥ 仍红**：两条失效 baseline 条目必须同步从清单删除（条目指向的行原文已不存在，
  与源码改法无关）；只改源码不清清单 = ⑥ 继续红。
- **误删有效条目**：清单条目按「文件 + 行原文」键匹配，删除前逐条核对源码中确无该行；
  删错会被 ⑤（该行进新增命中）当场抓回。
- **--refresh 掩盖新失败**：refresh 前必须先 --check 逐条核对失败清单，确认 21 条均为
  在途需求的已知失败；发现任何与本次两处文件相关的新失败 → 停止 refresh，先修。
- **并发风险**：工作树有大量在途改动；本需求只 add 上述三个文件，commit 用显式路径，绝不 `git add -A`。

## 完成判据

1. `npx vitest run tests/live-tasks-single-source.test.ts` → 全绿（CH-1）
2. `npx tsx scripts/test-baseline.mts --check` → PASS（CH-3）
3. `npx tsc --noEmit` → 0 错误

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| CH-1 | ✅ 已接收 | t-67a687 |
| CH-2 | ✅ 已接收 | t-67a687 |
| CH-3 | ✅ 已接收 | t-e5617b |

> 无未接收条款（3 条全部有落点）。

<!-- reqboard:marks:end -->
