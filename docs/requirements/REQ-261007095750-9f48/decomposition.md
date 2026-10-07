# 拆分计划（REQ-261007095750-9f48）

> 目标一句话：把**唯一的路径抽取口径**从「四根 + 无 mts」扩到含 `src` 与 `.mts`，
> 让文件冲突门（硬拒）与零交集依赖边建议（软提示）**同时真正生效**，并附**真实数据**的扩根前后读数。
> 做法一句话：改一处正则 + 补两处用例 + 跑一次真实数据复测 + 同步文档边界。
> 本计划**只拆不改设计**：与设计矛盾时的处置是退回设计改计划并重新批准（本计划无此情形）。

## 1. 变更盘点（对照 requirement.md + design/*.md） <!-- serves: FR-1 -->

| 类别 | 内容 |
|---|---|
| **新增** | `tests/path-extraction-scope.test.ts`（抽取口径边界用例，TC-1…TC-5）；`docs/requirements/REQ-261007095750-9f48/tests/real-data-readings.md`（真实数据读数证据） |
| **修改** | `src/application/internal/conflict-check.ts`（只改 `PATH_RE`：根加 `src`、扩展名加 `mts`）；`tests/concurrency-limits.test.ts`（冲突门 `src` 用例）；`tests/plan-depends-e2e.test.ts`（零交集建议 `src` 用例）；`docs/architecture/doc-quality-gates.md`（已知边界表改写）；`docs/architecture/project-manual.md`（机制备忘补口径变更与读数） |
| **删除** | **无**（不删符号、不删路径；既有四根行为只增不减） |

## 2. 批次与依赖 <!-- serves: FR-1 -->

```
t1 口径扩根（接口/实现卡，先行）
 ├─▶ t2 两处判据接线与用例（冲突门 + 零交集建议）
 └─▶ t3 真实数据读数与证据（可与 t2 并行）
        └──▶ t4 文档与边界同步（收口：依赖 t2 与 t3 都完成）
```

| 批次 | 卡 | 依赖 | 为什么这么排 |
|---|---|---|---|
| 1 | t1 | — | 口径是地基：先定义，后接线；禁止前向引用 |
| 2 | t2、t3 | t1 | 两者都消费同一个口径；互不依赖，可并行 |
| 3 | t4 | t2、t3 | 文档要写**实测读数**与最终边界，必须等两者都有结论 |

## 3. 任务表 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 路径抽取口径扩根（唯一取数口改一处） | FR-1 | `src/application/internal/conflict-check.ts`、`tests/path-extraction-scope.test.ts` | — | D-1 | implement | backend | — | S | ① `PATH_RE` 的根含 `src`、扩展名含 `mts`（`grep -n "src\|mts" src/application/internal/conflict-check.ts` 命中该正则行）；② 新建 `tests/path-extraction-scope.test.ts` 覆盖 TC-1…TC-5（`src` 命中 / `.mts` 命中 / 目录名不命中 / 空与无扩展名不命中 / 既有四根与 `agent-dh/` 前缀不回归）→ `npx vitest run tests/path-extraction-scope.test.ts` 全绿；③ 证伪：把正则的根改回四根后重跑该文件 → 必须红（至少 TC-1/TC-2 失败），改回 → 绿；④ `grep -rn "function declaredFiles" src/` → 仍只有一处定义（不放第二套口径） | dev,review |
| t2 | （落库后回填） | 两处判据接线并各自补可证伪用例 | FR-2 | `tests/concurrency-limits.test.ts`、`tests/plan-depends-e2e.test.ts` | — | D-1 | implement | backend | t1 | S | ① 冲突门新增用例：两卡 `implementation` 各写同一个 `src/.../a.ts` 且 `dependsOn` 互不包含 → `findWorkSurfaceConflicts` 返回 1 条，提交被拒 `REQBOARD_FILE_CONFLICT`；把依赖补上 → 不再冲突；② 零交集建议新增用例：两卡分别声明 `src/.../a.ts` / `src/.../b.ts`、无依赖、无理由 → `dependency_warnings` 非空；③ `npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts` 全绿；④ 证伪：注释掉 `src` 根后重跑 → 两条新用例必须红 | dev,review |
| t3 | （落库后回填） | 真实数据读数（扩根前后对照）并留证据 | FR-3 | `docs/requirements/REQ-261007095750-9f48/tests/real-data-readings.md` | — | D-3 | test | backend | t1 | S | ① 样本 = `docs/requirements/*/decomposition.md` 中**含 `src/` 的任务表行**，给出：样本行数、其中 `declaredFiles` 非空的行数（扩根前 ≈101 / 19%，改后 ≥90%）；② 组装 `WorkSurfaceTask[]` 后给出零交集建议条数与冲突门命中数（扩根前 / 扩根后两列）；③ 冲突门**新命中逐条判真伪**并写依据（真冲突 → 注明"门之前是瞎的"；误报 → 记进边界并说明原因）；④ 复跑命令（仓库外 `npx tsx -e` 一行式或 `/tmp` 脚本）与输出摘要一并落进证据文件；⑤ 证据文件里写明"存量不回溯、只对新提交生效" | dev,review |
| t4 | （落库后回填） | 文档边界同步 + 收口读数 | FR-4 | `docs/architecture/doc-quality-gates.md`、`docs/architecture/project-manual.md` | — | D-2 | implement | doc | t2, t3 | S | ① `grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md` 不再命中"未修"表述，改写为「已覆盖（REQ-261007095750-9f48）+ 判据入口」；② `docs/architecture/project-manual.md` 的机制备忘含口径变更（根含 `src`、扩展名含 `mts`）与扩根前后读数；③ 规范条目：`npx tsc --noEmit -p tsconfig.json` 本需求文件 0 错（C-15）、`pnpm build` 退出码 0 且 `dist/` 与 `lib/client.js` 有新产物（C-11）、`npx vitest run --reporter=json` 与 `docs/reviews/test-baseline.failures.txt` 集合差逐条归因（C-14，并发窗口在制改动不算本次引入） | dev,review |

- 一个任务只干一件事，标题动词开头。
- 本需求**实现尚未落盘**（与上一需求不同）：t1/t2 是真改源码与用例，t3 是真实数据取证，t4 是文档收口。

## 4. 覆盖对照（FR → 卡） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 条款 | 承接卡 | 判据锚点（可跑） |
|---|---|---|
| FR-1 口径扩根（唯一取数口改一处） | t1 | `npx vitest run tests/path-extraction-scope.test.ts` 全绿；`grep -rn "function declaredFiles" src/` 只有一处 |
| FR-2 两处判据同时生效 | t2 | `npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts` 全绿；证伪（去掉 `src` 根 → 红） |
| FR-3 误报可控 + 真实读数 | t3 | `tests/real-data-readings.md` 含扩根前/后两列读数与冲突门新命中逐条真伪 |
| FR-4 边界与认知同步 | t4 | `grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md`；说明书节含读数；C-11/C-14/C-15 |

**无悬空条款、无无主卡**：4 条 FR 各有承接卡；4 张卡各覆盖至少 1 条 FR。

## 5. 容量核算（`detailUnits = files + anchors×0.5 + chars/2000`，容量 16 DU） <!-- serves: FR-1 -->

| 卡 | footprint（files / anchors / chars） | detailUnits | 判定 |
|---|---|---|---|
| t1 | 4 / 4 / 1600 | 4 + 2 + 0.8 = **6.8** | ≤16 ✓ |
| t2 | 6 / 3 / 1200 | 6 + 1.5 + 0.6 = **8.1** | ≤16 ✓ |
| t3 | 4 / 5 / 1200 | 4 + 2.5 + 0.6 = **7.1** | ≤16 ✓ |
| t4 | 6 / 4 / 1200 | 6 + 2 + 0.6 = **8.6** | ≤16 ✓ |

四张卡都是 S 级单轮可装（无超容量卡，故不写 `⚠️超容量` 标记）。

## 6. 不做什么（与设计一致，防范围蔓延） <!-- serves: FR-1 -->

- 不改冲突门语义（不加"同目录即冲突"，不加读写区分）；
- 不做存量回溯（不回改历史计划的 `depends_on`）；
- 不新增仓库脚本（真实数据复测用仓库外命令；一行式不可靠时才退化为按需探针 + 登记 `EXCLUDED`，并把退化记进偏差）；
- 不动验收单 / 原型门 / 归档校验；本需求 `sides: []`，无原型、无 UI 卡。
