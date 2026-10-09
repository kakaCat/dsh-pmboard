# 拆分计划（REQ-261008011831-3735）

> 目标：把 `tests/live-tasks-single-source.test.ts` 的 2 条因**清单文本漂移**而红的用例修到绿，
> 再把全仓测试基线按修复后的失败集合重新落账，使 `--check` 转 PASS、`tsc --noEmit` 0 错误。
> 做法：两处 status-label 判定改走 `isCanceled` 单点（连带清掉 2 条失效清单条目），
> 然后单独一张卡做基线核对与落账。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| CH-x | `requirement.md`「功能条款（CH）」 | 本需求的维护条款（chore 档用 CH） |
| t-x | 本文档任务表 | 计划内任务键 |

设计文档只有一份：`design/fix-design.md`（chore 档不设 interfaces.md / frontend.md，故无接口/组件对照表）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 两处终态文案判定改走 isCanceled 单点并清失效清单条目 | CH-1, CH-2 | `src/client/views/report-head.ts`、`src/client/views/report-band.ts`、`tests/fixtures/canceled-literal-baseline.json` | implement | frontend | — | S | `npx vitest run tests/live-tasks-single-source.test.ts` → `Tests 17 passed (17)`、退出码 0（改前 2 failed）；`sed -n '485p' target=report-head.ts` 含 `isCanceled(h)` 且不再含 `status === 'canceled'`；`sed -n '290p' report-band.ts` 含 `isCanceled(report.head)`；清单里两条旧行原文 `grep -c` = 0；`git diff --stat` 仅 3 文件 |
| t2 | （落库后回填） | 基线核对落账与类型检查收口 | CH-3 | `docs/reviews/test-baseline.failures.txt`、`docs/reviews/test-baseline.md` | test | backend | t1 | S | 先 `npx tsx scripts/test-baseline.mts --check` 逐条核对 19 条失败均非本需求三文件引入（点名 0 条）；再 `--refresh` 落账；再 `--check` → PASS（退出码 0）；`npx tsc --noEmit` → 退出码 0、0 错误 |

- 一个任务只干一件事，标题动词开头。
- **落点**列全部是具体路径——不许写「相关模块」。
- 工作量口径：S = 半天内（本计划无 M / L）。
- **子卡段**：不显式声明，按需求分类兜底——chore 档默认 `研发 → 复核`（**无联调段**，故无需 `skipIntegration`）。

## 依赖与顺序

- `t2 → t1`：基线必须在**修复后**的失败集合上冻结，顺序不可倒置。两卡落点文件零交集
  （t1 改三个源/夹具文件，t2 只写基线文件），但语义上 t2 读的正是 t1 造成的失败集合，
  故这是**时序依赖**而非同文件依赖。

## 覆盖对照（CH ↔ 计划 key）

| 条款 | 计划 key | 落点说明 |
|---|---|---|
| CH-1 活卡单点用例清零新红 | t1 | 两处判定出清 + 清单两条失效条目删除后，⑤⑥ 同时转绿 |
| CH-2 两处判定改走单点 | t1 | 判定式替换为 `isCanceled(...)`，`git diff` 仅见两处替换与两条 import |
| CH-3 基线落账转 PASS | t2 | refresh 前逐条核对 19 条失败归属，refresh 后 `--check` PASS |

## 边界（与 requirement.md 一致）

- 只碰表中列出的 5 个文件；report-head.ts / report-band.ts 其余行不动。
- 工作树在途改动（234 项）一律不碰；提交用显式路径，不 `git add -A`。
