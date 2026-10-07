# T1/T2 证据：口径扩根与两处判据接线（REQ-261007095750-9f48）

covers: t-703099, t-31abfb, t-e270d4, t-beb829, t-7d58de, t-ab83a1

> 覆盖 t1（口径扩根）与 t2（两处判据接线）的工作与读数。真实数据读数另有
> `tests/real-data-readings.md`（t3）；文档与规范条目另有 `tests/t4-doc-sync-and-gates.md`（t4）。

## 1. 改了什么

| 文件 | 改动 |
|---|---|
| `src/application/internal/conflict-check.ts:28` | `PATH_RE` 根补 `src`、扩展名补 `mts`（**只改这一处**；`declaredFiles` 是冲突族唯一取数口，两个消费者自动跟随） |
| `tests/path-extraction-scope.test.ts`（新增） | 口径边界 7 例：`src` 命中（含深层目录）/ `.mts` 命中 / 目录名不命中 / 空输入与无扩展名不命中 / 既有四根与 `agent-dh/` 前缀不回归 / 去重 / 抽取器不查盘 |
| `tests/concurrency-limits.test.ts` | 冲突门 `src` 用例（互无依赖 + 同一 `src` 文件 → 1 条冲突；同链串行 → 不冲突）+ 端到端用例（`executeDecompose` 真入口 → 拒 `REQBOARD_FILE_CONFLICT`、落库 0 张） |
| `tests/plan-depends-e2e.test.ts` | 零交集建议 `src` 用例（`src↔src` 零交集 → 点名；有交集 → 不点名） |
| `tests/doc-gate-e2e.test.ts` | fixture 改为每卡改不同文件（见 §4） |

## 2. 读数（改动相关全部测试）

```
$ npx vitest run tests/path-extraction-scope.test.ts tests/concurrency-limits.test.ts \
    tests/plan-depends-e2e.test.ts tests/doc-gate-e2e.test.ts
 Test Files  4 passed (4) · Tests  34 passed (34)
   （path-extraction-scope 7 · concurrency-limits 10 · plan-depends 9 · doc-gate-e2e 8）

$ npx tsc --noEmit -p tsconfig.json
 本需求改动文件 0 错（存量 1 条：tests/query-docs-roots.test.ts，属并发窗口在制）
```

## 3. 证伪（两条改动各自的「红-绿」循环）

| 改动 | 证伪方式 | 结果 |
|---|---|---|
| t1 口径扩根 | 把 `PATH_RE` 的根改回四根 → 跑 `tests/path-extraction-scope.test.ts` | **4 例失败**（TC-1 / TC-2 / 去重 / 证伪锚）；改回 → 7 passed，文件与证伪前**逐字节一致** |
| t2 两处判据接线 | 去掉 `src` 根 → 跑两个测试文件 | **恰好 3 条新用例红**（16 passed / 3 failed）；还原 → 19 passed、逐字节一致 |

## 4. 扩根打到的既有 fixture（如实登记）

首次全量回归时 `tests/doc-gate-e2e.test.ts` 出现 **2 条新失败**，根因**正是本需求**：
该文件的 fixture 让两张卡都写 `改 src/x.ts`（同文件、无依赖），口径扩根后**冲突门先于条款门拦下**，
用例测不到它本来要测的条款覆盖门。**处置：改 fixture 让每张卡改不同文件（保留其原意），不放宽口径**；
修后该文件 8 passed，全量新增回到 11 条（**本需求引入 0 条**）。

## 5. 顺带纠正的一处设计说法（诚实登记）

设计初稿写「`declaredFiles` 是全仓唯一的路径抽取器」——实际 `src/domain/task/Footprint.ts:84`
另有一套更宽的 `PATH_RE`（服务「体量下限」这一第三类消费者，已含 `src`、不含 `packages`、不要求扩展名）。
已把 `design/architecture.md` 与 `design/interfaces.md` 改为「**冲突族**唯一取数口」并加口径澄清；
`Footprint.ts` 那套的 `packages` 缺口登记为待办（不在本需求范围）。
