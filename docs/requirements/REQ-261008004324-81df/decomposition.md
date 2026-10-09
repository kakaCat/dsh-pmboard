# 拆分计划（REQ-261008004324-81df）

> 目标：把「既有红」里属于测试夹具/断言滞后（A）与环境基线漂移（C）的部分修到绿，
> 每条改动带一句定性依据；真缺陷按 BUG-10 移出本需求、另案点名。
> 做法：按**成因族**拆 13 张卡——11 张只改测试侧/环境/生成物，1 张落定性台账，1 张收口验收。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| BUG-x | `requirement.md` 缺陷条款 | 本需求的条款（无 FR，bug 档用 BUG） |
| D-x | `requirement.md`「讨论与裁定记录（D-x）」 | 需求阶段裁定（范围 / 分类） |
| t-x | 本文档任务表 | 计划内任务键 |

设计文档只有一份：`design/fix-design.md`（无 interfaces.md / frontend.md，故不设接口/组件对照表）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（文件） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 补齐门禁与文档质量类测试夹具 | BUG-1 | `tests/artifact-openable.test.ts`、`tests/move-rollback.test.ts`、`tests/design-registration.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/artifact-openable.test.ts tests/move-rollback.test.ts tests/design-registration.test.ts` → 7/7 · 19/19 · 9/9 全绿（改前红读数 1 / 1 / 3） |
| t2 | （落库后回填） | 把人工门放行断言改走人路径 | BUG-2 | `tests/triad-gate.test.ts`、`tests/e2e-triad-gate.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/triad-gate.test.ts tests/e2e-triad-gate.test.ts` → 3 条「放行」类用例转绿；3 条「缺三要素」类**仍红**且逐条对应设计另案清单（不改断言） |
| t3 | （落库后回填） | 跟进文案、徽章与地址段断言 | BUG-3 | `tests/capture.test.ts`、`tests/client-view.test.ts`、`tests/node-panel-styles.test.ts`、`tests/template-address-injection.test.ts` | D-1 | implement | frontend | — | S | `npx vitest run` 上述 4 文件 + `tests/header-progress-responsive.test.ts` → 失败数 1/3/1/4 → **0/0/0/2**（TC-9/TC-11 按另案保留），header-progress-responsive 保持 22/22 绿 |
| t4 | （落库后回填） | 跟进回执字段与状态推进读数 | BUG-4 | `tests/auto-chain-approval.test.ts`、`tests/confirm-settle-plan-persist.test.ts`、`tests/plan-mode.test.ts`、`tests/t17-queue-e2e.test.ts` | D-1 | implement | backend | — | S | `npx vitest run` 上述 4 文件 → 失败数 1/1/1/1 → 0/0/0/0；每条改动旁注明「有意改名 / 有意前移」的定性句 |
| t5 | （落库后回填） | 跟进拆分落库路径与卡回执断言 | BUG-4 | `tests/decompose-tools.test.ts`、`tests/t11-decompose-queue-write.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/decompose-tools.test.ts tests/t11-decompose-queue-write.test.ts` → 失败数 5/1 → 0/0；decompose-tools 五条逐条对应设计里的 ①~⑤ 改法 |
| t6 | （落库后回填） | 补齐会话驱动组装的必填依赖夹具 | BUG-5 | `tests/dive-gate-prompt.test.ts`、`tests/dive-session-driver-wiring.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/dive-gate-prompt.test.ts tests/dive-session-driver-wiring.test.ts` → 失败数 2/3 → 0/0（改后无 `idle drive failed` 的 TypeError 静默信息） |
| t7 | （落库后回填） | 跟进投递面与告警写入断言 | BUG-5 | `tests/handoff.test.ts`、`tests/adapters/failure-alert.test.ts`、`tests/canceled-legacy-read.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/handoff.test.ts tests/adapters/failure-alert.test.ts tests/canceled-legacy-read.test.ts` → 2/2/1 → 0/0/0；canceled-legacy-read **连跑 3 次全绿**（消 await 抖动） |
| t8 | （落库后回填） | 跟进夹具细节与 ID 形态断言 | BUG-6 | `tests/create-doc-location.test.ts`、`tests/application/repository.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/create-doc-location.test.ts tests/application/repository.test.ts` → 2/1 → 0/0；`t-`/`e-`/`c-` 三条 6 位断言保持不动 |
| t9 | （落库后回填） | 修好缺宿主包与探针锚点两处环境问题 | BUG-7 | `tests/isolate-node-context.test.ts`、`tests/zero-arg-binding.test.ts` | D-1 | implement | backend | — | S | `npx vitest run tests/isolate-node-context.test.ts tests/zero-arg-binding.test.ts` → 绿；isolate-node-context 显示 **13 passed + 16 skipped** 且文件头写明跳过依据与显式跑法；zero-arg-binding 4 条按「守护对象已消失」退休并写依据（备选 B 需人批准，不在本卡默认做法内） |
| t10 | （落库后回填） | 重生成知识层并更新两条基线断言 | BUG-8 | `docs/knowledge/code-map.md`、`docs/knowledge/code-map.symbols.tsv`、`docs/knowledge/design-tokens.md`、`docs/knowledge/design-tokens.classes.tsv`、`tests/kb-generate.test.ts`、`tests/kb-invalidation.test.ts`、`tests/kb-operations.test.ts` | D-1 | implement | backend | — | M | `npx tsx scripts/kb-build.mts --write && pnpm kb:check` → 退出码 0（改前 4 处漂移）；`npx vitest run` 上述 3 个 kb 用例文件 → 全绿；`git diff` 只含生成物与基线文件 |
| t11 | （落库后回填） | 清理打包树里的 Python 字节码产物 | BUG-9 | `skills/ui-ux-pro-max/scripts/__pycache__/`、`skills/ui-ux-pro-max/.npmignore` | D-1 | implement | backend | — | S | `npx vitest run tests/skills-assets.test.ts` → 绿 **且** `pnpm pack --dry-run 2>&1 \| grep -c pycache` = 0 |
| t12 | （落库后回填） | 落定逐文件定性台账与另案点名清单 | BUG-10 | `docs/requirements/REQ-261008004324-81df/qualitative-ledger.md` | D-1, D-2 | doc | doc | — | S | 台账文件存在且每个目标文件一行（五列：文件 / 桶 / 首条读数 / 定性 / 依据），`grep -c '^| tests/' qualitative-ledger.md` ≥ 37；另案清单 7 行逐条带生产侧依据；空列即不算过 |
| t13 | （落库后回填） | 收口验收：全量读数与基线集合差 | BUG-10, BUG-11 | `docs/reviews/test-baseline.md`、`docs/reviews/test-baseline.failures.txt` | D-1, D-2 | test | backend | t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12 | M | `pnpm test` → 本需求 28 文件不再出现；剩余红逐条有归属（另案 7 文件 / 11 用例 + B 类 5 文件 / 10 用例）；`pnpm kb:check` → exit 0；`pnpm typecheck` → exit 0；`npx tsx scripts/test-baseline.mts --refresh` 后 `--check` → 差集为空、exit 0，且刷新历史表新增一行、理由非空并逐条解释 11 条「新增失败」与 11 条「不再失败」 |

- 一个任务只干一件事，标题动词开头。
- **落点**列全部是具体路径——不许写「相关模块」。
- 工作量口径：S = 半天内 / M = 1~2 天 / L = 3 天以上（本计划无 L）。
- **子卡段**：不显式声明，按相位与需求分类兜底——implement 卡吃 bug 档默认
  `复现 → 修复 → 复核 → 回归`（**无联调段**，故无需 `skipIntegration`）；t12（doc）→ `研发 → 复核`；
  t13（test）→ `研发 → 复核 → 测试`。
- **依赖理由**（t13 的 12 条上游）：t13 的落点是基线与读数文件，与各修复卡的 `tests/**` 文件**零交集**，
  但语义上必须等它们全部落地后才能采集，故逐条在 `dep_reasons` 写明，避免被判「疑似伪依赖」。
- **t10 是文件面最宽的卡（7 个落点）**：动作实为「一步重生成 + 三处小断言改」，工作量记 M；
  若实施时发现一轮装不下，就地拆成「重生成知识层」与「kb 断言跟进」两张（后者依赖前者），
  不改条款覆盖关系（两张都接 BUG-8）。此声明与 `footprint.files = 7` 一致，软门禁的点名是知情的。

## 覆盖对照

| 需求条款 | 设计章节（fix-design.md） | 接收任务 | 完整性 |
|---|---|---|---|
| BUG-1 | 门禁与文档质量新语义（3 文件 / 5 用例） | t1 | ✅ |
| BUG-2 | 人工门与出口三要素（2 文件 / 3 用例在本需求内） | t2 | ✅ |
| BUG-3 | 文案与注入段（4 文件 / 7 用例在本需求内） | t3 | ✅ |
| BUG-4 | 回执字段与状态推进读数（6 文件 / 10 用例在本需求内） | t4, t5 | ✅ |
| BUG-5 | 消息投递与台账写入（5 文件 / 10 用例在本需求内） | t6, t7 | ✅ |
| BUG-6 | 夹具细节与 ID 形态（2 文件 / 3 用例） | t8 | ✅ |
| BUG-7 | 环境依赖与探针锚点（2 文件 / 4 用例 + 1 文件级） | t9 | ✅ |
| BUG-8 | 知识层生成物与基线（3 文件 / 3 用例 + 1 条仓库门） | t10 | ✅ |
| BUG-9 | 打包资产环境产物（1 文件 / 1 用例） | t11 | ✅ |
| BUG-10 | 另案点名清单 + 定性协议 | t12 | ✅ |
| BUG-11 | 收口验收口径（可执行） | t13 | ✅ |
| **合计** | 11 条条款 / 11 节 | **13 张卡** | 11/11 条款有主 |

## 移出另案（**不落卡**，只是点名清单）

以下 7 文件 / 11 用例经定性属**真缺陷或需改生产代码**，按 D-1「不动生产语义」与 BUG-10 移出本需求：

| 文件 | 移出用例 | 生产侧根因（要改哪里） |
|---|---|---|
| `tests/triad-gate.test.ts` | 「拆分出口：卡缺三要素→拒」「单卡结单：卡缺三要素→拒」 | `content-gate-triad.ts` 零生产调用点，须接进 `MoveTask` done 预检与人路径出口 |
| `tests/e2e-triad-gate.test.ts` | 「卡被改坏→拦下」 | 同上 |
| `tests/doc-sync.test.ts` | 唯一用例 | `MoveRequirement` 无 `doc_sync_warning` 出口面 + `brainstorming→design` 人工门 ⇒ 断言语义搬迁需裁定 |
| `tests/template-address-injection.test.ts` | TC-9（:75）、TC-11（:169） | `CaptureGuidanceDeps.address` 是死参数：或把 address 折进 capture guidance 段，或正式退役该注入点 |
| `tests/t7-legacy-tolerance.test.ts` | 唯一用例 | `round-state.ts:306-315` 旧相位分支 vs 现行枚举，须改生产判定 |
| `tests/failure-handling.test.ts` | 唯一用例 | `ExecuteTask.ts:653-656` 内联回退吃掉 `revisions(rollback)` 与失败评论，须改调 `rollbackSubtask` |
| `tests/interruption-checkpoint.test.ts` | 3 条 | `MoveRequirement.ts:237` 前向交棒丢失 `stampCheckpoint`，须补写入器调用 |

另并入两条次要技术债：`session-driver.ts:491` 注释写 warn 实为 `info`；`gate-prompt.ts:220-223`
通道不可用分支零投递且零日志。

## 边界（本计划不做什么）

- **不动生产语义**：13 张卡全部落在 `tests/**`、`docs/knowledge/**`、`docs/reviews/test-baseline.*`、
  需求目录文档与删环境产物；唯一例外是 t9 的备选 B（恢复补丁登记）——**默认不做**，需另行批准。
- **不碰 B 类 5 文件**（层边界 / 消息卫生 / 尺寸门禁 / 写盘点 / 活卡单源）。
- **不为绿而绿**：另案 11 用例禁止在任何卡里改断言转绿；t2 的验收标准已把它们钉成「仍红」。
- **不顺手重构**：即便多处夹具同型（如 design 五份 + serves）也各改各的，不抽公共夹具。
- **不追改历史基线数字**（`docs/requirements/**` 快照）。
- **t10 前置**：跑 `kb:build --write` 前先确认无他窗正在改 `src/` 结构，否则会把半成品一起吸收。

## 覆盖完整性规则

1. 每张卡的落点、验收标准、工作量三列都不许空（本表已齐）。
2. 反向核对：设计文档 11 节全部有卡接（上表逐行 ✅），无超范围设计。
3. 每个 BUG-x 都有接收任务；另案条目**刻意不落卡**（落卡就等于把生产改动塞进本需求）。
