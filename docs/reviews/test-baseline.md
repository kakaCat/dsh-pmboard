# 现行回归基线（test-baseline）

> 本文件是**现行**基线，不是历史快照：`--refresh` 覆盖上半部分，只在「刷新历史」表追加一行。
> `docs/requirements/**` 里的基线数字是**当时的快照，不追改**（证据优先）。

## 现行基线（采集于 2026-10-06 13:30）

- 工作树指纹：HEAD `5dff7e2` · `250 files changed, 15368 insertions(+), 1838 deletions(-) · 含未跟踪共 402 个改动（其中未跟踪 152）`
- vitest：失败用例 **68** 条 / 共 6024 用例（通过 5956）
- vitest 文件：37 failed / 471 passed / 0 skipped
- tsc：`退出码 0`，error TS **0** 条
- 失败用例集合：见 `docs/reviews/test-baseline.failures.txt`（逐条 `文件 :: 用例名`）
- 采集命令：`npx tsx scripts/test-baseline.mts --refresh`

## 判据（怎么算过）

- `npx tsx scripts/test-baseline.mts --check` → 输出差集为空、**exit 0** ⇒ 本次改动零新增失败。
- 差集非空 ⇒ exit 1，先逐条确认是否本次引入；**确认非本次引入**才允许 `--refresh`（刷基线 = 承认现状）。
- 口径是**集合差**，不是计数上限：数字过期不会让判据失效。
- 基线文件缺失 ⇒ exit 1 并报「没有基线，先 refresh」——**缺基线不得当作通过**。

## 刷新历史

| 日期 | HEAD | 工作树指纹摘要 | 失败用例数 | tsc | 刷新人 | 理由 |
|---|---|---|---|---|---|---|
| 2026-10-06 13:18 | `5dff7e2` | 250 files changed, 15368 insertions(+), 1838 deletions(-) | 68 | 0 | 本需求窗口 agent | 首次建立 / 刷新基线 |
| 2026-10-06 13:20 | `5dff7e2` | 250 files changed, 15368 insertions(+), 1838 deletions(-) · 含未跟踪共 402 个改动（其中未跟踪 152） | 68 | 0 | 本需求窗口 agent | 首次建立 / 刷新基线 |
| 2026-10-06 13:30 | `5dff7e2` | 250 files changed, 15368 insertions(+), 1838 deletions(-) · 含未跟踪共 402 个改动（其中未跟踪 152） | 68 | 0 | 本需求窗口 agent | 首次建立 / 刷新基线 |
