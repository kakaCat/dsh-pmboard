# 架构设计（REQ-261007095750-9f48）<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 本文是**架构面**设计：判据的地基（路径抽取）在哪一层、唯一实现在哪、改动波及谁、回滚怎么做。
> 每条结论都指到 `文件:行` 或一条可跑命令。
> 本文**不含任务批次**：批次划分与依赖顺序属于拆分阶段产物，不进设计文档。

## 1. 现状与根因：判据的地基只看见半个仓库 <!-- serves: FR-1 -->

`declaredFiles` 是**冲突族判据的唯一**路径抽取器（`src/application/internal/conflict-check.ts:31`），
它被两处判据消费，两处都建立在同一个 `PATH_RE`（`conflict-check.ts:28`）之上：
（**口径澄清**：`src/domain/task/Footprint.ts:84` 另有一套更宽的 `PATH_RE`，服务"体量下限"这个
**第三类消费者**——它已含 `src`、但要求更松（不要求扩展名）且不含 `packages`。两者用途不同：
冲突族要"这条边有没有文件交集"（宁严），容量下限要"至少提到几个文件"（宁松，是下界）。
本次**只改冲突族这一套**；容量下限那套的 `packages` 缺口如实登记为待办，不在本需求范围。）

```
PATH_RE = /(?:agent-dh\/)?(?:packages|scripts|tests|docs)\/(?:[\w@-]+\/)*[\w@.-]+\.(?:tsx|json|mjs|cjs|ts|js|md|css|html|yaml|yml)/g
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 四根                         ^^^ 扩展名表无 mts
```

| 消费方 | 判据 | 强度 | 现状 |
|---|---|---|---|
| `findWorkSurfaceConflicts`（`conflict-check.ts:57`） | 互无依赖的卡声明同一文件 → 拒绝 | 硬（`REQBOARD_FILE_CONFLICT`） | 对 `src/**` 落点**查不出** |
| `zeroOverlapDependencyWarnings`（`plan-deps-check.ts`） | 两端声明文件零交集且无理由 → 建议 | 软（`dependency_warnings`） | 对 `src/**` 落点**看不见**，绝大多数边"看都不看" |

实测（上一需求独立评审复核过）：真实任务表里含 `src/` 的 implementation 行 **530** 条中 **429** 条（81%）
`declaredFiles` 一条都抽不到。**沉默 ≠ 通过**：判据声称在判，实际对 81% 的落点不判。

## 2. 目标结构：单口径扩根 <!-- serves: FR-1, FR-2 -->

**不动结构，只修正则**：`PATH_RE` 的根补 `src`、扩展名表补 `mts`；其余一切（消费方、签名、判据语义）
不变。为什么必须"同一口径改一处"而不是"给零交集判据单独配一套"：

```
        implementation 文本
                 │
                 ▼
      declaredFiles()  ← 冲突族唯一取数口（本次只改这里的 PATH_RE）
         ├──────────────┴───────────────┐
         ▼                              ▼
 零交集依赖边建议（软）            文件冲突门（硬）
 交集=∅ 且无理由 → 建议          互无依赖 + 共享文件 → 拒绝
```

两套口径并存 = 两份真相，迟早分叉（本仓已因此踩过"门禁读 A、下游读 B"的坑）。

## 3. 文件结构与职责 <!-- serves: FR-1, FR-2, FR-3 -->

### 模块改动地图 <!-- serves: FR-1, FR-2, FR-3 -->

| 文件 | 动作 | 职责一句话 |
|---|---|---|
| `src/application/internal/conflict-check.ts` | **改** | `PATH_RE` 补 `src` 根与 `mts` 扩展名；`declaredFiles` / `findWorkSurfaceConflicts` 签名与语义不变 |
| `tests/<抽取口径用例>.test.ts`（实施时落盘，命名 `path-extraction-scope`） | **新建** | 抽取口径的**边界用例**：`src/**` 命中、`.mts` 命中、目录名不命中、无扩展名不命中、去重、既有四根不回归 |
| `tests/concurrency-limits.test.ts` | **改** | 冲突门新增"两卡共享 `src/` 同一文件且互无依赖 → 拒绝"的用例（扩根前该用例必红） |
| `tests/plan-depends-e2e.test.ts` | **改** | 零交集建议新增 `src/` 落点命中用例（扩根前 `dependency_warnings` 为空） |
| `docs/architecture/doc-quality-gates.md` | **改** | 「4. 已知边界」表把 `src/` 盲区从"未修"改写为"已覆盖 + 判据入口" |
| `docs/architecture/project-manual.md` | **改** | 机制备忘补口径变更与扩根前后读数 |

**不新建仓库脚本**：真实数据复测用仓库外命令（见 `design/test-cases.md` §4）——少一处需要登记、
维护与分类的资产；若实施中发现一行式不可靠，再退化为"落仓库的按需探针 + 登记 `operations.ts` 的 `EXCLUDED`"，
并把这次退化记进执行偏差。

## 4. 迁移、兼容与回滚 <!-- serves: FR-1, FR-3 -->

| 维度 | 结论 |
|---|---|
| 数据迁移 / schema | **无**。不新增字段、不改表、无需回填（见 `design/data-model.md`） |
| 行为变更面 | 只有"能被抽出来的路径集合"变大 ⇒ 冲突门更早拦、零交集建议更常出；**判据语义一个字没改** |
| 存量计划 | **不回溯**：历史计划的 `depends_on` 不回改；只对**新提交**的计划生效 |
| 误报处置 | 扩根后冲突门若在真实计划上出现新命中：逐条判"真冲突/误报"，**不许静默放宽口径**（见 §5 不变量 3） |
| 回滚路径 | 把 `PATH_RE` 的根与扩展名还原（一处改动）→ 行为精确回到今天；无数据残留 |
| 兼容 | 既有四根（`packages/`、`scripts/`、`tests/`、`docs/`）与可选 `agent-dh/` 前缀行为**只增不减** |

## 5. 判据接缝与不变量 <!-- serves: FR-1, FR-2 -->

1. **冲突族唯一取数口**：`grep -rn "export function declaredFiles" src/` 只能有一处定义
   （`conflict-check.ts`）；冲突门与零交集建议只调用它、不自建正则
   （`Footprint.ts` 的 `declaredFilesFloorFrom` 属容量下限这一第三类消费者，口径与用途不同，见 §1 澄清）。
2. **语义不变**：冲突门仍然只拦"互无依赖（含传递闭包）+ 共享同一文件"；不引入"同目录即冲突"。
3. **口径不许静默放宽**：判据变红时的处置只有两条——改计划（加依赖 / 拆卡），
   或把新的真实边界写进文档并留痕；**没有第三条"把正则改回去"**（那要重新立项，走 D-x）。
4. **诚实边界（本设计承认的）**：抽取仍基于 `implementation` **文本声明**——声明里没写的文件查不出，
   运行期 mtime 兜底（`cross-card.ts`）仍是第二道防线，人工 review 不可替代。

## 6. 与上一需求的接口（C6 从"已知边界"变"已修"）<!-- serves: FR-4 -->

上一需求（REQ-261006211623-9dc1）把本条登记为**未修的已知边界 C6**
（`docs/architecture/doc-quality-gates.md` 的「4. 已知边界」表 + `docs/reviews/doc-quality-gates-2026-10-06.md` §2.4）。
本次修完后：

- 领域篇的那一行必须改写成「已覆盖（REQ-261007095750-9f48）+ 判据入口」——**文档与实现不许互相说谎**；
- 说明书机制备忘补一句：抽取口径含 `src` 与 `.mts`，并附扩根前后读数；
- 上一需求的归档材料与知识条目（`kb-0066`）**不改**：它们的"失效条件"写的正是"实现被重构"一类的可判定锚点，
  本需求属于"按记录修掉其中一个边界"，不是推翻结论。
