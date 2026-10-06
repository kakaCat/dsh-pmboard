# 横向审计报告 · dsh-pmboard（2026-10-06）

> 发起：另一窗口（自足任务，无会话历史依赖）｜执行：单窗口审计 + 只读取证
> 纪律：**只审计与写报告，未改动任何代码/测试/文档**（唯一写盘物 = 本文件 + 新建 `docs/reviews/`）。
> 所有结论均附本次实跑命令与真实输出；无法核实的条目在 §5 显式列出，不猜。

## 0. 审计范围与取证环境

| 项 | 值 |
|---|---|
| 仓库 | `/Users/mac/Documents/ai/dsh/dsh-pmboard` |
| 日期 | 2026-10-06 |
| HEAD | `5dff7e2 2026-10-05 11:43:21 +0800 docs(REQ-261004222448-292a): 归档材料落库（验收单 v3 + 台账侧 RTM 刷新）` |
| 工作树 | **脏**：250 文件改动 / +15457 −1846 / 147 未跟踪 |
| 需求台账 | 双源：`~/.dsh/reqboard/`（新分片，51 目录）+ `~/.dsh/dsh-reqboard.json`（旧单体，40 条）→ 并集 **88 条** |
| 审计对象 | `docs/requirements/`（74 目录）、`docs/architecture/project-manual.md`、`docs/knowledge/`、`eval-suite/`、`src/`、`tests/` |

### 上次横向审计

本目录 `docs/reviews/` 在执行前**不存在**（见 §6 附录 A 命令 A-1）——本报告是该仓首份横向审计。

---

## 1. 现状读数（本次全部实跑）

> ⚠️ **读数是快照，不是可冻结的基线**：审计期间（12:14 起）仍有 **36 个受管文件**被**其他窗口**改写
> （见 O-14）。下表每一项都注明采集方式；复现时请先记下 `git diff --stat` 指纹再比对。
> `npx vitest run` 两次独立运行（12:10 与 12:12）结果一致，但**不保证与下一次一致**。

| # | 读数 | 命令 | 结果 |
|---|---|---|---|
| 1 | 全量测试 | `npx vitest run --reporter=dot` | `Test Files 39 failed \| 466 passed \| 3 skipped (508)`；`Tests 70 failed \| 5932 passed \| 22 skipped (6024)`；`REAL_EXIT=1`（两次独立运行同数） |
| 2 | 类型检查 | `npx tsc --noEmit -p tsconfig.json` | `TSC_EXIT=0`，**0 个 error TS** |
| 3 | 知识层自检 | `npx tsx scripts/kb-probe.mts` | **6 项失败 / 11 项检查**（REAL_EXIT=1） |
| 4 | 知识层生成物 | `pnpm kb:check` | `[drift] code-map.md`、`[drift] design-tokens.md` → exit 1 |
| 5 | 未提交规模 | `git diff --shortstat` | `250 files changed, 15457 insertions(+), 1846 deletions(-)` |
| 6 | 未提交需求 | 见 §6 附录 C 脚本 | 最近更新的 25 条需求中 **24 条在 git 历史里查不到任何提交** |
| 7 | 归档缺清单 | 见 §6 附录 B 脚本 | `archived` 需求 **86 条，其中 22 条完全没有归档清单**；有清单的 64 条里 `archivedAt` 命中 **0 条** |
| 8 | 工具映射差集 | `tests/output-contract.test.ts` 独立跑 | `Tests 4 failed \| 34 passed (38)`，点名 4 个工具缺响应源映射 |

---

## 2. 优化清单（按「影响 × 成本」排序）

排序规则：影响高→低，同影响下成本小→大。成本 = 修复动作的规模（小 ≈ 一处/一批机械改动；中 ≈ 需要判断与回归；大 ≈ 需要另立需求）。

### 汇总表

| # | 位置 | 根因（一句话） | 影响 | 成本 |
|---|---|---|---|---|
| O-1 | 工作树 / `5dff7e2` | 归档与验收只写盘+写台账，**没有任何一步要求提交**，多天交付全悬在工作树里 | 高 | 小 |
| O-2 | `docs/requirements/REQ-261002110908-81d0/notes/baseline-2026-10-02.md:27` | 回归基线是"某次开工前的一次性快照"且写成**绝对上限**，现状已远好于上限 → 上限形同虚设 | 高 | 小 |
| O-3 | `tests/output-contract.test.ts:597`（+`tools-dispatch` / `apply-wiring`） | "工具要登记 N 处"靠人记，**没有从注册清单派生** → 新增工具必漏 | 高 | 小 |
| O-4 | 仓库自带机械门禁（≥9 个测试文件） | 存量红灯 70 例里混着一批**纪律门禁**，纪律已红着 ⇒ 新违规与存量噪声不可区分 | 高 | 中 |
| O-5 | `src/shared/protocol.ts:983` + 3 个读取点 | `archivedAt`/`archivedBy` **全仓无写入者**（写它的按钮已下线），读取端没删 → 页面说谎 | 中高 | 小 |
| O-6 | `src/application/use-cases/AmendArchiveManifest.ts:100-101` | 归档材料补交**没有"换窗口"通道**：源窗口没了就永久补不上 | 高 | 中 |
| O-14 | `.gitignore` 约定的 `.worktrees/`（实际为空） | 多个窗口在**同一个工作树**上并发写：审计/回归读数没有冻结基线，且一次崩溃会带走所有人的在飞改动 | 高 | 中 |
| O-7 | `docs/knowledge/INDEX.md` + 生成物 | 知识层"生成物 + 手写索引"混合，超预算/漂移/漏行**没有收敛动作** | 中高 | 小 |
| O-8 | `eval-suite/` | 交付边界明确"不做执行器、另立需求"，而该需求至今没立 → 36 条用例**零自动化、从未跑过** | 中 | 大 |
| O-9 | `docs/architecture/project-manual.md` | 每次归档都往"L1 索引"追加一节机制备忘，**没有溢出到 L2 的机械判据** → 已 48 节 / 1412 行 | 中 | 中 |
| O-10 | `docs/requirements/*/evidence|tests|verification` | 无模板强制"时间"字段，**49/160 份证据文档无日期戳** | 中 | 小 |
| O-11 | `docs/requirements/REQ-261002115204-ba52/tasks/t-9d0b25.md:16` | 数字更正只落在 `notes/`，卡片正文与 RTM 副本未同步 → 同一需求两套数字 | 低 | 小 |
| O-12 | `scripts/` + `docs/knowledge/conventions.md:176` | 新脚本未归类（C-20 要求）；C-27 仍是骨架占位 | 低 | 小 |
| O-13 | 工作区杂项（`.tmp-probe/`、`docs/requirements/backfill-task-refs-report.json`、`docs/handoff/fix-three-tails.md`） | 一次性产物与孤儿文档无清理动作 | 低 | 小 |

---

### O-1 已验收/已归档的需求工作全部未提交（影响 高 · 成本 小）

**位置**：工作树；HEAD `5dff7e2`（2026-10-05 11:43）

**根因**：归档/验收流程只落盘与落台账，没有任何一步要求 `git commit`，于是交付物长期悬在工作树里。

**证据**

```console
$ git diff --shortstat
 250 files changed, 15457 insertions(+), 1846 deletions(-)
$ git status --porcelain | grep -c '^??'
147
$ git status --porcelain -- src | wc -l
155
$ git log -1 --format='%h %ad %s' --date=iso
5dff7e2 2026-10-05 11:43:21 +0800 docs(REQ-261004222448-292a): 归档材料落库（验收单 v3 + 台账侧 RTM 刷新）
```

按目录分布（`git status --porcelain | awk -F/ '{print $1"/"$2}' | sort | uniq -c`）：
`src/application` 70、`docs/requirements` 41、`src/domain` 24、`docs/knowledge` 23、`src/client` 22、`src/tools` 11、`docs/architecture` 10、`vendor/reqboard` 9 …

台账侧对照（脚本见 §6 附录 C）：最近更新的 25 条需求里 **24 条无提交**，其中 `archived` 20 条，时间跨度 2026-10-05 10:12 → 2026-10-06 12:14：

```
REQ-261006092213-4f5b archived 2026-10-06 12:11
REQ-261006094052-1da2 archived 2026-10-06 11:31
REQ-261006091755-1c9e archived 2026-10-06 11:31
REQ-261006093620-a315 archived 2026-10-06 11:31
REQ-261006010812-cd19 archived 2026-10-06 11:31
REQ-261005213603-eaed archived 2026-10-06 09:15
…（共 24 条）
```

**建议动作**：按需求分主题补提交（一次不要一个巨型 commit）；把"提交"写进归档清单的必交项或收尾检查单，使"已归档但未提交"变成可机械判定的状态。

**可验证**：`git status --porcelain | wc -l` → 0；`python3` 脚本（§6 附录 C）输出"无提交需求数 = 0"。

---

### O-2 回归基线口径已过期，且阈值比现状宽（影响 高 · 成本 小）

**位置**：`docs/requirements/REQ-261002110908-81d0/notes/baseline-2026-10-02.md:27`；被 **28 份文档 / 31 处**引用（含 `ba52` 的卡、`rtm-implementing/*.yml`）

**根因**：基线是"某次开工前跑一次"的快照，没有刷新机制；且写成绝对上限（失败 ≤98、tsc ≤197），而现状（70 / 0）远好于上限 ⇒ 上限不再有判别力。

**证据**

基线原文（2026-10-02）：

```
| `npx vitest run --reporter=dot` | **49 failed / 250 passed / 3 skipped（302 文件）**；**98 failed / 2991 passed / 20 skipped（3109 用例）** |
| `npx tsc --noEmit` | 退出码 2，**197 个 `error TS`** |
> 口径：本需求只允许**不新增**失败（`npx vitest run` 失败数 ≤ 98 且改动的文件零新增；`tsc` ≤ 197 且改动文件零新增）。
```

本次（2026-10-06）：

```console
$ npx vitest run --reporter=dot        # 两次独立运行同数
 Test Files  39 failed | 466 passed | 3 skipped (508)
      Tests  70 failed | 5932 passed | 22 skipped (6024)
$ npx tsc --noEmit -p tsconfig.json; echo $?
0
```

→ 当前 tsc 错误 **0**，而文档允许"≤197"：任何**最多 197 个新增类型错误**的实现都能自称"未超基线"。
→ 当前失败 **70**，而文档允许"≤98"：**28 个新增失败**可以静默通过。

**建议动作**：① 把基线改为"**集合差**"口径（记录失败用例的**文件+用例名集合**，只允许差集为空/为已登记豁免），不再用计数上限；② 增加一条 `pnpm baseline` 一键刷新并把结果落 `docs/reviews/` 或固定 notes 文件；③ 全仓替换 31 处过期阈值引用。

**可验证**：`grep -rn "≤ 98\|≤98\|≤ 197\|≤197" docs/ | wc -l` → 0（替换后）；`npx vitest run` + `npx tsc --noEmit` 复核新基线。

---

### O-3 工具登记面多处硬编码，已经漂移（影响 高 · 成本 小）

**位置**：`tests/output-contract.test.ts:597`（`RESPONSE_SOURCES`）、`:664`（断言）；`tests/tools-dispatch.test.ts`；`tests/apply-wiring.test.ts`

**根因**：新增工具要"手工登记 N 处"，这些清单没有从 `src/tools/index.ts` 或工厂扫描派生，漏登记不会被同一处发现，只会散落在多个红测试里。

**证据 1（本次线索核实，比线索更严重）**：`src/tools/` 下实际有 **25 个 `define*Tool` 工厂**，`RESPONSE_SOURCES` 只有 **21 个键**，差集 **4 个**（线索说 3 个，漏了 `SkillInstall`）：

```console
$ npx vitest run tests/output-contract.test.ts
   → defineTaskAdoptTool 缺少响应源映射（新增工具必须补 RESPONSE_SOURCES）: expected undefined not to be undefined
   → defineKnowledgeTool 缺少响应源映射（新增工具必须补 RESPONSE_SOURCES）: expected undefined not to be undefined
   → defineRegenerateTool 缺少响应源映射（新增工具必须补 RESPONSE_SOURCES）: expected undefined not to be undefined
   → defineSkillInstallTool 缺少响应源映射（新增工具必须补 RESPONSE_SOURCES）: expected undefined not to be undefined
 Test Files  1 failed (1)
      Tests  4 failed | 34 passed (38)
```

差集复算（§6 附录 D 脚本 / `comm`）：

```console
$ comm -23 <(工厂名去 Tool 后缀 | sort -u) <(RESPONSE_SOURCES 键 | sort -u)
Knowledge
Regenerate
SkillInstall
TaskAdopt
```

**证据 2**：同一批漂移还出现在另外两处清单（全量输出）：

```
tests/apply-wiring.test.ts   ::  AssertionError: expected [ 'reqboard_accept_sheet', …(26) ] to deeply equal [ 'reqboard_accept_sheet', …(25) ]
tests/tools-dispatch.test.ts ::  AssertionError: expected [ 'AcceptSheetTool', …(26) ] to deeply equal [ 'AcceptSheetTool', …(17) ]
```

即：工具数 25、派发表清单停在 18、接线清单停在 26 —— **三份清单三个数**。

**建议动作**：① 立即补齐 `RESPONSE_SOURCES` 4 项；② 把"工具清单"改为从注册面**派生**（在测试里扫 `define*Tool` 已是现成能力，直接复用生成期望集合），清单只保留"豁免+理由"。

**可验证**：`npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` 全绿；`comm` 差集为空。

---

### O-4 仓库自带的机械门禁处于红灯状态（影响 高 · 成本 中）

**位置**：全量失败集中的门禁类文件

**根因**：这些测试断言的是**仓库自己写在 `docs/knowledge/conventions.md` / `project-manual.md` 里的硬纪律**。它们红着，等于纪律失效；更糟的是让"只允许不新增失败"的比对法失去判别力——O-3 的新违规就是这样混进 70 例噪声里的。

**证据（本次全量跑，逐文件首条错误）**

```
tests/layer-boundary.test.ts        ::  AssertionError: application/ 出现越界 import：
tests/size-budget.test.ts           ::  AssertionError: 超标文件（未在白名单内）：
tests/message-hygiene.test.ts       ::  AssertionError: domain 仍有拼接式消息，请改用 fmt：
tests/probe-hard-criteria.test.ts   ::  AssertionError: 只打印、无断言分支的几何量：live、cssom、size、completed…
tests/project-scope.test.ts         ::  AssertionError: 以下工作区相对写盘点既未受守卫保护、也未在豁免/待偿清单里…
tests/skills-assets.test.ts         ::  AssertionError: expected [ …(3) ] to deeply equal []
tests/template-address-injection.test.ts :: AssertionError: expected 0 to be greater than 0
tests/output-contract.test.ts       ::  （见 O-3）
tests/doc-sync.test.ts              ::  Error: reqboard_move 未执行：…「讨论与裁定记录（D-x）」节未就位
tests/design-registration.test.ts   ::  Error: reqboard_submit(kind=design) 被内容校验门禁拒绝：architecture.md（文档级 serves 缺失…）
```

对照 `conventions.md`：C-01「层边界只许向内」→ `layer-boundary` 红；C-02「宿主单文件 ≤400 行」→ `size-budget` 红；C-07/C-08 内容校验 → `doc-sync`/`design-registration` 红。

环境类与陈旧类（不算门禁，但同属存量）：

```
tests/zero-arg-binding.test.ts      ::  Error: 向上未找到含 pnpm.patchedDependencies 的仓库根 package.json
tests/application/repository.test.ts::  AssertionError: expected 'REQ-261006121339-7c67' to match /^REQ-[0-9a-f]{6}$/
```

`repository.test.ts` 这条尤其典型：仓里有 `CHANGELOG-req-id-timestamp.md` 记录了 id 格式迁移，**7 天后测试仍断言旧格式**——是"生产改了、测试没跟上"的模板案例。

**建议动作**：① 把门禁类红分成"必须立刻救绿"（C-01/C-02/C-07/C-08 对应 4 条）与"待偿清单"（其余），逐条在 `docs/reviews/` 或 notes 里挂名；② 之后把基线口径换成集合差（O-2），否则救绿一批又会被新违规重新污染。

**可验证**：上述文件逐个 `npx vitest run <file>` 转绿；`docs/knowledge/conventions.md` 每条挂的校验命令全部 exit 0。

---

### O-5 `archivedAt` / `archivedBy` 无写入者 → 归档门永远报"待确认"（影响 中高 · 成本 小）

**位置**：声明 `src/shared/protocol.ts:983-984`；读取点 `src/application/query/QueryDocs.ts:674`、`src/client/views/panels/docs.ts:847`、`src/client/views/verification.ts:241`；**写入点：无**

**根因**：这两个字段随人工归档按钮一起下线（`REQ-9f4a44`，见 `src/client/views/verification.ts:244-247` 注释），但**读取端没有同步删除** ⇒ 判据永远落在"未归档"分支。与仓里已记录的同款缺陷（kb-0042「页面说谎」）同类。

**证据 1（无写入者）**

```console
$ grep -rn "archivedAt\s*[:=]\s*[^=]" src/ lib/ scripts/ --include=*.ts --include=*.mts | grep -v "archivedAt?:" | grep -v "archivedAt !==" | grep -v "archivedAt ==="
scripts/fixtures/req-detail-specimen.mts:376:    archivedAt: T0 - 80 * M,     ← 只有造数夹具
```
生产代码零赋值；字符串键形式 `'archivedAt'` 也零命中。

**证据 2（数据全空）**：并集台账扫描（§6 附录 B）→ `with archive.json: 64`，`archivedAt set: 0`。

**证据 3（实跑门禁读数，最硬）**：直接把真实台账记录喂给 `buildGateVerdicts`：

```console
$ npx tsx /tmp/gate-probe.mts
REQ-261002120707-deab status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790918736567,"reason":"归档材料已提交，待归档确认"}]
REQ-261002115204-ba52 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790913701229,"reason":"归档材料已提交，待归档确认"}]
REQ-261001213924-1441 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790904577457,"reason":"归档材料已提交，待归档确认"}]
```

→ **需求状态已经是 `archived`，归档门却报 `pending`**；详情页归档块同样恒显「待归档（材料已备）」（`docs.ts:847`）。

**为什么测试没抓到**：`tests/docs-panel.test.ts:115`、`tests/query-report.test.ts:826`、`tests/node-panel.test.ts:40` 等都是**手工构造** `archivedAt` 夹具，因此"生产从不写这个字段"这件事**零覆盖**（`grep -rn archivedAt tests/` 全部为夹具）。

**建议动作**：二选一并在同一次改动里落定 —— ① 删除这两个字段与三个读取分支（口径改为"`status === 'archived'` 即已归档"）；② 或在归档状态写入点补赋值。推荐 ①（字段已无生产者）。

**可验证**：修复后重跑 §6 附录 E 的门禁探针，`verdict` 应为 `passed`；`npx vitest run tests/query-report.test.ts tests/docs-panel.test.ts` 全绿且新增一条"真实归档路径"用例（而非夹具）。

---

### O-6 归档材料补交没有"换窗口"通道 → 22 条已归档需求永久缺清单（影响 高 · 成本 中）

**位置**：`src/application/use-cases/AmendArchiveManifest.ts:73`（按 `sourceSessionId` 取"我的需求"）、`:100-101`（无 `archive` 即拒）；`src/application/use-cases/SubmitArchive.ts:93`（同样按 `sourceSessionId`）

**根因**：两条补交路径都要求 **`sourceSessionId === 当前窗口`**，而补录工具又要求**归档清单已存在**才允许追加 ⇒ 源窗口消失后，没有归档清单的需求**没有任何工具路径**可以补上。

**证据 1（数据）**：并集台账扫描 → `archived w/o archive.json: 22`，其中就包括本次审计范围内的 4 条：

```
REQ-261002105242-a3fb   archived   无归档清单
REQ-261002110908-81d0   archived   无归档清单
REQ-261002140814-1a5d   archived   无归档清单
REQ-261002141430-a5ef   archived   无归档清单
REQ-261002173819-69c7   archived   无归档清单
…（共 22 条）
```

**证据 2（仓内自述，两条独立需求各留了一份说明）**

`docs/requirements/REQ-261002110908-81d0/notes/archive-materials.md:3-6`：

```
> 状态：**未提交**。原因：验收提交时自动触发的确认门 `pc-a89210`（target=artifact, kind=verification）被 30s 工具超时**打断**，
> 台账里留下一条 interrupted 的挂起记录；它拦住本窗口的写路径（含 `reqboard_submit(kind=archive)`）。
> 需求此时已 `archived` → 本窗口不再"绑定"该需求 → `reqboard_ask_confirm` 也无法再发起/覆盖（REQBOARD_NO_BOUND_REQ）。
```

`docs/requirements/REQ-261002105242-a3fb/archive.md:3`：

```
> 状态：**材料已备，待登记**（`reqboard_submit(kind=archive)` 被一个中断的确认门 pc-04ca68 挡住，
```

两条需求的归档材料**都已写好**（含 `index_entry`），但至今（10-06）仍在台账里缺席 —— 与 §1 读数 7 的"22 条无清单"完全吻合。

**证据 3（代码级无出路）**

```ts
// AmendArchiveManifest.ts:99-102
const archive = full.archive
if (archive === undefined) {
  reject('reqboard_archive_amend 未执行：需求 ' + target.id + ' 尚未提交归档材料（先 reqboard_submit kind=archive）', 'REQBOARD_INVALID_INPUT')
}
```

即"补录"要求"先有清单"，而"提交清单"要求"还是那个源窗口"——**闭环缺少入口**。

**附带发现（诚实标注严重程度：中）**：拦住 81d0 的那条挂起记录来自 `PendingConfirmRegistry`，而它是**纯内存 Map（无持久化）**（`src/adapters/PendingConfirmRegistry.ts:91` `private readonly records = new Map<...>()`）。也就是说"被陈旧挂起永久钉死"这个解释只在**同一进程生存期内**成立；重启即消失。因此 22 条缺清单的主因更可能是"源窗口已不在"（O-6 本项），而不是挂起永不失效 —— 两者需要分开修。

**建议动作**：① 给归档材料补交开一条**不依赖绑定窗口**的通道（例如按 `requirement_id` + 人在看板的显式授权，或允许 owner 席位在归档后仍可提交一次）；② 把 22 条缺清单需求做成一份可勾选清单，逐条补录。

**可验证**：脚本（§6 附录 B）→ `archived w/o archive.json` 从 22 降到 0；`grep -c '尚未提交归档材料' src/application/use-cases/AmendArchiveManifest.ts` 对应的拒绝路径有对应测试证明"换窗口补交成功"。

---

### O-14 多窗口共用同一工作树，审计与回归没有冻结基线（影响 高 · 成本 中）

**位置**：`.gitignore`（约定）↔ `.worktrees/`（实际为空）

**根因**：仓里**已经写了**"并发会话不得共用工作树"的约定，但没有任何机械手段保证它被遵守，于是约定事实上没生效。

**证据 1（约定存在，目录为空）**：`.gitignore` 原文：

```
# 多会话隔离用的 git worktree（每个需求一个；2026-09-30 事故后约定：并发会话不得共用工作树）
.worktrees/
```

```console
$ ls -la .worktrees
total 0
drwxr-xr-x@  2 mac  staff   64 Oct  5 19:15 .
drwxr-xr-x@ 32 mac  staff 1024 Oct  6 12:12 ..
```

**证据 2（本次审计亲身撞上）**：我在 12:14 开始审计，**审计过程中**仍有 36 个受管文件被改写（不是我改的——审计只写 `docs/reviews/`）：

```console
$ find src tests scripts docs templates eval-suite -type f -newermt '2026-10-06 12:14:00' | grep -v '^docs/reviews' | wc -l
      36
$ … | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn | head
  33 docs/requirements
   2 docs/knowledge
   1 src/domain
```

**证据 3（后果）**：§1 的读数（70 用例失败 / 0 类型错误 / 6 项知识层自检红）是**某一瞬间**的快照，其"复现"以工作树不再变动为前提——这本身就是 O-2 基线失真的放大器：基线不是被时间冲淡的，是被**并发写入**冲淡的。

**建议动作**：① 把"一个需求一个 worktree"从注释升级为可检查项（例如会话启动时校验 `git rev-parse --show-toplevel` 落在 `.worktrees/<REQ>`，不合规就告警）；② 回归/审计类命令先记录 `HEAD + git diff --stat` 指纹，写进证据文档（与 O-10 的模板字段同批落地）。

**可验证**：审计/回归证据里出现"工作树指纹"字段；`.worktrees/` 下有活跃 worktree（`git worktree list` 多于一）。

---

### O-7 知识层 6 项自检红 + 索引漏行（影响 中高 · 成本 小）

**位置**：`docs/knowledge/INDEX.md`、`docs/knowledge/design-tokens.md`、`docs/knowledge/code-map.md`、`scripts/kb-probe.mts`

**根因**：知识层是"生成物 + 手写索引行"混合体，但**超预算、漂移、漏行都没有收敛动作**；`kb:check` 因第一段 drift 就短路退出，后面的问题长期不可见。

**证据 1（`npx tsx scripts/kb-probe.mts`，REAL_EXIT=1）**

```
❌ K1 index-chars 实际 10489 > 8000 chars  [docs/knowledge/INDEX.md]
✅ K2 80 行索引、9 节齐全、顺序正确  [docs/knowledge/INDEX.md]
✅ K4 全部指针可解析（含锚点与 L2 原文）
❌ K5 孤儿条目（文件存在但索引未列）：kb-0043；孤儿条目（文件存在但索引未列）：kb-0048
❌ K6 kb-0043 / kb-0048：entry-header 条目 one_liner 非法（1–140 字符、不含 ·/→）
❌ K3 tokens（docs/knowledge/design-tokens.md）220 行 > 200
❌ K7 生成物漂移：…
✅ K8 10 条规范全部挂真实可跑校验
✅ K9 符号表 3048 行 = 源码口径 3048 条
❌ K10 scripts/ 未归类：req-verification-sheet-shot.mts；C-27：「失败怎么办」仍是骨架占位（待补）
✅ K11 17 条规范期望可判定、豁免均带基线
kb-probe: 6 项失败 / 11 项检查
```

旁证：`project-manual.md:27` 把「入口 ≤8K 字符；`pnpm run kb:check` 九项自检」写成对外承诺 —— **承诺与现状矛盾**（K1 已超 31%）。

**证据 2（`pnpm kb:check`）**

```
[drift] docs/knowledge/code-map.md：首个差异在第 10 行（库内 45 行 / 期望 45 行）
[drift] docs/knowledge/design-tokens.md：首个差异在第 8 行（库内 220 行 / 期望 220 行）
kb-build: 符号 3048 条 · 颜色 87 · 变量 87 · 断点 5 · 类名 808 · INDEX 120 行
[verify] 检测到 2 处漂移
EXIT=1
```

**证据 3（索引漏行，`kb-probe` 不覆盖）**：`docs/knowledge/conventions.md:146` 有 C-22「收录/更新上游 skill 资产必须重算指纹」，而 `INDEX.md` 的规范块从 C-21 直接跳到 C-23：

```console
$ grep -o 'kb-conventions-c-[0-9]*' docs/knowledge/INDEX.md | sort -u -t- -k4 -n | tr '\n' ' '
kb-conventions-c-11 … kb-conventions-c-21 kb-conventions-c-23 kb-conventions-c-24 … kb-conventions-c-27
$ grep -c '^### C-' docs/knowledge/conventions.md
27
```

→ 27 条规范，索引只挂 26 行（漏 C-22）。`kb-probe` 的 K 系列不校验"规范↔索引全覆盖"，所以这条**无门禁**。

**顺带澄清（避免误报）**：`entries/` 里另有 kb-0003 / kb-0004 / kb-0031 三个文件不在索引中，但它们分别是 `status: stale` / `stale` / `superseded`，按设计**本就不该进索引**（`scripts/kb-probe.mts:138`）。真孤儿只有 kb-0043 / kb-0048 两条。

**建议动作**：① 重跑 `pnpm kb:build`（消 K7 漂移）并把 INDEX 压回 ≤8K（把"工程操作"一节迁到 `conventions.md` 或独立页）；② 补 kb-0043/kb-0048 索引行并修 `one_liner` 长度；③ 给 C-22 补索引行；④ 加一条"规范节 ↔ 索引行"完整性的 K 检查（防止第 ③ 步再退化）。

**可验证**：`npx tsx scripts/kb-probe.mts` → `0 项失败`；`pnpm kb:check` → exit 0。

---

### O-8 eval-suite 交付物零自动化、从未执行过（影响 中 · 成本 大）

**位置**：`eval-suite/`（118 文件，全部已被 git 跟踪）

**根因**：需求边界明确"不做执行器、另立需求"（`REQ-261002120707-deab/requirement.md:22`、`:198`），但那个"另立的需求"至今没立 ⇒ 套件不可执行、不可回归，只能靠人照 runbook 手工跑。

**证据**

```console
$ grep -rln "eval-suite" tests/ scripts/ src/
(空)
$ ls eval-suite/scenarios/*.yml | wc -l ; ls eval-suite/assertions/ledger/*.yml | wc -l ; ls eval-suite/assertions/trajectory/*.yml | wc -l
36 / 36 / 36                      ← 三份集合完全对齐（很好）
$ comm -3 <(scenarios) <(ledger)  ← 差集为空
$ ls eval-suite/reports/
TEMPLATE.md                       ← 从无一场正式测评报告（runbook 要求 reports/<run-id>/）
$ find eval-suite/calibration -type f
eval-suite/calibration/README.md  ← 仅 1 个文件
$ git ls-files eval-suite/regression | wc -l
0                                 ← README 承诺的目录在克隆后不存在（空目录不入 git）
```

与 README 的落差（`eval-suite/README.md:22-23`）：

```
| calibration/ | 人工标注校准样本（≥10 条，评审锚定用） |   ← 实际只有 README.md
| regression/  | 历次失败用例回流的回归集 |              ← 实际未被 git 跟踪（0 文件）
```

对照 `docs/architecture/project-manual.md:228` 的自述："套件只有内容与规程；自动化执行器（fixture 预置、trace 抓取、断言执行）未实现，需另立需求；G3 步数预算基线 TBD 首轮标定" —— 三条边界**全部仍未关闭**。

**建议动作**：① 立一条执行器需求（fixture 预置 + trace 抓取 + 断言执行 + 报告生成），至少覆盖"台账终态断言"这一层（纯确定性，最容易自动化）；② 在自动化落地前沿用"首轮手工标定"的临时路径，把 TBD 的 G3 步数预算标出来；③ 校准样本补齐到 ≥10 或把 README 的承诺改到与实际一致；④ 给 `regression/` 放一个 `.gitkeep` + 说明（或改为按需创建）。

**可验证**：`grep -rl eval-suite tests/` 非空；`ls eval-suite/reports/` 出现至少一个 `run-YYYY-MM-DD-NN/`；`find eval-suite/calibration -type f | wc -l` ≥ 10。

---

### O-9 「L1 索引」已膨胀为 48 节机制备忘（影响 中 · 成本 中）

**位置**：`docs/architecture/project-manual.md`（1412 行）

**根因**：每次需求归档都往 project-manual 追加一节"机制备忘"，**没有"何时该溢出到 L2 领域篇"的机械判据**；而该文件开头自述"L1 只放索引与全局约定，具体机制写在领域篇（L2）"——自述与结构已经矛盾。

**证据**

```console
$ grep -c '^## 机制备忘' docs/architecture/project-manual.md
48
$ wc -l docs/architecture/project-manual.md
1412
$ grep -n '^## 机制备忘' docs/architecture/project-manual.md | grep "确认门\|挂起确认\|人工门"
641:  弹框在途即停手（人工门禁与自动链的准入契约）
1130: 确认门被中断后窗口会卡住（REQ-261005105032-3b02 与 REQ-261005193546-1b1a 实测）
1150: 挂起确认「拦什么」的判据（REQ-261005200052-ce40）
1332: 确认门的推进契约与「给一条路径补推进 = 必须同时查门是否同源」（REQ-261006094052-1da2）
$ grep -n '^## 机制备忘' docs/architecture/project-manual.md | grep -c "token\|读数"
2
```

同类主题已出现 4 节（确认门）与 2 节（token 读数），且**同一主题的结论正在互相取代**（如 kb-0054 自述"同次就地取代领域篇红线中 advanceLockAt 一条"）——正是"取代但不删旧"的典型形态。

**建议动作**：① 给 L1 设容量纪律（如"机制备忘 ≤20 节 / 单节 ≤30 行"，超限必须外迁）；② 按主题合并：确认门 4 节 → 1 节《确认门契约》、token 读数 2 节 → L2 篇；③ 外迁时保留"一条指针 + 一句结论"在 L1。

**可验证**：`grep -c '^## 机制备忘' docs/architecture/project-manual.md` 落到纪律上限内；`wc -l` 显著下降；L1 表行数不变（外迁不丢入口）。

---

### O-10 49/160 份证据类文档没有日期戳（影响 中 · 成本 小）

**位置**：`docs/requirements/*/evidence/*.md`、`*/tests/*evidence*.md`、`*/verification.md`

**根因**：没有模板强制"时间（必要时 + HEAD）"字段；只有部分窗口自发写了（例如 `REQ-260927121324-abde` 的证据写了"环境：… HEAD daa4169e · branch main"），无强制即会漂。

**证据**

```console
$ python3 <扫描脚本>   # §6 附录 F
total 160 | 无 YYYY-MM-DD: 49
docs/requirements/REQ-261004195831-0f52/evidence/verification.md
docs/requirements/REQ-261002105242-a3fb/tests/test-evidence.md
docs/requirements/REQ-261005154851-8512/evidence/compat-baseline.md
docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md
…（共 49 条）
```

雪上加霜的是**最关键的基线证据把原始输出放在 `/tmp`**（`baseline-2026-10-02.md` 的"原始输出（本机临时文件，重跑命令即可复现）：`/tmp/pmbase-vitest.txt`、`/tmp/pmbase-tsc.txt`"）—— `/tmp` 会随重启消失，等于证据只有摘要没有原件。

**建议动作**：① 证据文档模板首行强制 `> 采集时间：YYYY-MM-DD HH:mm · HEAD <sha> · 环境：node/vitest 版本`，缺则报告模板校验失败；② 原始输出落 `docs/requirements/<REQ>/evidence/raw/`（或至少不落 `/tmp`）并纳入归档清单对账。

**可验证**：扫描脚本 `无 YYYY-MM-DD` → 0；`grep -rn "/tmp/" docs/requirements/*/notes/*baseline*.md` → 0。

---

### O-11 卡文本残留旧数字（×3 应为 ×2）（影响 低 · 成本 小）——**本次线索已核实为真**

**位置**：`docs/requirements/REQ-261002115204-ba52/tasks/t-9d0b25.md:16`；同款残留还在 `notes/work-done-during-wedge.md:16`

**根因**：数字更正只落在 `notes/t5-verification-evidence.md`，**卡片正文与 rtm 副本没有回改** ⇒ 同一需求内两套数字。

**证据**

```console
$ grep -rn '×3\|×2' docs/requirements/REQ-261002115204-ba52/tasks/t-9d0b25.md docs/requirements/REQ-261002115204-ba52/notes/*.md
tasks/t-9d0b25.md:16:    … pnpm build exit 0 且 dist/index.mjs 命中「拆成多次调用」×3、「汇报自检」×2。
notes/t5-verification-evidence.md:16: | 6 | `grep -c` on `dist/index.mjs` | 「拆成多次调用」×2、「汇报自检」×2；mtime 11:58:29 | …
notes/t5-verification-evidence.md:20: 1. **`dist/index.mjs` 命中「拆成多次调用」×2（非 ×3）**：构建后 `dist/index.mjs` 内含 2 处——(a) 合并进
notes/t5-verification-evidence.md:21:    `LONG_TEXT_ARG_NOTE` 的工具描述，(b) `TASK_REPORT_PROMPT` 里的分段指引。旧记录写 ×3 系上一版产物口径。
notes/work-done-during-wedge.md:16:  … `dist/index.mjs` 命中 `拆成多次调用` ×3、`汇报自检` ×2（构建时间 11:27）→ 重启宿主即生效
```

我复跑了该数字（当前 dist 与当日产物已不同，故**计数不能跨版本对比**，仅证明"同一需求内自相矛盾"）：

```console
$ grep -o '拆成多次调用' dist/index.mjs | wc -l ; grep -o '汇报自检' dist/index.mjs | wc -l
13
2
```

**建议动作**：把 `tasks/t-9d0b25.md`、`notes/work-done-during-wedge.md` 的 ×3 改为 ×2 并注明"以 `t5-verification-evidence.md` 的更正为准"；RTM 副本同步。**更根本的是**：卡片正文的完工摘要与 notes 更正互为副本，缺"单点"——建议卡面只留指针，数字只在 notes 一份。

**可验证**：`grep -rn "×3" docs/requirements/REQ-261002115204-ba52/` → 无输出。

---

### O-12 新脚本未归类 / C-27 占位（影响 低 · 成本 小）

**位置**：`scripts/req-verification-sheet-shot.mts`；`docs/knowledge/conventions.md:176`（C-27）

**证据**

```console
$ npx tsx scripts/kb-conventions-sync.mts --check
[kb-conventions-sync] scripts/ 未归类文件（须进白名单或排除表并写理由）：req-verification-sheet-shot.mts
[verify] 1 类问题
```

（`kb-probe` K10 同时报同一项 + C-27「失败怎么办」仍是骨架占位。）

**建议动作**：把该脚本按 C-20 口径归类（写"是什么/什么时候跑/怎么判绿/失败了怎么办"四要素）；补齐 C-27 的失败处置段。

**可验证**：`npx tsx scripts/kb-conventions-sync.mts --check` → 无未归类；`pnpm kb:probe` K10 转绿。

---

### O-13 工作区杂项（影响 低 · 成本 小）

**位置与证据**

| 项 | 证据 | 说明 |
|---|---|---|
| `.tmp-probe/` 空目录 | `ls -la .tmp-probe` → 空（mtime 10-06 12:06） | 探针残留，未被 `.gitignore` 覆盖 |
| `docs/requirements/backfill-task-refs-report.json` | 位于需求目录**根**，不在任何 `REQ-*/` 内 | 一次性回填报告混进需求树 |
| `docs/handoff/fix-three-tails.md` | 全仓引用数 **0**（`grep -rl` 排除自身） | 孤儿交接文档（另两份被引用 6 / 3 次） |
| `~/.dsh/dsh-reqboard.json` 及两份备份 | `dsh-reqboard.json`、`.backup-1791026214680`、`.bak-bind`（4.2M+4.2M+3.8M） | 迁移后旧单体台账未清理（仓外，仅提示） |

**建议动作**：删 `.tmp-probe/` 或加进 `.gitignore`；把 `backfill-task-refs-report.json` 迁到 `docs/reviews/` 或对应需求目录；孤儿 handoff 文档要么挂进 L1 入口，要么标注为历史存档并注明"不再消费"。

**可验证**：`ls -d .tmp-probe` 不存在；`ls docs/requirements/*.json` 无输出。

---

## 3. 建议立即动手的前 5 条

按"影响 × 成本"取性价比最高的 5 条（4 条高影响中/低成本 + 1 条中高影响低成本）：

| 顺序 | 条目 | 一句话动作 | 预期可验证结果 |
|---|---|---|---|
| **1** | **O-1** | 按需求分主题补提交工作树（先提交 `src/` + `docs/`，再逐个需求） | `git status --porcelain \| wc -l → 0` |
| **2** | **O-3** | 补齐 `RESPONSE_SOURCES` 的 4 个工具映射（TaskAdopt / Knowledge / Regenerate / SkillInstall），并把工具清单改为派生 | `npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` 全绿 |
| **3** | **O-2** | 重建基线：把"计数上限"换成"失败集合差"，刷新 31 处过期阈值引用 | `grep -rn "≤ 98\|≤ 197" docs/ \| wc -l → 0` |
| **4** | **O-5** | 删除无生产者的 `archivedAt`/`archivedBy` 与三个读取分支（或补写入点），并把测试从夹具改走真实归档路径 | 门禁探针（§6 附录 E）`verdict` 由 `pending` 变 `passed` |
| **5** | **O-7** | 重生成知识层 + INDEX 压回 ≤8K + 补 kb-0043/0048 与 C-22 索引行 | `npx tsx scripts/kb-probe.mts` → 0 项失败；`pnpm kb:check` exit 0 |

**为什么不是 O-6**：O-6 影响同样高，但它是**产品行为改动**（要设计"不依赖绑定窗口的补交通道"），成本为中且需要人工门判断，适合紧随其后单独立需求承接，不宜与上面 5 条机械修复混在一个批次。**为什么不是 O-4**：O-4 是"救绿存量门禁"，成本中且范围大，应建立在 O-2 的新基线口径上（否则救绿会被再次污染）。**为什么不是 O-14**：O-14 影响高但属约定落地（要改会话启动检查），与 O-1 是同一个"交付没有冻结点"的病根；建议作为 O-1 提交动作的**前置条件**一并解决——先隔离，再提交，否则提交时无法确认提交的是哪一批改动。

---

## 4. 线索核实结论（逐条对账）

任务给出的 4 条线索，我独立核实结果如下：

| 线索 | 核实结论 | 证据 |
|---|---|---|
| `src/application/use-cases/ClearPause.ts:84` 疑为 `req.dive.pausedReason = undefined`，致工具输出被拒 | **未复现（该缺陷已修）**。第 84 行现为 `if (cleared.changed && cleared.next !== undefined) req.dive = cleared.next`；第 9 行注释自述的正是这条规则（"回执带了 undefined 值属性 ⇒ 绑定层无损 JSON 校验整体拒收"），且第 111-112 行已按"缺值省略键"发回执。线索描述的旧形状在本仓不存在 | `read src/application/use-cases/ClearPause.ts`（全文 115 行） |
| `tests/output-contract.test.ts:494` 的 `RESPONSE_SOURCES` 疑缺 TaskAdopt / Knowledge / Regenerate 三项 | **部分成立且更严重**：映射表实际在 **`:597`**（不是 494），缺 **4** 项（另缺 `SkillInstall`）。独立跑该文件 → 4 failed 并逐条点名 | `npx vitest run tests/output-contract.test.ts`；`comm` 差集 |
| `npx vitest run --reporter=dot` 疑有 49 文件 / 98 用例存量失败 | **不成立（数字已变）**：现状 **39 文件 / 70 用例**（两次运行一致）；tsc 也从 197 错误降为 **0**。49/98 是 2026-10-02 的历史基线 | §1 读数 1、2 |
| `docs/requirements/REQ-261002115204-ba52/tasks/t-9d0b25.md` 疑残留旧数字（×3 应为 ×2） | **成立**，且同款残留在 `notes/work-done-during-wedge.md:16`；同需求的 `notes/t5-verification-evidence.md:20-21` 已明确更正为 ×2 | O-11 |

**附带澄清**：审计过程中一度观察到 `REQ-261002115204-ba52/queue.json` 疑似混入其他需求（`REQ-260927121324-abde` / `REQ-260927144541-0481`）的任务记录。经逐文件全量复算，**该现象不成立**——67 份 `queue.json` 全部只含自身 `requirementId`（`grep -o '"requirementId": *"[^"]*"' … | sort -u` 仅一条）。如实记录以免误导后续审计。

---

## 5. 未核实 / 无法核实（不猜）

以下条目**本次没有取得证据**，仅作为下一步的候选方向列出，不作为结论：

1. **O-6 中"源窗口已消失"这一环未直接验证**。我核实了代码路径的封闭性与 22 条缺清单的事实，但没有去核对这 22 条需求的 `sourceSessionId` 对应会话是否仍存在/可写（`~/.dsh/sessions/` 未逐条比对）。
2. **250 个未提交改动的性质未逐个审阅**。只做了目录分布统计，未判断哪些是"已验收交付物"、哪些是"探针/临时产物"。**另注**：审计期间该集合仍在增长（36 个文件被其他窗口改写，见 O-14），因此"250"只是采集瞬间的值。
3. **`probe-hard-criteria` / `project-scope` / `template-address-injection` / `skills-assets` 四条红灯的根因未深挖**。只确认了它们属于"仓库自带纪律断言"且当前为红，未逐条定位到具体违规文件与行号。
4. **`docs/requirements/*/queue.json` 与 `rtm-*.yml` 的一致性未校验**（文件数多、口径需先定），仅验证了没有跨需求记录混入。
5. **`eval-suite` 36 条场景脚本的内容质量未评审**（只核对了三份集合一一对应、目录承诺与实际的落差）。
6. **`vendor/reqboard/` 9 个文件的改动与主仓的关系未查**（本次未纳入范围）。
7. **`archivedAt` 之外是否还有别的"只读死字段"未做系统扫描**（本次只顺着线索深挖了这一个；建议后续用"字段有读取点、无写入点"的机械扫描全量找一遍）。

---

## 6. 附录：本次实跑的命令与脚本

### A. 目录与起点

```
A-1  ls -la docs/ ; ls -la docs/reviews
     → docs/reviews: No such file or directory
A-2  date "+%Y-%m-%d"                       → 2026-10-06
A-3  git log -1 --format='%h %ad %s' --date=iso
     → 5dff7e2 2026-10-05 11:43:21 +0800 docs(REQ-261004222448-292a): 归档材料落库（验收单 v3 + 台账侧 RTM 刷新）
```

### B. 台账一致性扫描（归档清单 / archivedAt）

```python
# 读双源台账（新分片目录 + 旧单体），统计归档态与 archivedAt
R = os.path.expanduser('~/.dsh/reqboard')
# requirements/*/ + archive/*/ 各读 record.json / artifacts.json / archive.json
...
print('requirements/ dirs:', len(reqs), ' archive/ dirs:', len(arch))     # 51 / 37
print('archived w/o archive.json:', len(noarc))                          # 22
print('with archive.json:', len(wa), ' archivedAt set:',
      sum(1 for r in wa if r['archive'].get('archivedAt')))              # 64 / 0
print('  reconcile present:', ...)  # 21
print('  amendments:', ...)         # 2
```

### C. 未提交需求扫描

```python
for r in sorted(recs.values(), key=lambda r: -(r.get('updatedAt') or 0))[:25]:
    out = subprocess.run(['git','log','--all','--oneline','--grep',r['id']], capture_output=True, text=True).stdout.strip()
    if not out: nocommit.append(r)
# 结果：最近更新的 25 条需求中，git 历史里查不到提交的：24
```

### D. 工具工厂 ↔ 响应源映射差集

```console
$ grep -rho 'export function define[A-Za-z]*Tool(deps: UseCaseDeps)' src/tools | sed 's/export function define//;s/Tool(deps.*//' | sort -u > /tmp/factories.txt
$ sed -n '/^const RESPONSE_SOURCES/,/^}/p' tests/output-contract.test.ts | grep -o '^  [A-Za-z]*:' | tr -d ' :' | sort > /tmp/mapped.txt
$ comm -23 /tmp/factories.txt /tmp/mapped.txt
Knowledge
Regenerate
SkillInstall
TaskAdopt
$ wc -l /tmp/factories.txt /tmp/mapped.txt
  25 / 21
```

### E. 归档门读数探针（写于 `/tmp`，只读台账）

```ts
// /tmp/gate-probe.mts
import { readFileSync } from 'node:fs'
import { buildGateVerdicts } from '/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/query/QueryDocs.ts'
const legacy = JSON.parse(readFileSync(process.env.HOME + '/.dsh/dsh-reqboard.json', 'utf8'))
for (const id of ['REQ-261002120707-deab', 'REQ-261002115204-ba52', 'REQ-261001213924-1441']) {
  const r = legacy.requirements.find((x: any) => x.id === id)
  console.log(id, 'status=' + r.status, 'archive=' + (r.archive ? 'yes' : 'no'),
    '|', JSON.stringify(buildGateVerdicts(r, []).filter((g: any) => g.gate === 'archive')))
}
```

```console
$ npx tsx /tmp/gate-probe.mts
REQ-261002120707-deab status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790918736567,"reason":"归档材料已提交，待归档确认"}]
REQ-261002115204-ba52 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790913701229,"reason":"归档材料已提交，待归档确认"}]
REQ-261001213924-1441 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790904577457,"reason":"归档材料已提交，待归档确认"}]
```

### F. 证据文档时效扫描

```python
files = glob('docs/requirements/*/evidence/*.md') + glob('docs/requirements/*/tests/*evidence*.md') + glob('docs/requirements/*/verification.md')
# total 160 | 无 YYYY-MM-DD: 49
```

### G. 全量测试失败分类（节选）

```console
$ npx vitest run --reporter=dot > /tmp/vitest-full.log 2>&1 ; echo $?
1
$ grep -E "^ *(Test Files|Tests) " /tmp/vitest-full.log | tail -2
 Test Files  39 failed | 466 passed | 3 skipped (508)
      Tests  70 failed | 5932 passed | 22 skipped (6024)
```

38 个失败文件的首条错误（摘）：

```
tests/adapters/failure-alert.test.ts   :: AssertionError: expected [ …(2) ] to have a length of 1 but got 2
tests/application/repository.test.ts   :: AssertionError: expected 'REQ-261006121339-7c67' to match /^REQ-[0-9a-f]{6}$/
tests/apply-wiring.test.ts             :: expected [ …(26) ] to deeply equal [ …(25) ]
tests/auto-chain-approval.test.ts      :: expected 'accepting' to be 'implementing'
tests/capture.test.ts                  :: expected '📋 PM · 项目捕获…' to contain '不许沉默'
tests/confirm-settle-plan-persist.test.ts :: expected false to be true
tests/create-doc-location.test.ts      :: expected [ 'doc_location', 'workspace' ] to deeply equal [ 'doc_location' ]
tests/decompose-tools.test.ts          :: expected [Function] to throw /REQBOARD_ALREADY_DECOMPOSED/
tests/design-registration.test.ts      :: reqboard_submit(kind=design) 被内容校验门禁拒绝：architecture.md（文档级 serves 缺失…）
tests/doc-sync.test.ts                 :: reqboard_move 未执行：…「讨论与裁定记录（D-x）」节未就位
tests/e2e-triad-gate.test.ts           :: 转移 decomposing → implementing 是人工闸门，仅人可操作（REQBOARD_HUMAN_GATE）
tests/failure-handling.test.ts         :: expected [] to deeply equal [ 'rollback' ]
tests/gate-aware-questions.test.ts     :: expected [ 'name','category',…(3) ] to deeply equal [ …(2) ]
tests/handoff.test.ts                  :: reqboard_task_move 未执行：任务 t-31b3bc 的上层依赖未完成（REQBOARD_DEPENDENCY_GATE）
tests/header-progress-e2e.test.ts      :: 探针应全档通过（退出码 0）
tests/interruption-checkpoint.test.ts  :: expected undefined not to be undefined
tests/kb-archive-deposit.test.ts       :: 需求 REQ-abc123 已归档（archived），冷侧只读
tests/layer-boundary.test.ts           :: application/ 出现越界 import：
tests/message-hygiene.test.ts          :: domain 仍有拼接式消息，请改用 fmt：
tests/move-rollback.test.ts            :: design → decomposing 的设计文档集：requirement.md 不存在
tests/node-panel-styles.test.ts        :: expected '…' to contain 'min(720px, calc(100vw - 130px))'
tests/output-contract.test.ts          :: defineTaskAdoptTool 缺少响应源映射…
tests/plan-mode.test.ts                :: expected undefined to be 'decomposing'
tests/probe-hard-criteria.test.ts      :: 只打印、无断言分支的几何量：live、cssom、size、completed…
tests/project-scope.test.ts            :: 以下工作区相对写盘点既未受守卫保护、也未在豁免/待偿清单里…
tests/reqboard/settings-init.test.ts   :: expected '/var/folders/…' to be '/var/folders/…'
tests/size-budget.test.ts              :: 超标文件（未在白名单内）：
tests/skills-assets.test.ts            :: expected [ …(3) ] to deeply equal []
tests/t11-decompose-queue-write.test.ts:: expected '…' to contain 'landPlanTasks('
tests/t17-queue-e2e.test.ts            :: expected 'brainstorming' to be 'design'
tests/t7-legacy-tolerance.test.ts      :: expected true to be false
tests/task-status-integration.test.ts  :: expected { success:true,…(6) } to deeply equal { success:true,…(4) }
tests/template-address-injection.test.ts :: expected 0 to be greater than 0
tests/tools-dispatch.test.ts           :: expected [ …(26) ] to deeply equal [ 'AcceptSheetTool', …(17) ]
tests/triad-gate.test.ts               :: expected [Function] to throw /task_card_incomplete/
tests/zero-arg-binding.test.ts         :: Error: 向上未找到含 pnpm.patchedDependencies 的仓库根 package.json
```

### H. 本报告未改动的确认

```console
$ git status --porcelain -- docs/reviews
（执行写报告前为空目录；报告为本目录首个文件）
```
审计期间未修改 `src/`、`tests/`、`scripts/`、`docs/` 任何既有文件；所有探针脚本写在 `/tmp`。

---

## 附录 I. 审计后复核与更正（2026-10-06 12:3x）

> 本节是**审计之后的复核**，不改上文（上文是 12:1x 的读数快照，按本报告 O-2 自己的口径：
> 带日期的读数**不追改**；更正以本节的显式追加形式给出）。
> 复核方式：为写 `REQ-261006123819-3af3` 的设计而做的两轮独立只读取证（两个子代理 + 我本人复跑）。

### I-1 一处**必须更正的坏引用**（我的错误，非环境变化）

O-10 节原文写道：

> 只有部分窗口自发写了（例如 `REQ-260927121324-abde` 的证据写了"环境：… HEAD daa4169e · branch main"）

**该需求号不存在。** 核实：

```console
$ ls -d docs/requirements/REQ-260927121324-abde
ls: docs/requirements/REQ-260927121324-abde: No such file or directory
$ grep -rl "REQ-260927121324-abde" docs/
docs/reviews/project-audit-2026-10-06.md      ← 全仓唯一出现处，就是本报告自己
$ ls -1 docs/requirements | grep -c '^REQ-'
76
```

**成因**：审计过程中一次 `bash` 调用的输出出现了错乱片段（把另一份 `queue.json` 的内容拼进了结果里），
我在其中看到了 `REQ-260927121324-abde` 及其"环境：… HEAD daa4169e"字样，便当成真实证据引用。
**这是审计方的取证错误**——当时只用 `ls` 验证了该片段里另一个需求号、没有验证这一个。

**更正后的真实样例**（复核时逐条实读，可复跑）：

| 真实文件 | 原文（摘） |
|---|---|
| `docs/requirements/REQ-261002105242-a3fb/tests/test-evidence.md:3` | `> 采集时间：2026-10-02 · 采集人：窗口 agent · 环境：本仓工作区 / Node + vitest 2.0.0` |
| `docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md:68` | `- C-15（类型检查）：0 错误（HEAD worktree \`660973e\` 基线同为 0）。` |
| `docs/requirements/REQ-261001110934-3766/tests/test-evidence.md:38` | `\| HEAD（\`188c4a5\`） \| 263（53 文件失败） \| …` |

**结论不变**：O-10 的判断（证据文档缺统一时间/指纹字段）成立，只是引用的样例换成了真实的三份；
且复核确认**没有一份**写成"`HEAD` + `git diff --stat`"完整指纹形态——这加强了 O-10 的建议。

### I-2 读数已变化（并发写入所致，非更正）

本报告 §1 的读数是 12:1x 的快照；12:25 前后复核，以下各项已变（工作树被其他窗口持续改写）：

| 项 | 审计快照（12:1x） | 复核（12:25–12:35） | 说明 |
|---|---|---|---|
| `kb-probe` 失败项 | 6 项 | **5 项** | **K7 生成物漂移已绿**——有窗口在审计后跑了 `--write` 重生成；K10 的"scripts/ 未归类"也已解决（`req-verification-sheet-shot.mts` 已进 `operations.ts:121` 的 EXCLUDED），K10 只剩 C-27 占位 |
| `INDEX.md` 字符数 | 10489 | **10648** | K1 仍然红，缺口从 2489 扩大到 2648 |
| `INDEX.md` 行数 | 80 | **81** | K2 仍绿 |
| `git status --porcelain` | 250 文件 | **401 文件** | `HEAD` 未动（仍 `5dff7e2` 2026-10-05 11:43）；1 小时内又累积 151 个未提交文件 |

**这三条变化本身就是 O-14 的实证**：审计读数在 20 分钟内就部分失效，且**没有任何一次提交**。
按 O-14 的建议，回归/审计证据必须带工作树指纹——本报告 §1 的读数当时**没有**带指纹，这正是缺陷。

### I-3 复核新发现（补记，供后续需求取用）

复核过程中另查实三处上文未列的缺陷，严重度按本报告口径标注：

| # | 位置 | 根因 | 严重度 |
|---|---|---|---|
| I-3-a | `src/application/use-cases/DepositKnowledge.ts:70` | 沉淀知识条目时 `input.indexEntry.slice(0, 140)` **只截长度、不清理 `·`/`→`**（对照 `src/domain/knowledge/operations.ts:350` 的正确口径是 `replace(/[·→\n]/g,' ')` 再截断） | 中（产出非法条目） |
| I-3-b | `src/adapters/KnowledgeRepository.ts:123-131` | `appendEntry` **先写 `entries/<id>.md`、后写索引行**；索引行渲染抛错 ⇒ 条目落盘、索引没写 = **孤儿条目**（kb-0043/kb-0048 正是此形态） | 中（孤儿会持续再生） |
| I-3-c | `src/format`/`docs/knowledge/INDEX.md` 的规范行 | 页面小节 ↔ 索引行的完整性**无任何门禁**（K5 只枚举 `entries/*.md`，不覆盖 `kb-conventions-c-*`）——所以 C-22 漏行能长期无人发现 | 低中（静默漏登记） |

**另记一条避免重复踩坑的事实**：不要试图用"重跑归档沉淀"修坏条目——`findSameOriginEntry` 依赖
`parseEntryDoc`，坏 `one_liner` 令其抛错 → catch 跳过 → 会**分配新 id**（kb-0059/0060），孤儿依旧。
正确顺序是先手改 entry 的 `one_liner`，再（可选）重沉淀，或直接手改 entry + INDEX 两处。

以上三条已作为 `REQ-261006123819-3af3` 的 FR-4 收敛项（见该需求 `design/architecture.md` 的「收敛 3」）。
