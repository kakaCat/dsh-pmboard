# 存量归档只读核对报告（REQ-261006201841-944d FR-8）

> 只读：**不追溯、不改写**任何历史台账或归档目录。判据与归档新闸同源（锚点由 `listHeadingAnchors` 单点给出，不手写 slug 规则）。

- 台账根：`/Users/mac/.dsh/reqboard`
- 当前工作区（对照用）：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 归档目录 37 条，其中已交归档材料 23 条

## 汇总读数

| 读数 | 值 | 口径 |
|---|---|---|
| 合并去向真失效 | 2 | 按**每条需求自己的根**解析；其中 2 条落在「归属未知」记录上（**兜底读数**） |
| 说明书锚点漂移（严格口径） | 22 | 任意级标题归一化**精确**匹配失败 |
| 说明书锚点漂移（像章节引用口径） | 14 | `section` 形如 `一、`/`第 N`/数字序号/`全文·全篇` 且锚不到 |
| `manual_updates[].path` 不存在 | 1 | 路径本身在盘上找不到 |
| 归属未知（无 `workspaceRoot`） | 3 | 记录里既无 `projectId` 也无 `workspaceRoot` |
| **对照**：按当前工作区直接比会判失效 | 15 | 同一批材料在**错误根**上的读数——证明必须按各自根解析 |

## 逐条清单（只列有失效的）

| 需求 | 生效根 | 合并去向缺失 | 锚点漂移 | path 缺失 |
|---|---|---|---|---|
| REQ-260929184406-2084 | `/Users/mac/Documents/ai/dsh/dsh-pmboard`（**兜底根**） | `docs/architecture/pm-toolview-visualization.md` | — | `docs/architecture/pm-toolview-visualization.md` |
| REQ-260929195829-6e02 | `/Users/mac/Documents/ai/dsh/dsh-pmboard`（**兜底根**） | `docs/architecture/实施链调度.md` | `docs/architecture/project-manual.md` :: 实施链调度 | — |
| REQ-260929210741-30ae | `/Users/mac/Documents/ai/dsh/dsh-pmboard`（**兜底根**） | — | `docs/architecture/project-manual.md` :: reqboard 流程断点修复 | — |
| REQ-260930155231-0862 | `/Users/mac/Documents/ai/dsh/dsh-notice-webhook` | — | `docs/architecture/notification-plugin.md` :: 二、四个关键决策<br>`docs/architecture/notification-plugin.md` :: 四、踩过的坑<br>`docs/guides/integration.md` :: 一、Host 半：服务 dshNoticeWebhook | — |
| REQ-260930183951-eb6c | `/Users/mac/Documents/ai/dsh/dsh-pmboard` | — | `docs/architecture/project-manual.md` :: 变更记录 / 领域篇索引<br>`docs/architecture/acceptance-sheet.md` :: 三条硬不变量<br>`docs/architecture/plugin-runtime-prerequisites.md` :: 一、加载链<br>`docs/architecture/plugin-runtime-prerequisites.md` :: 二、构建产物 ≠ 已加载模块 | — |
| REQ-260930193929-897b | `/Users/mac/Documents/ai/dsh/dsh-pmboard` | — | `docs/architecture/project-manual.md` :: 本手册怎么用（索引表新增一行）<br>`docs/architecture/gate-read-root.md` :: 全文（新增领域篇） | — |
| REQ-260930230225-71be | `/Users/mac/Documents/ai/dsh/dsh-pmboard` | — | `docs/architecture/project-manual.md` :: 「想知道什么 → 去哪」索引表<br>`docs/architecture/conversation-header-progress.md` :: 全篇（新建 L2 领域篇） | — |
| REQ-261001154450-b918 | `/Users/mac/Documents/ai/dsh/dsh-pmboard` | — | `docs/architecture/project-manual.md` :: 机制备忘：收尾门的三条硬约束 | — |
| REQ-261001202058-0fbe | `/Users/mac/Documents/ai/dsh/dsh-notice-webhook` | — | `docs/architecture/project-manual.md` :: 三、后台 job 感知（本包最容易误解的一处）<br>`docs/architecture/notification-plugin.md` :: 二、七个关键决策 → 7. 完成通知要问一句「后台还有活吗」<br>`docs/guides/operations.md` :: 二、通知没到：按这个顺序查（含 drop 原因码表） | — |
| REQ-261001203114-19b6 | `/Users/mac/Documents/ai/dsh/dsh-notice-webhook` | — | `docs/architecture/notification-plugin.md` :: 二、八个关键决策 · 8. turn/end 的结论由终态决定（REQ-261001203114-19b6）<br>`docs/guides/operations.md` :: 二、通知没到的排查步骤 · drop 原因码表 | — |
| REQ-261001213924-1441 | `/Users/mac/Documents/ai/dsh/dsh-pmboard` | — | `docs/architecture/project-manual.md` :: 机制备忘：唤醒链的两处装配接缝，与「误停摆 vs 有意停手」的判别（2026-10-02 改写为两套状态版） | — |
| REQ-261002150038-344a | `/Users/mac/Documents/ai/dsh/dsh-notice-webhook` | — | `docs/guides/operations.md` :: 二、排查顺序（drop 原因码之后） | — |
| REQ-261003150739-b98d | `/Users/mac/Documents/ai/pi-investment/quantsys-v2` | — | `CLAUDE.md` :: 3. Run Tests（测试期不得真实外发通知） | — |

## 处置

- 存量**不追溯**：本次只报告读数，不改写历史台账与归档目录（D-3）。
- 新提交已被新闸拦住同类问题（`merged_into` 存在且非空、锚点必须可达）。

---

## 反向演练组（t12 · `npx tsx scripts/reverse-drill-matrix.mts --group archive`）

> 演练纪律与既有三组同源：文件级备份 + sha256 还原判据 + 并发写入检测；**禁** `git checkout -- <path>` 式还原。
> 本组**不进** `--group all`（RV-3 会拷真台账、RV-2 会 spawn 一次 vitest）。

| 演练 | 改坏点 | 判据 | 实测（本窗独立复跑，退出码 0） |
|---|---|---|---|
| RV-1 | 桩工作区提交材料 `submit-materials.json` 的 `merged_into` → `docs/architecture/__no_such_doc__.md` | 归档提交**必被拒**且点名「路径 + 生效根 + 判据来源」 | 被拒，消息含该路径、生效根（mktemp 桩工作区）、`by=path-fallback`、`REQBOARD_FILE_MISSING`；材料 sha256 `b8ad553d…` 逐字节还原一致；**还原后同一次提交通过**（`success=true`） |
| RV-2 | `scripts/kb-probe.mts` 的 K13 分支整段块注释（`add('K13', …)` 不再执行） | 指定用例**必须变红**（是断言失败，不是「没有覆盖」） | 退出码 1、红例 1，点名用例「① 冷侧有归档材料但无 req: 条目 → K13 红并点名该 id」；`kb-probe.mts` sha256 `00187c55…` 逐字节还原；**还原后复跑退出码 0、红例 0** |
| RV-3 | 不改任何文件：真台账拷成副本，在副本上跑只读核对 | 七项读数逐条对得上 + 副本树与真台账树 sha256 未变 | 读数 `realMissingTargets=2 / missingTargetsOnFallbackRoot=2 / sectionDriftStrict=22 / sectionDriftLooksLikeSection=14 / missingManualPath=1 / unknownRoot=3 / naiveMissing=15` 全 ✅；两棵树 sha256 前后一致；副本之外**零新增文件** |

既有三组回归（同一次收尾）：`--group all` → 28/28 `allOk`（`archive_refs=[]`），
`tests/canceled-reverse-drill-coverage.test.ts` 7/7——本组新增**未改动既有三组行为**。

## 改动前后失败用例集合差（整体验收标准 4）

| 快照 | 来源 | 用例数 | 失败数 | 失败文件数 |
|---|---|---|---|---|
| 改动前 | `/tmp/req944d-pre.txt`（前一窗口 20:26 自采，工作树 `d0f01d6` + 各窗口在飞改动） | 6245 | 122 | 57 |
| 改动后 | 本窗自采（`--reporter=json`，HEAD `d0f01d6`，全树 149 文件改动） | 6613 | 71 | 38 |

**新增失败文件 1 个（逐条归因）**：

- `tests/error-code-inventory.test.ts`（2 条）——**非本次引入**：红的两条是别窗口新增的传输码
  `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED` / `REQBOARD_PROTOTYPE_PLACEHOLDER`
  （定义在 `src/application/use-cases/MoveRequirement.ts`，由别需求的
  `src/application/internal/prototype-anchor-gate.ts` / `prototype-placeholder.ts` 使用）**没登记进错误码清单**。
  **本需求零新增错误码**（设计明文），且这两个码所在文件不在本需求改动面内。
  修法属该窗口范围：`npx tsx tests/drill/refresh-error-code-inventory.mts`。

**本需求相关 16 个测试文件在全量跑中 0 失败**（16 = 9 个新用例文件 + 7 个契约升级文件；另有第 8 个
同类文件 `tests/application/use-cases.test.ts` 由本次一并升级，见 `notes/follow-up-findings.md` F-7）。

> 口径说明（F-3）：多窗口共用同一工作树，"绝对失败数"随时在动且不可界定。
> 故本项判据按**本窗两次自采的失败用例集合差 + 逐文件归因**判，**不刷测试基线**
> （`docs/reviews/test-baseline.*` 一字未改）。上表"改动前"快照取自前一窗口，其局限如实写在此处：
> 它早于 t11/t12 落地，因此其中含本需求旧形态夹具的红（122 里约 63 条），不能当作"本需求引入的回归"。

## `pnpm kb:check` 读数（整体验收标准 4）

| 时点 | 检查数 | 红项 |
|---|---|---|
| 改动前（`/tmp/req944d-kb-pre.json`） | 12 | `K1`、`K3`、`K7`、`K9`、`K10` |
| 本次收尾 | 14 | `K1`（INDEX 8543 超 8000，存量且被别窗口加重）、`K7`（生成物漂移，存量）、`K14`（别窗口 21:30 新沉淀 `kb-0064` 不可判定） |

- **本需求引入的新红 = 0**：`K13`/`K14` 是本需求新增的两项读数，`K13` 绿且判词如实；
  `K1`/`K7` 是存量；`K3`/`K9`/`K10` 已由别窗口修绿。
- **`K14` 的新红是检查按设计工作**：别窗口新沉淀的 `kb-0064`（`req: REQ-261006201649-cc89`）
  失效条件仍是模板句 ⇒ 被点名。本次**不跑** `--refresh-unverifiable` 隐藏它
  （刷基线 = 把新缺口写成「已知豁免」，正是本需求要治的假绿形态）；
  两条出路见 `notes/follow-up-findings.md` F-10。
- `npx tsx scripts/req-doc-validate.mts --req REQ-261006201841-944d` → **9 项判据、缺口 0、exit 0**
  （第二级「设计 ← 任务」读数不可得，脚本明示不当缺口）。
