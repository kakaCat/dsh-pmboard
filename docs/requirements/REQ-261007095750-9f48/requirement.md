---
req_id: "REQ-261007095750-9f48"
title: "拆分依赖判据的 src/ 盲区修复（PATH_RE 扩根）"
status: brainstorming
owner: "session-b4188f2e"
category: feature
# sides: 本需求只改源码侧的判据与抽取口径，不产生任何界面/交互产物 → 显式声明无端侧改动。
#   为什么必须显式写：sides 是条件必交设计文档与原型门的唯一触发器，缺声明会被提交门当场拒。
sides: []
---

# 需求说明（REQ-261007095750-9f48）

> 本文档面向：产品、开发、测试——**写给人看，不是写给代码看**。
> **人读三件套**：TL;DR（≤3 行）+ ASCII 业务流程图 + 功能点总览表。

## TL;DR <!-- serves: FR-1 -->

上个需求（REQ-261006211623-9dc1）交付的「零交集依赖边」判据，**在真实数据上 81% 的落点一条都抽不到**：
路径抽取器只认 `packages|scripts|tests|docs` 四根、扩展名表不含 `.mts`，而本仓绝大多数改动在 `src/`。
同一个洞还让**文件冲突门**对 src 也"查不出"。本次把抽取口径统一扩根（两处判据同时生效），并用真实数据核验误报。

## 业务流程图 <!-- serves: FR-1 -->

```
implementation 文本（如「改 src/application/internal/conflict-check.ts 与 tests/x.test.ts」）
        │
        └─▶ declaredFiles()  ← 全仓唯一路径抽取器（PATH_RE）
                 │
                 ├─▶ 零交集依赖边建议：两端交集为空 → 建议给语义理由（软，进 dependency_warnings）
                 │        └─ 抽取口径不含 src  ⇒ 绝大多数边"看都不看"（沉默 ≠ 通过）
                 │
                 └─▶ 文件冲突门：互无依赖却共享同一文件 → 拒绝（硬，REQBOARD_FILE_CONFLICT）
                          └─ 同一个洞：两卡都改 src 同一文件时也查不出
```

## 产品定义 <!-- serves: FR-1 -->

**一个判据要判得着它声称要判的东西。** 本需求不是加新功能，而是把「路径抽取」这个**判据的地基**
修到覆盖本仓真实落点：口径扩到 `src/` 与 `.mts`，让零交集建议与文件冲突门**同时**真正生效，
并用真实数据给出"扩根前 / 扩根后"的可复核读数（而不是只跑单测就说好了）。

**三要素检查清单**：
- [x] 是什么：唯一路径抽取器的口径修复（扩根 + 补扩展名），两处判据共用
- [x] 核心价值：把"沉默"变回"判定"——判据不再对 81% 的落点空转
- [x] 与现状的区别：现状单测全绿但真实数据几乎不触发；本次要求附真实数据读数

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 拆分者 | 写拆分计划、给 `depends_on` | 伪依赖被串成链（可并行的卡白等一轮），判据却因抽不到路径而不吭声 |
| 实施窗口 | 按计划并行开工 | 两卡改同一 `src` 文件却互无依赖 → 互相覆盖，拆分阶段查不出，运行期才发现 |
| 验收人 | 核验"判据是否真的在判" | 单测绿 ≠ 真实数据会红，需要可复核的真实读数 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能点 | 优先级 |
|---|---|---|
| FR-1 | 路径抽取口径统一扩根：`PATH_RE` 覆盖 `src/` 并补 `.mts`，`declaredFiles` 仍是唯一抽取器 | P0 |
| FR-2 | 两处判据同时生效：零交集建议与文件冲突门都按新口径判 | P0 |
| FR-3 | 误报可控：回归用例全绿 + 真实计划数据复测，读数如实登记（含扩根前的对照） | P0 |
| FR-4 | 边界同步：`docs/architecture/doc-quality-gates.md` 的「已知边界」表移除本条，说明书机制备忘同步 | P1 |

### 功能点详细说明

### FR-1：路径抽取口径统一扩根 <!-- serves: FR-1 -->

**功能描述**：唯一抽取器 `declaredFiles`（`src/application/internal/conflict-check.ts`）的 `PATH_RE`
补上 `src` 根与 `.mts` 扩展名，使 `src/**` 落点能被抽出来。

**详细说明**：
- **只改一处口径**：`declaredFiles` 是全仓唯一抽取器（`grep` 可验），扩根只改它的 `PATH_RE`，
  不新增第二个抽取函数——两套口径并存必然分叉（本仓反复踩过）。
- **保守边界**：仍然只认"看起来像工作区文件"的 token（带已知扩展名），不把任意 `src/xxx` 当文件；
  文字里的目录名（如 `src/application/internal/`）不算路径。
- 兼容：`agent-dh/` 可选前缀保留；已有四根行为不变（只增不减）。

**验收标准**：
1. `npx vitest run tests/concurrency-limits.test.ts` → 全绿（既有断言不回归）。
2. 直接调 `declaredFiles`：`declaredFiles('改 src/application/internal/conflict-check.ts 与 scripts/x.mts')`
   返回 ≥2 条且含 `src/application/internal/conflict-check.ts`（扩根前返回 0 条 src 路径）。

### FR-2：两处判据同时生效 <!-- serves: FR-2 -->

**功能描述**：零交集依赖边建议（软）与文件冲突门（硬，`REQBOARD_FILE_CONFLICT`）都按新口径判；
两处不各写一套。

**详细说明**：
- 两处共用 `declaredFiles`（`findWorkSurfaceConflicts` 与 `zeroOverlapDependencyWarnings` 都调它）。
- 冲突门的语义不变：**互无依赖**（含传递闭包）且共享同一文件 → 拒绝；只是现在能看见 `src`。
- 若扩根后冲突门开始拦既有计划：**不许静默放宽**，要么改计划（加依赖/拆卡），要么把口径写进文档并留痕。

**验收标准**：
1. `npx vitest run tests/plan-depends-e2e.test.ts tests/concurrency-limits.test.ts` → 全绿。
2. 新用例：两卡 `implementation` 各写 `src/a.ts` / `src/a.ts` 且互无依赖 → `findWorkSurfaceConflicts`
   返回 1 条冲突（扩根前返回 0 条）；同一逻辑用在零交集建议上同样命中。

### FR-3：误报可控 + 真实读数 <!-- serves: FR-3 -->

**功能描述**：用**真实 decomposition 数据**复测扩根前后：可抽取行数、零交集边命中数、冲突门命中数，
把读数写进证据（不是只跑单测）。

**详细说明**：
- 样本：`docs/requirements/*/decomposition.md` 的任务表行（取含 `src/` 的行）。
- 要给出的对照：扩根前 / 扩根后的「含 src 行中被抽出的比例」与「零交集边条数」。
- 误报激增时的处置：先看是不是真的共享文件（真冲突就该拦）；确属误报则在设计里写清口径与例外。

**验收标准**：
1. 复测脚本（或命令）给出扩根前后的两个数字，并在证据里对照（如：可抽取比例由 ≈19% 提升到 ≥90%）。
2. `npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts` 全绿；
   若冲突门在真实计划上出现新命中，逐条给出「真冲突 / 误报」判定与依据。

### FR-4：边界与认知同步 <!-- serves: FR-4 -->

**功能描述**：修完后，`docs/architecture/doc-quality-gates.md` 的「4. 已知边界」表不再列本条的 `src/` 盲区；
`docs/architecture/project-manual.md` 的机制备忘补一句口径变更（含扩根前后读数）。

**详细说明**：
- 上一需求把它作为「未修的已知边界」登在领域篇；修完必须把该行改写成「已覆盖 + 判据入口」，
  否则文档与实现互相说谎（本仓明确纪律）。
- 知识层条目（如 kb-0066 一类的沉淀）在归档时自动生成，无需手改；但领域篇必须人工对齐。

**验收标准**：
1. `grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md` → 不再命中"未修"的表述；
   或改写为「已修复（REQ-261007095750-9f48）+ 判据入口」。
2. 说明书机制备忘里能看到扩根前后的对照读数。

## 失败与并发路径 <!-- serves: FR-1, FR-3 -->

**填写要求**：每条写"发生什么 → 看到什么"。

- **失败路径**：
  - 扩根后 `PATH_RE` 误吃文字里的目录名（如 `src/application/internal/`）→ **不产生路径**（正则要求带已知扩展名的文件名），
    由 FR-1 的验收标准 2 直接断言。
  - 抽取器读不到 `implementation`（字段缺失/为空）→ 两处判据都"没依据不判"（既有口径，不放宽也不误报）。
- **并发与重复**：
  - 冲突门变红后，同一计划重复提交 → 仍拒（拒绝是幂等的，台账零改动）；处置只能是改计划或拆分卡。
  - 同工作树并发窗口正在改 `conflict-check.ts` 或 `src/client/**` → 改动前先确认文件 mtime 与编译通过，
    避免把别人的在制改动卷进本次 diff。
- **状态机**：不涉及状态迁移（只改抽取口径与两处判据的取数），无可变状态。
- **写路径**：本需求只改源码与文档；临时复测脚本放 `/tmp`，不落仓库；若需要落仓库的复测脚本，
  必须登记进 `operations.ts` 的 `EXCLUDED`（按需探针，不做提交前清单）。

## 边界（不做什么） <!-- serves: FR-1 -->

- **不改冲突门的语义**：仍然只拦"互无依赖 + 共享同一文件"，不引入"同目录即冲突"这类更宽的口径。
- **不新增第二套抽取口径**（B 方案被否）：两套口径必然分叉，这正是上个需求治的病。
- **不做存量回溯**：不回头改历史计划的 `depends_on`；只在**新提交**的计划上生效（存量读数如实报告）。
- **不动验收单 / 原型门 / 归档校验**：本需求与它们无关。
- **不因为"单测全绿"就结单**：必须附真实数据读数（FR-3）——这是上个需求评审给的最大教训。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 用户在本窗口的立项弹框作答（2026-10-06，原话：「A：单口径扩根（两处判据同时生效）」） | 抽取口径**只扩一处**：`PATH_RE` 加 `src` 与 `.mts`，零交集建议与文件冲突门共用；不做两套口径 | FR-1、FR-2 | `declaredFiles` 仍是唯一抽取器（`grep -rn "declaredFiles" src/` 只有一处定义）；`tests/concurrency-limits.test.ts` 全绿 |
| D-2 | 用户在本窗口的立项弹框作答（2026-10-06，原话：「拆分依赖判据的 src/ 盲区修复（PATH_RE 扩根）」） | 该工作单独立项（不塞回已归档的 REQ-261006211623-9dc1），类型 feature / 难度 expert | FR-1、FR-3 | 台账：REQ-261007095750-9f48 处于 brainstorming；已归档需求保持不动 |
| D-3 | 独立评审报告（2026-10-06，原话：「FR-7 零交集判据**在真实数据上大面积空转**…含 `src/` 的 530 行中 429 行（81%）一条都抽不到」） | 把它从"已知边界"升格为**待修缺陷**，并要求修复后附扩根前后的真实读数 | FR-2、FR-3 | 证据文件里给出扩根前后对照（可抽取比例 / 零交集命中数） |

## 验收标准（整体） <!-- serves: FR-1 -->

- [ ] `npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts` → 全绿
- [ ] 新用例可证伪：两卡共享 `src/a.ts` 且互无依赖 → 冲突门命中（扩根前 0 条）
- [ ] 真实数据对照读数：含 `src/` 的任务表行被抽出的比例、零交集边命中数（扩根前 / 扩根后）
- [ ] `npx tsc --noEmit -p tsconfig.json` → 本需求改动文件 0 错
- [ ] `docs/architecture/doc-quality-gates.md` 的「已知边界」表不再把 `src/` 盲区列为"未修"

## 依赖与约束 <!-- serves: FR-1 -->

- **同工作树有并发窗口**：`src/client/**`、`tests/helpers/**` 等正在被别的窗口改动；
  本次改动集中在 `src/application/internal/conflict-check.ts` 及其测试，冲突面小但要逐次确认。
- 上一需求的复核材料（含本条作为 C6 的原始记录）：
  `docs/reviews/doc-quality-gates-2026-10-06.md` §2.4；独立评审：`docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md`。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-703099 |
| FR-2 | ✅ 已接收 | t-beb829 |
| FR-3 | ✅ 已接收 | t-743278 |
| FR-4 | ✅ 已接收 | t-3948f1 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
