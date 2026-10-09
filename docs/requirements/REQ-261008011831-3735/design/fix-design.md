---
requirement_id: REQ-261008011831-3735
title: "测试卫生收尾设计：两处 status-label 行改走 isCanceled 单点 + 基线落账"
status: design
owner: "session-646e8ead"
category: chore
requirement_refs: [CH-1, CH-2, CH-3]
---

# 设计说明（REQ-261008011831-3735）

> 读者：实施者与验收人。本设计**只写怎么做**，不含任务表（属拆分阶段）。
> 定性来源：本窗口只读取证（`npx vitest run tests/live-tasks-single-source.test.ts` 实测 2 failed、
> `git show 1c22464` 行级 diff、`git log --ancestry-path` 提交顺序），每条结论有命令读数或 `文件:行` 依据。

## 目标与范围 <!-- serves: CH-1, CH-2, CH-3 -->

**目标**：把 `tests/live-tasks-single-source.test.ts` 的 2 条红清零（⑤新增即红 / ⑥清单漏判据），
并把全仓测试基线按现状重新落账，使 `--check` 转 PASS、`tsc --noEmit` 0 错误。

**范围**：三个文件、两行源码、两条清单条目。

| 文件 | 改动 | 依据 |
|---|---|---|
| `src/client/views/report-head.ts` | 仅 :485 判定式改单点（+1 行 import） | CH-2 |
| `src/client/views/report-band.ts` | 仅 :290 判定式改单点（+1 行 import） | CH-2 |
| `tests/fixtures/canceled-literal-baseline.json` | 删 baseline 两条失效条目 | CH-1 / CH-3 |

**非目标**：report-head.ts / report-band.ts 其余行、清单其余 39 条存量条目、工作树在途改动（234 项）。

## 根因（实测，不是推断） <!-- serves: CH-1, CH-2 -->

两行都是**终态文案分支**（已取消 vs 已归档）的 status-label 判定，语义从未变；红是**清单文本漂移**：

| 步 | 提交 | 发生了什么 | 读数 |
|---|---|---|---|
| 1 | `311ef97`（详情页样式重做） | 两行写成初始形态 | `report-band.ts` 三元 `? (status === 'canceled'`；`report-head.ts` 行尾 `</div></div>` |
| 2 | `1c22464`（源码累积同步） | 同两行**形态**被改写 | band：`if (status === 'canceled') {`；head：行尾 `</div>`（少一层壳） |
| 3 | `449f730`（用例/夹具同步，**晚于** 1c22464） | 清单仍登记**旧行原文** | 键 =「文件 + 行原文」⇒ 旧键在源码里消失（⑥），现行原文不在清单里（⑤） |

- 提交序：`git rev-list --count 449f730..1c22464` = 0 / 逆序 = 1 ⇒ 夹具同步晚于源码改写，是夹具侧漏跟。
- 用例双向钉死：`hits ⊆ baseline`（⑤）+ `baseline ⊆ hits ∪ collected`（⑥）⇒ 只改源码不清清单 ⑥ 仍红，
  只清清单不改源码 ⑤ 仍红（因为现行原文就是手写命中）。**两边必须一起动**，这是本设计的关键约束。

## 修法选择 <!-- serves: CH-2 -->

两条路（用例错误文案给的出口）：① 改调 `domain/status/Predicates.ts` 单点；② 清单登记基线条目并写 reason。

**取 ①**，理由：

1. 两处判定就是「这是不是已取消」，正是 `isCanceled` 的语义；单点纪律（`docs/architecture/live-card-single-source.md`）
   要求判定不散落消费点，② 只是把漂移合法化，等于承认消费点可以继续手写。
2. 走 ① 后这两行**离开命中集合**，不需要为它们维护基线键——行原文再漂移也不再假红。
3. 清单条目本来就按「行原文」做键，status-label 行的文本极不稳定（本轮就是被结构重做改掉的）；
   能出清一条就少一条会烂的键。

**逐处改动（精确到行）**

| # | 文件:行 | 改前 | 改后 |
|---|---|---|---|
| 1 | `src/client/views/report-head.ts:485` | `+ (h.status === 'canceled' ? '已取消' : '已归档') + '，无可执行动作</div>'` | `+ (isCanceled(h) ? '已取消' : '已归档') + '，无可执行动作</div>'` |
| 2 | `src/client/views/report-band.ts:290` | `if (status === 'canceled') {` | `if (isCanceled(report.head)) {` |
| 3 | 两文件 import 区 | —（无 Predicates import） | `import { isCanceled } from '../../domain/status/Predicates.js'` |

- `report-head.ts` 的 `h = report.head`（:433），`ReportHead.status` 满足 `HasStatus`；
- `report-band.ts` 的 `status` 常量（:274）在 :277/:294/:296/:298/:301/:303 仍被使用 ⇒ **保留常量**，
  只把 :290 判定改成读 `report.head`（不引入 `{ status }` 包装对象，少一层临时物）。
- 层边界：`client/views → domain/status` 已有同级先例（`board.ts:14` 的 `liveTasksOf`），不越界。

**输出不变**：两处只换判定来源，文案串一字不改 ⇒ 终态仍渲染「已取消/已归档，无可执行动作」
与「已取消：无验收结论」，现有渲染断言不受影响。

## 清单处置 <!-- serves: CH-1 -->

删除且仅删除这 2 条 `baseline`（逐条核对源码中确无该行原文；删错会被 ⑤ 当场抓回）：

| 文件 | 待删条目行原文 | 原 reason | 删除依据 |
|---|---|---|---|
| `src/client/views/report-band.ts` | `? (status === 'canceled'` | status-label | 源码已无此行（改写成 :290 的 if 形态），且 :290 本轮改单点出清 |
| `src/client/views/report-head.ts` | `+ (h.status === 'canceled' ? '已取消' : '已归档') + '，无可执行动作</div></div>'` | status-label | 源码已无此行（少一层 `</div>`），且 :485 本轮改单点出清 |

`collected` 18 条与其余 37 条 baseline 一律不动（用例 ②③ 靠它们守着）。

## 基线落账 <!-- serves: CH-3 -->

```text
1) npx vitest run tests/live-tasks-single-source.test.ts   → 17/17 全绿（CH-1）
2) npx tsx scripts/test-baseline.mts --check               → 先看 21 条失败逐条归属
3) 核对：21 条均不含本需求三文件 / 均为在途需求已知失败 ⇒ 才允许 refresh
4) npx tsx scripts/test-baseline.mts --refresh             → 落账
5) npx tsx scripts/test-baseline.mts --check               → PASS
6) npx tsc --noEmit                                        → 0 错误
```

- 步骤 3 是**刹车**：refresh 会把「当前失败集合」当成新基线，若其中混入本需求引入的新失败就被永久掩盖。
  逐条核对是 refresh 的前置条件，不满足即停。
- refresh 只改基线文件（`docs/reviews/test-baseline.*` 一类），不含生产代码。

## 风险与失败路径 <!-- serves: CH-1, CH-3 -->

| 风险 | 表现 | 处置 |
|---|---|---|
| 只改源码漏清清单 | ⑥ 仍红，点名两条失效条目 | 两边同批改（本设计已把清单处置列为必做项） |
| 清错清单条目 | ⑤ 点名该行进入新增命中 | 删前逐条 grep 源码确认行原文不存在 |
| refresh 掩盖新失败 | --check PASS 但真问题入基线 | refresh 前逐条核对 21 条归属；与本需求三文件相关的一律先修 |
| 误碰在途改动 | 其他需求被卷进 diff | 改动只落三文件；提交用显式路径 `git add <三个文件>`，不 `git add -A` |
| band 的 `status` 常量被误删 | 编译错误 / 渲染回归 | :290 只改判定，常量保留（本设计已声明） |
