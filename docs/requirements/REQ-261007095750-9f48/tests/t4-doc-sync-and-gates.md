# T4 文档边界同步与收口读数（REQ-261007095750-9f48 FR-4）

covers: t-3948f1, t-d27102, t-956481

> 任务卡 `t-3948f1` 的交付物：把已修的边界写回领域篇与说明书，并跑三条规范条目（C-11 / C-14 / C-15）。

## 1. 文档同步（改了什么）

| 文件 | 改动 |
|---|---|
| `docs/architecture/doc-quality-gates.md` | 「4. 已知边界」表：`src/` 盲区一行由**未修**改写为**已覆盖（REQ-261007095750-9f48）+ 判据入口**（含复跑命令与真实读数）；并新增一行「冲突门是**文件级**判据」把扩根后凸显的代价与待决问题登记下来 |
| `docs/architecture/project-manual.md` | 新增机制备忘《路径抽取口径扩根（src 与 .mts）》：口径变更表、真实读数表（55.7% → 99.6% / 178 → 326 / 8 → 57）、代价与待决问题、可复核入口 |

验证：

```
$ grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md
79:| FR-7 的 `src/` 盲区 | **已覆盖（REQ-261007095750-9f48，2026-10-06）**：`PATH_RE` 的根补 `src`、扩展名补 `mts`…   ← 无"未修"表述
$ grep -c "path-extraction-scope" docs/architecture/project-manual.md
1
```

## 2. C-11 发版前必须构建

```
$ pnpm build
exit=0
wrapped dsh-pmboard -> lib/client.js 656416 bytes
[verify-client] OK  bundle=748664 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
$ ls -l dist/index.mjs lib/client.js
Oct  7 10:09 dist/index.mjs
Oct  7 10:09 lib/client.js
```

## 3. C-14 提交前必须跑测试并与基线比对

```
$ npx vitest run --reporter=json  +  docs/reviews/test-baseline.failures.txt 做集合差
失败 70 · 基线 68 · 新增 11
新增按文件：client-view 3 · error-code-inventory 3 · live-tasks-single-source 2 ·
artifact-openable 1 · kb-invalidation 1 · typecheck 1
落在本需求改动相关测试上的新增失败：0 条
```

**归因**：11 条新增全部落在**同工作树并发窗口在制面**（客户端视图、错误码清单、live-tasks 谓词、
docs 根解析、知识层失效判定、类型检查门），与本需求改动无交集。

**本需求修过的两条（如实报出，不隐藏）**：第一次全量跑时 `tests/doc-gate-e2e.test.ts` 有 **2 条新失败**，
根因正是本需求——该文件的 fixture 让两张卡都写 `改 src/x.ts`（同文件、无依赖），口径扩根后
**冲突门先于条款门拦下**，用例测不到它本来要测的条款覆盖。处置：改 fixture 让每张卡改不同文件
（保留其"测条款门"的意图），**不放宽口径**；修后该文件 8 passed，全量新增回到 11 条（本需求 0 条）。

## 4. C-15 改了源码必须跑类型检查

```
$ npx tsc --noEmit -p tsconfig.json
tests/query-docs-roots.test.ts(36,7): error TS2415 …（并发窗口在制文件）
tsc 总数=1 · 本需求改动文件=0
```

## 5. 本需求改动的完整清单（供验收核对）

| 文件 | 动作 |
|---|---|
| `src/application/internal/conflict-check.ts` | 改：`PATH_RE` 根补 `src`、扩展名补 `mts`（唯一取数口，一处改动） |
| `tests/path-extraction-scope.test.ts` | 新增：口径边界 7 例（含证伪锚） |
| `tests/concurrency-limits.test.ts` | 改：冲突门 `src` 用例 + 端到端拒 `REQBOARD_FILE_CONFLICT` |
| `tests/plan-depends-e2e.test.ts` | 改：零交集建议 `src` 用例 |
| `tests/doc-gate-e2e.test.ts` | 改：fixture 每卡改不同文件（因扩根后共用 `src/x.ts` 会先触发冲突门） |
| `docs/architecture/doc-quality-gates.md` | 改：边界表两条（已覆盖 + 文件级代价） |
| `docs/architecture/project-manual.md` | 改：新增机制备忘（口径变更 + 真实读数 + 代价） |
| `docs/requirements/REQ-261007095750-9f48/**` | 需求/设计/计划/证据文档 |
