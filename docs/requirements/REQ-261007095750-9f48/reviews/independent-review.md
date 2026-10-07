# 独立评审报告：拆分依赖判据的 src/ 盲区修复（REQ-261007095750-9f48）

> 复核者：独立复核者（非实现者，未参与本需求的实现与取证）
> 复核快照：2026-10-07T10:18:43（本目录文件 mtime 集中在 10:12–10:14，见 ①.3「并发写入」）
> 仓库：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 纪律：本报告**不引用证据文件的数字作为结论**；下文每个数字都是本复核当场跑出来的。
> 未调用任何 `reqboard_*` 工具；全程只新增本文件（自证见文末）。

---

## ① 复核范围与方式

### 1.1 复核对象（已逐份读）

| 类别 | 文件 |
|---|---|
| 需求 | `requirement.md`（sha256 `a5b7a1f7…`） |
| 设计 | `design/architecture.md`（`caaae16e…`）、`data-model.md`（`f699ec36…`）、`interfaces.md`（`d952afe0…`）、`test-cases.md`（`43726f50…`）、`use-cases.md`（`8b0201d9…`） |
| 拆分 | `decomposition.md`（`cda3ae13…`） |
| 证据 | `tests/t1-t2-extraction-and-wiring-evidence.md`（`2f14da31…`）、`tests/real-data-readings.md`（`e636dd32…`）、`tests/t4-doc-sync-and-gates.md`（`cdfa98dc…`）、`tests/scaffolding-skeleton-note.md`（`36c63d3d…`） |
| 实现 | `src/application/internal/conflict-check.ts`（`4aa0c7f3…`）、`tests/path-extraction-scope.test.ts`（`9455ce01…`）、`tests/concurrency-limits.test.ts`（`ff509385…`）、`tests/doc-gate-e2e.test.ts`（`8342f169…`） |

### 1.2 我自己跑的东西（全部仓库外脚本，落在 `/tmp`，不落仓库）

| 脚本 | 作用 |
|---|---|
| `/tmp/rev-extract-compare.mts`、`/tmp/rev-extract-compare2.mts` | 旧口径正则 vs `declaredFiles` 的**双向**对照 + 「只增不减」超集断言 |
| `/tmp/rev-readings.mts` | 真实数据读数（把**改前的判据算法**本地复制，只换抽取器 → 比"抹文本"更忠实） |
| `/tmp/rev-method-diff.mts`、`/tmp/rev-edge-diff.mts`、`/tmp/rev-mts-hypothesis.mts` | 把「改前」的两种算法口径分开量化，定位证据读数的口径偏差 |
| `/tmp/rev-spotcheck.mts`、`/tmp/rev-suffix.mts`、`/tmp/rev-fp-class.mts` | 新命中逐条抽查 + 机械判真伪 + 误报分类 |
| `/tmp/rev-decomp-corpus.mts` | 在**上一轮评审的原始语料**上复算改前/改后 |
| `/tmp/rev-split.mts`、`/tmp/rev-blind.mts` | 拆出「扩根」与「补 .mts」各自的贡献；量化扩根后仍不判的边 |

### 1.3 ⚠️ 并发写入（必须让验收人知道的事）

复核开始时（首次 `ls -R`）`tests/` 只有 3 份 md；随后 `tests/readings.mts`（mtime 10:14:02）与
`tests/scaffolding-skeleton-note.md`（10:14:42）**在本次复核进行中被写入**。同目录全部文件 mtime
集中在 10:12–10:14。⇒ 本次复核对的是**一个仍在被另一窗口写入的快照**；若这之后有人改了被复核对象，
本报告的结论需要重跑（下文所有读数均可按 §①.2 的脚本复现）。

```
$ stat -f '%Sm %N' -t '%Y-%m-%dT%H:%M:%S' docs/requirements/REQ-261007095750-9f48/tests/*
2026-10-07T10:14:02 … tests/readings.mts
2026-10-07T10:13:58 … tests/real-data-readings.md
2026-10-07T10:14:42 … tests/scaffolding-skeleton-note.md
2026-10-07T10:13:34 … tests/t1-t2-extraction-and-wiring-evidence.md
2026-10-07T10:12:45 … tests/t4-doc-sync-and-gates.md
```

---

## ② 我独立跑到的读数（逐项与证据文件对照）

### 2.1 四条测试命令（逐文件计数）

```
$ npx vitest run tests/path-extraction-scope.test.ts tests/concurrency-limits.test.ts \
    tests/plan-depends-e2e.test.ts tests/doc-gate-e2e.test.ts
 ✓ tests/path-extraction-scope.test.ts  (7 tests)
 ✓ tests/doc-gate-e2e.test.ts  (8 tests)
 ✓ tests/concurrency-limits.test.ts  (10 tests)
 ✓ tests/plan-depends-e2e.test.ts  (9 tests)
 Test Files  4 passed (4)      Tests  34 passed (34)
```

⇒ **与证据一致**（`tests/t1-t2-extraction-and-wiring-evidence.md:21-24` 写 4 passed / 34 tests，7·10·9·8 逐文件计数也一致）。exit 0。

### 2.2 双向抽取对照（旧口径必须抽不到、新口径必须抽得到）

```
$ npx tsx /tmp/rev-extract-compare.mts
PASS 旧口径抽不到 src/（0 条）→ 扩根前该文本被整段忽略
PASS 新口径抽到 2 条            # '改 src/application/internal/conflict-check.ts 与 scripts/x.mts'
PASS 新口径含 .mts 文件
PASS 旧口径抽不到 .mts（扩展名表缺）
PASS 新口径不误吃目录名          # '见 src/application/internal/ 这一层' → []
PASS 空/无扩展名不误报
PASS 去重

$ npx tsx /tmp/rev-extract-compare2.mts
PASS 旧口径命中集在新口径下全部保留（只增不减，8 组样例）
PASS packages 根行为逐字节不变
PASS 嵌套根下新旧切片字符串不同（同文本指向不同真实文件：本仓 src/ 与 packages/ 是兄弟目录）
PASS 不误抽: "见 src/application/internal/ 这一层" / "改一下 src" / "" / "  " / "重命名一个符号"
PASS 无根裸文件名不抽（保守边界保持）
```

⇒ 证据声称的两件事（`real-data-readings.md` §6 的旧正则、`interfaces.md:27-28` 的改前/改后）**成立**：
旧口径对 `src/**` 与 `.mts` 全盲，新口径两种都抽得到；既有四根与 `agent-dh/` 前缀命中集是**超集**（只增不减），
目录名 / 无扩展名 / 空串仍不误抽。

**一处我另外发现的口径边界（证据未提）**：新正则**没有左边界断言**（对比 `src/domain/task/Footprint.ts:84`
的 `(?<![A-Za-z0-9._-])`），因此 `vendor/reqboard/src/rtm/validator.ts` 被切成 `src/rtm/validator.ts`
（`/tmp/rev-extract-compare2.mts` 的"嵌套根样例"复现了同一机制：`src/packages/a.ts` 旧口径切出
`packages/a.ts`、新口径切出 `src/packages/a.ts`）。旧口径也有这个性质，但 `/src/` 是嵌套路径里最常见的片段，
**扩根把暴露面显著放大了**——后果见 ⑥.2。

### 2.3 真实数据读数（样本 = `~/.dsh/reqboard/requirements/*/plan.json` 的 `tasks[]`）

```
$ npx tsx /tmp/rev-readings.mts
{ "planJsonCount": 68, "tasksAll": 515, "srcCards": 251,
  "oldExtractable": 142, "newExtractable": 250, "oldRate": 56.6, "newRate": 99.6,
  "zeroOld": 165, "zeroNew": 331, "confOld": 8, "confNew": 57, "newHitCount": 49,
  "stillNotExtractable": 1, ... }
```

| 指标 | 证据文件写的 | **我跑到的** | 判定 |
|---|---|---|---|
| 有 `plan.json` 的需求份数 | 67 | **68** | 数据在长（并发窗口持续落库），非错误 |
| 任务卡总数 | 508 | **515** | 同上 |
| 含 `src/` 的卡 | 246 | **251** | 同上 |
| 可抽取（旧口径） | 137（55.7%） | **142（56.6%）** | 同上；**抽不到的绝对数两轮都是 109** |
| 可抽取（新口径） | 245（99.6%） | **250（99.6%）** | 一致（比例完全相同） |
| 零交集建议（改前） | 178 | **165**（忠实旧口径）/ 184（抹除近似） | **口径不一致，见 2.4** |
| 零交集建议（改后） | 326 | **331** | 数据在长 |
| 冲突门命中（改前 / 改后） | 8 / 57 | **8 / 57** | **完全一致** |
| 冲突门新命中 | 49 | **49** | **完全一致** |
| 仍未抽出的含 src 卡 | 1 | **1** | **完全一致** |

⇒ 除"零交集（改前）"一格外，**证据的结论方向与量级全部复现**；`8 → 57`、`新命中 49`、`余下 1 条`
三个最关键的数逐字一致。差异全部可归因于**数据快照在长**（65→68 份、508→515 卡）。

### 2.4 ⚠️ 差异点名：「改前」零交集那一格的口径与它自己声明的不符

证据 `real-data-readings.md:8` 声明「「改前」= 用**旧口径正则**（四根、无 `mts`）在同一批文本上**重算**」，
但同一文件 §7 的脚本（`:146-148`）对零交集一行用的是**抹掉 `src/` 前缀 + 调用现在的实现**——
现在的实现里 **`.mts` 仍然可见**，所以那一格实际是「四根 + **有** `.mts`」，不是"旧口径"。

```
$ npx tsx /tmp/rev-method-diff.mts
 zeroOverlap: { A_eraseSrcPrefix: 184, B_oldExtractor: 165, new: 331 }
 conflicts:   { A_eraseSrcPrefix: 8, B_stripWholeSrcPath: 8, new: 57 }

$ npx tsx /tmp/rev-mts-hypothesis.mts
旧口径（四根 + 无 mts）零交集边 = 165
四根 + 有 mts（只补扩展名、不扩根）零交集边 = 184      ← 与"抹除近似"的 184 完全相等
两者差集条数 = 19
```

⇒ **184（证据当时 178）这一列等于「四根 + 有 mts」**，其中有 19 条边**纯粹由 `.mts` 可见性带来**
（例：`scripts/kb-build.mts`、`scripts/archive-reconcile-drill.mts`、`scripts/template-gate-probe.mts`）——
这些边在真实的"改前"世界里**不可能存在**。忠实复算的"改前"是 **165**。

影响方向：证据把"改前"抬高（178/184 而非 165），因此**低估**了修复幅度（真实是 165→331 = 2.0×，
而非 178→326 = 1.8×）。结论（"改前大面积不触发"）不受影响，反而更强；但该格**无法按声明的口径复跑**，
且证据 `:104-105` 自称"改前读数是下界口径的重算值"——对零交集这一格方向恰好相反（是**上界**），
这属于自述不实，见 ④ 偏离 D-c。

### 2.5 顺手补齐证据没做的贡献拆分

```
$ npx tsx /tmp/rev-split.mts
 extractable: { 四根无mts: 142, 四根加mts: 143, 五根加mts: 250 }   → mts +1 / src 根 +107
 conflicts:   { 四根无mts:   8, 四根加mts:   8, 五根加mts:  57 }   → mts +0 / src 根 +49
 zeroOverlap: { 四根无mts: 165, 四根加mts: 184, 五根加mts: 331 }   → mts +19 / src 根 +147
```

⇒ 在**判据的真实输入**上，`.mts` 的贡献是"1 张卡 / 0 条冲突 / 19 条零交集边"，`src` 根是主力。
证据三份文件都没有做这个拆分，`requirement.md:19-20` 的 TL;DR 又用 81% 概括本需求——
**81% 来自 `docs/requirements/*/decomposition.md` 语料，不是判据真实输入（`plan.json`）上的数**：
真实输入上"改前抽不到"的比例是 **43.4%（109/251）**，不是 81%。两者都足以支撑"大面积空转"的结论，
但把 81% 说成"真实数据"上是口径混用（见 ④ 偏离 D-b 附注）。

### 2.6 上一轮评审的原始语料，我自己复算一遍

```
$ npx tsx /tmp/rev-decomp-corpus.mts
{ "decompositionFiles": 81, "tableRows": 2942, "rowsWithSrc": 542,
  "oldExtractable": 65, "newExtractable": 526,
  "oldRatePct": 12, "newRatePct": 97, "stillNotExtractable": 16 }
```

⇒ 原评审 `REQ-261006211623-9dc1/reviews/independent-review.md:314` 写的是"含 src/ 的行 **530** 条、
抽不到 429 条（81%）、能抽到 101 条"。我复算同语料现在是 **542** 行（数据在长），改前可抽 65（12%）、
改后 526（97%）。⇒ **语料同源、结论同向（甚至更差：12% < 19%）**，原评审那一段成立；
`real-data-readings.md:89` 把这份语料说成"未标注语料"是**事实错误**（见 ④ 偏离 D-b）。

---

## ③ 反例 / 双向核验记录

### 3.1 ★ 最关键一问：`tests/doc-gate-e2e.test.ts` 的 fixture 改动是"适配更严的门"还是"为了让门通过而削弱测试"？

**裁定：合法（属于测试适配更严的门），不是削弱测试。** 四条依据，全部我自己跑出来：

**依据 1 — 改动只碰 fixture 数据，一个断言都没动。**

```
$ git diff -- tests/doc-gate-e2e.test.ts
-  acceptance: 'npx vitest run tests/x.test.ts 通过', implementation: '改 src/x.ts',
+  acceptance: 'npx vitest run tests/x.test.ts 通过',
+  implementation: '改 src/' + key + '.ts',
```

`tests/doc-gate-e2e.test.ts:57-64` 只改 `planTask` 的 `implementation`；三个 `describe` 与全部 `expect` 均未变
（`git diff` 无其它 hunk）。

**依据 2 — 我亲手把 fixture 改回"两卡共用 `src/x.ts`"，看它到底为什么红、红在哪。**

```
$ cp tests/doc-gate-e2e.test.ts /tmp/doc-gate-e2e.test.ts.orig   # sha256 8342f169…
$ python3 … 把 '改 src/' + key + '.ts' 改回 '改 src/x.ts'
$ npx vitest run tests/doc-gate-e2e.test.ts
 × 违规：只覆盖 FR-1、漏 FR-4 → **拆分被拦**且点出 FR-4
   → expected [Function] to throw error matching /FR-4/ but got
     'reqboard_decompose 未执行：互无依赖的任务卡声明了同一文件…src/x.ts（T-1 / T-2）…（REQBOARD_FILE_CONFLICT）'
 × 补卡：给 T-2 补上 FR-4 → **拆分通过**并落库   → 同上被 REQBOARD_FILE_CONFLICT 拦下
 Tests  2 failed | 6 passed (8)
$ cp /tmp/doc-gate-e2e.test.ts.orig tests/doc-gate-e2e.test.ts && shasum -a 256 …   # 8342f169… ← 与改前逐字节一致
```

⇒ 旧 fixture 下**恰好 2 条红**（与证据 `t1-t2-…:39-42` 所述一致），且红的**根因是冲突门抢答**：
条款覆盖断言 `/FR-4/` **根本没被执行到**。即"这个用例本来测什么"在旧 fixture 下**没有被测到**——
fixture 是坏的，不是门太严。

**依据 3 — 改后仍测得到它本来要测的东西（正反两向都在）。**
该用例的断言是 `rejects.toThrow(/FR-4/)`（`tests/doc-gate-e2e.test.ts:85-86`）。改后该用例**通过**
⇒ 它确实抛出了含 `FR-4` 的错误 ⇒ 拦下它的是条款覆盖门，而不是别的门。同理"补卡 → 通过"
（另加 `expect(out.success).toBe(true)` 与落库 2 张卡的终态断言）也通过。**被测对象仍然活着。**

**依据 4 — 门序是既有事实，处置方向正确。**
`src/application/use-cases/Decompose.ts:193`（冲突门）先于 `:210`（`assertClauseCoverageGate`）。
我核了三条其它处置路线并逐条排除：

| 候选处置 | 为什么没选 / 是否可行 |
|---|---|
| 调换两道门的顺序（`:193` ↔ `:210`） | **救不了**："补卡 → 通过"那条用例的表里两卡仍共用文件，无论谁先都会拒 |
| 给 seeded plan 的 T-2 加 `dependsOn: ['T-1']` | 可行但会改到 E2E② 共用的 `seededReq`（`:66-79`）→ 风险外溢到另外 4 条用例 |
| 把 fixture 换成无根路径（`改 x.ts`） | 与所选方案等价，但会丢掉"落点长在 `src/`"的真实形态 |
| **改 fixture 让每卡改不同文件（所选）** | 最小改动、零断言变化、保留 `src` 落点形态 |

**依据 5（反方向的自查）— 有没有"为了让门通过而削弱判据"？** 没有：`git diff -- src/application/internal/conflict-check.ts`
只有 `PATH_RE` 一行（根加 `src`、扩展名加 `mts`），**冲突门语义、`ancestorsOf` 传递闭包、拒绝码都没动**
（见 3.2 的证伪试验：正则一还原，用例立刻红 → 门是活的，不是被放宽后才绿）。

### 3.2 判据是否可能空转：我自己跑的反例（红-绿闭环）

**反例 A（把口径还原成改前）——证明新用例不是恒绿的摆设：**

```
$ cp src/application/internal/conflict-check.ts /tmp/conflict-check.ts.orig   # sha256 4aa0c7f3…
$ python3 … 把 PATH_RE 的根改回四根、扩展名去掉 mts
$ npx vitest run tests/path-extraction-scope.test.ts tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts
 × TC-1：src 落点抽得出          × TC-2：.mts 扩展名抽得出
 × 去重：同一文件写两次只出一条    × 证伪锚：抽取器不查盘
 × src 落点也在冲突门视线内       × 端到端：两卡声明同一 src 文件…被拒 REQBOARD_FILE_CONFLICT
 × src 落点同样参与零交集判定
 Test Files 3 failed (3)   Tests 7 failed | 19 passed (26)
$ cp /tmp/conflict-check.ts.orig src/application/internal/conflict-check.ts && shasum -a 256 …  # 4aa0c7f3… ← 逐字节一致
$ npx vitest run 四个文件 → Test Files 4 passed (4) · Tests 34 passed (34)
```

⇒ 为什么"真会让它红"：这三条新用例断言的正是**旧口径下的返回值**（旧口径 `declaredFiles('改 src/…')` = `[]`，
冲突门返回 0 条，零交集建议返回空）。只要口径回退，断言就与事实不符 → 必红。红-绿-红闭环由我亲手跑通，
**不是抄证据里的"4 例失败 / 3 条新用例红"**（我跑到的分布恰好是 path-extraction-scope 4 条 + 另两文件 3 条，
与证据 `t1-t2-…:34-35` 的记述一致）。

**反例 B（真实数据方向）——扩根前判据到底有多瞎：**

```
旧口径下：251 张含 src 卡里 109 张一条路径都抽不到（43.4%）；
         537 条依赖边里只有 185 条真正参与判定（34.4%），352 条"看都不看"；
新口径下：只剩 1 张抽不到（0.4%）；386 条参与判定（71.9%），151 条不判。
$ npx tsx /tmp/rev-readings.mts ; npx tsx /tmp/rev-blind.mts ; npx tsx /tmp/rev-blind-old.mts
```

⇒ 这不是"理论上可能空转"，是**实测 34.4% 的边被跳过**。

**反例 C（残余空转仍存在，别当成零）——扩根后判据仍会沉默的形态：**
`src/application/internal/plan-deps-check.ts:94`：上游没声明路径 → 直接 `continue`（不判）。
现存 537 条边里 **151 条（28.1%）**落在这个豁免里（85 条两端都没路径 + 66 条只有一端有）。
⇒ 扩根修的是"有路径却看不见"，没修（也不该在本需求修）"根本没写路径"。这是设计承认的诚实边界
（`design/architecture.md:83-84`），但 28% 是**常态规模**，值得让验收人知道，而不是当边角。

### 3.3 抽查 5 条冲突新命中（我自己从脚本结果里挑，逐条打开两端原文）

```
$ npx tsx /tmp/rev-spotcheck.mts
=== 全量 49 条：两端 implementation 原文都字面点名该文件 = 49 / 49（例外 0 条）
```

机械判据（"两端原文都点名该文件"）**49/49 成立**，与证据 `real-data-readings.md:43` 一致。但**"点名"≠"要改"**，
下面两条例外要单独说：

| # | 需求 / 两卡 / 共同文件 | 两端原文 | 我的判断 |
|---|---|---|---|
| 1 | `REQ-261005155003-f32f` t4×t5 `src/client/styles/report.ts` | t4「**改** `src/client/styles/report.ts`：新增 --pm-focus-ring-w…」；t5「**改** `src/client/styles/report.ts`：.dsh-pm-window…改为命中区 ≥24 高」 | **真命中**：两端都明确要改同一文件（同文件不同规则，属"文件级"真冲突） |
| 2 | 同上 t4×t6 `src/client/styles/report.ts` | t6「**改** `src/client/styles/report.ts`：① 详情页根上定义 --pm-dur-fast…」 | **真命中**（同上，"33 条同一文件"这一簇整体站得住） |
| 3 | `REQ-261003215944-9e04` t6×t10 `src/application/internal/support.ts` | t6「…同步改 … `src/application/internal/support.ts` 的写入端折叠逻辑（support.ts:611）」；t10「把六处直写改为调 applyDiveTransition… `src/application/internal/support.ts:629`（arm）…」 | **真命中**：两端都要改该文件（t10 更是一整串同文件锚点） |
| 4 | `REQ-261005213603-eaed` t1×t4 `src/domain/limits.ts` | t1「**阈值只引用** `src/domain/limits.ts` 的 advanceLockStaleMs，**不复制字面量**」；t4（纯文档卡）「改 `docs/architecture/client-running-indicator.md`…附判据表达式与**阈值出处** `src/domain/limits.ts` 的 advanceLockStaleMs」 | ⚠️ **过严的假红**：两端**都只是只读引用**，没有任何一端要改这个文件；t4 的其余落点全在 `docs/` 下 |
| 5 | `REQ-261005105032-3b02` t8×t22 `src/rtm/validator.ts` | t8「改 `vendor/reqboard/src/rtm/validator.ts`：编号白名单认原型锚点前缀…」；t22「② 断言 `vendor/reqboard/src/rtm/validator.ts` 对缺 prototypes/decisions 节…读出 pending」 | ⚠️ **裁决对、报出的路径错**：真实文件是 `vendor/reqboard/src/rtm/validator.ts`，`src/rtm/validator.ts` **在本仓不存在**（`ls` 验证），是正则切出来的后缀 |

```
$ ls -d vendor/reqboard/src/rtm/validator.ts src/rtm/validator.ts
vendor/reqboard/src/rtm/validator.ts          ← 存在
ls: src/rtm/validator.ts: No such file or directory   ← 报出来的那个不存在
$ npx tsx /tmp/rev-suffix.mts
49 条新命中中，至少一端把该文件写成"更长路径的后缀"（被截断）= 1
$ npx tsx /tmp/rev-fp-class.mts
49 条中"至少一端是纯文档卡（其余落点全在 docs/）"的命中 = 2，其中该文件出现在引用语境里 = 1
```

⇒ "文件级真命中"这个结论**站得住（49/49 抽取无误吃散文）**，但证据 `:46` 的推论
"⇒ 49 条全部是文件级真命中，没有一条是假红"**说过头了**：至少第 4 条是**只读引用被当成写冲突**
（真会触发硬拒 `REQBOARD_FILE_CONFLICT`），第 5 条的错误消息会点名一个**不存在的路径**。

---

## ④ 偏离清单（点名 `文件:行` + 证据）

| 编号 | 偏离 | 证据 | 严重度 |
|---|---|---|---|
| **D-a** | 「`declaredFiles` 是**全仓唯一**路径抽取器」与实际不符，且与本需求自己在设计里做的口径澄清**互相矛盾**。实际：`grep -rn "export function declaredFiles" src/` → 2 处定义（`conflict-check.ts:31` + `Footprint.ts:167` 的 `declaredFilesFloorFrom`），另有两套 `PROTOTYPE_PATH_RE`（`prototype-gates.ts:247`、`plan-prototype-refs.ts:43`）。仍写"全仓唯一"的地方：`requirement.md:62`、`requirement.md:75`、**`src/application/internal/conflict-check.ts:26`（本需求自己改的文件里的注释）**、**`tests/path-extraction-scope.test.ts:4`（本需求新建文件里的注释）**。设计侧已改为"冲突族唯一"（`design/architecture.md:9-14`、`design/interfaces.md:5-7`），说明书已改为"冲突族判据的唯一取数口"（`docs/architecture/project-manual.md:1724`）。 | `grep -rn "export function declaredFiles" src/`；`grep -rn "PATH_RE\s*=" src/` | 中（认知不一致；"唯一"被 grep 当场证伪，是本仓反复踩过的"两份真相"型问题） |
| **D-b** | 证据把上一轮评审的语料说成"未标注语料"。实际原评审写得很清楚：`REQ-261006211623-9dc1/reviews/independent-review.md:314`「真实语料代理量（`docs/requirements/*/decomposition.md` 任务表行）」。我复算该语料 = **542** 行（同源，数据在长）。 | `real-data-readings.md:89` vs 原评审 `:314`；`/tmp/rev-decomp-corpus.mts` | 低（§5 的结论"两者语料不同，不是矛盾"方向正确；错的是"未标注"这个描述） |
| **D-b′** | 同一张表的"规模参照"列与 `requirement.md:19-20` 的 TL;DR 混用了语料：TL;DR 说"**在真实数据上** 81% 的落点一条都抽不到"，但 81% 出自 `decomposition.md` 语料；判据**真实输入**（`plan.json`）上的改前比例是 **43.4%（109/251）**。 | `requirement.md:19-20`；`/tmp/rev-readings.mts` | 低（结论不变：43% 与 88% 都支撑"大面积空转"） |
| **D-c** | 「改前」零交集一列（`178`，现为 `184`）**不是** `real-data-readings.md:8` 声明的"旧口径（四根、无 mts）重算"，而是"四根 + **有** mts"；§7 脚本 `:146-148` 用的是"抹 `src/` 前缀 + 现实现"，故 `.mts` 仍可见（19 条边由此凭空出现）。忠实复算 = **165**。同处 `:104-105` 自称"改前读数是**下界**口径"，对该格方向**恰好相反**（是上界）。 | `real-data-readings.md:8,104-105,146-148`；`/tmp/rev-method-diff.mts`、`/tmp/rev-mts-hypothesis.mts`（184 == "四根+mts"） | **中**（读数不可按声明复跑；失真方向=低估修复幅度，未污染"冲突 8→57"与"抽取 137→245"两行） |
| **D-d** | 新用例文件的注释指向**不存在**的文档：`path-extraction-scope.test.ts:8`「与 `tests/interfaces.md` §1.2 的样例表一一对应」。样例表实际在 `design/interfaces.md:39`（§1.2 输入输出样例）；`tests/interfaces.md` 不存在。 | `ls tests/interfaces.md` → No such file | 低 |
| **D-e** | `tests/readings.mts` 已**落进仓库**，但其首行注释仍写"仓库外脚本，**不落仓库**"；`design/architecture.md:60-62` 与 `design/test-cases.md:76` 也承诺"不新增仓库脚本"。内容本身是好事（证据自包含、可复跑），矛盾在自述。 | `tests/readings.mts:2`；`design/architecture.md:60-62` | 低（不算违规资产：未进 `scripts/`，无需 `EXCLUDED` 登记） |
| **D-f** | `design/test-cases.md:68` 要求跑 `npx tsx scripts/req-doc-validate.mts --req …` → **缺口 0**；三份证据文件**都没有记录这一步**。我独立复跑：**exit 1，缺口 1**（`accepting` 态缺 `rtm-accepting.yml`）。同类缺口在 66 份需求里占 15 份，且很可能由 `accepting` 转换时生成，**非本次源码改动引入**。 | `npx tsx scripts/req-doc-validate.mts --req REQ-261007095750-9f48`（第 6 项 FAIL） | 低（工程性缺件，不阻塞结论；但"缺口 0"这句话在证据里没有落点） |
| **D-g** | 证据 `:46` 的结论强度超出其判据："两端原文都点名该文件"**只能证明抽取无误吃散文**，不能证明"没有假红"——至少 1 条（`src/domain/limits.ts`）两端都是只读引用。 | `real-data-readings.md:40-46`；`/tmp/rev-spotcheck.mts`、`/tmp/rev-fp-class.mts` | 中（是 ⑥.1 那个产品问题的直接证据） |

**未发现偏离的地方（显式记录）**：
- 正则口径在源码与设计之间**逐字符一致**（我把 `conflict-check.ts:28` 与 `design/interfaces.md:28` 做字符串比较 → `True`），
  满足 `design/interfaces.md:3-4`「别处只引用，不重述」的单源要求。
- `sides: []` 声明与实际一致（无 UI 卡、无原型对照项）。
- 脚手架骨架原型已按 `tests/scaffolding-skeleton-note.md` §3 删除（我复核：`prototypes/` 目录**已不存在**），
  该 note 的自述属实；其 §4 报出的"创建路径无条件生成骨架原型"是**另立需求**的建议，不在本需求范围。
- `pnpm build` 的产物包含本次修复（见 ⑥.5）。

---

## ⑤ D-1…D-3 逐条裁定

| 编号 | 裁定 | 依据（我自己跑的 / 文件:行） |
|---|---|---|
| **D-1**（只扩一处口径；两处共用；不做两套） | **已兑现** | ① `grep -rn "export function declaredFiles" src/` → 定义只有 `conflict-check.ts:31`（`Footprint.ts:167` 是另一个函数名 `declaredFilesFloorFrom`，不属冲突族）；② 两个消费者共用：`conflict-check.ts:61`（冲突门）与 `plan-deps-check.ts:15,85`（零交集建议，import 而非自建正则）；③ `git diff -- src/application/internal/conflict-check.ts` 只有 `PATH_RE` 一行；④ `npx vitest run tests/concurrency-limits.test.ts` → 10 passed。**限定语**：措辞"唯一取数口"需按 `design/architecture.md:9` 的"冲突族"理解；`requirement.md:62,75` 与两处注释仍写"全仓唯一"，见偏离 D-a。 |
| **D-2**（单独立项；feature / expert；已归档需求不动） | **已兑现** | ① 台账 `~/.dsh/reqboard/requirements/REQ-261007095750-9f48/record.json`：`id=REQ-261007095750-9f48`、`category=feature`、`promptDifficulty=expert`、`status=accepting`；② `REQ-261006211623-9dc1/record.json` 仍为 `status=archived`；③ 该归档需求目录**最后写入时间 2026-10-07T09:53:55**（`verification.md`），早于本需求创建时间（ID 内嵌 09:57:50）⇒ 本次未触碰（`find … -exec stat` 全目录排序）。 |
| **D-3**（升格为待修缺陷 + 修复后附扩根前后真实读数） | **已兑现，但读数口径需更正** | 兑现面：`tests/real-data-readings.md` 确有扩根前/后两列，三项指标（可抽取比例 / 零交集 / 冲突门）都在；我独立复现了 **冲突 8→57、新命中 49、余下 1 条**三个关键数**逐字一致**。需更正面：零交集"改前"一格（`178`）口径与声明不符（偏离 D-c，忠实值 165），且 §5 对原语料的描述有误（偏离 D-b）。**升格**本身成立：`docs/architecture/doc-quality-gates.md:79` 已把该行从"未修边界"改写为"已覆盖（REQ-261007095750-9f48）+ 判据入口"，`:80` 新增"文件级判据"代价行。 |

---

## ⑥ 风险与边界（逐条可复核）

### 6.1 ① 冲突门是文件级判据，命中 8→57：是"修好了"还是"过严"？

**我的判定：主要成分是"修好了"，但已证实至少 1 条属于"过严"，且过严是口径的必然产物，不是偶然。**

- "修好了"的一面：57 条中 **33 条集中在 `src/client/styles/report.ts`、4 条在 `src/index.ts`**，
  我抽查的 report.ts 三条（t4/t5/t6）两端**都明确写"改"该文件**（③.3 表 1、2）。这类"同文件不同规则/不同注册行"
  在多窗口并行改同一工作树时**确实会互相覆盖**，旧口径下它们一条都看不见——**沉默通过**才是真风险。
- "过严"的一面（已证实）：`src/domain/limits.ts` 那条两端**都只是只读引用**（"阈值**只引用**…不复制字面量"、
  "阈值**出处**"），却被判为硬冲突。这正是设计自己预告过的误报类型（`design/test-cases.md:57-58`
  "同一文件被两卡以'只读引用'方式提到——当前正则无法区分读写"），但**证据没有做这个方向的核实**
  （`real-data-readings.md:40-46` 只做了"两端是否点名"的机械核对），因此证据 `:46` 的"没有一条假红"**不成立**。
- 量级：至少 1/49（我的分类口径：2 条含纯文档卡端，其中 1 条明确是引用语境）。
  ⇒ 结论：**"修好了"成立，"零误报"不成立**；待决问题（① 保持严格 / ② 降级为建议 / ③ 区域级口径）
  已在 `real-data-readings.md:76-78` 与 `doc-quality-gates.md:80` 如实登记，交验收人裁定——这一点处置得当。

### 6.2 ② `src/domain/task/Footprint.ts:84` 的另一套 `PATH_RE` 是否构成新的同类盲区？

**判定：是同类盲区，且是本需求**新暴露**出来的——但它被如实登记为待办，本次不改的处置可以接受；真正没被登记的是另一个后果。**

- 事实：`Footprint.ts:84` = `/(?<![A-Za-z0-9._-])(?:src|tests|docs|scripts)\/[A-Za-z0-9._/-]+/gi`——**含 `src`、不含 `packages`**，
  无扩展名要求，服务"体量下限"（`Footprint.ts:167` `declaredFilesFloorFrom`），是**下界**不是判据。
  一个只写 `packages/**` 的 implementation 会让下限 = 0，从而"声明缩水"骗过容量门禁。
- 处置评价：`design/architecture.md:11-14`、`design/interfaces.md:5-7`、`docs/architecture/project-manual.md:1724` 三处都做了口径澄清
  并把这个缺口登记为待办 ⇒ **披露充分、边界诚实**（本需求"不新增第二套口径"的不变量没被破坏：这是既有第三类消费者，不是本次新建）。
  遗留风险：**没有任何证据文件把"packages 缺口"的规模量化**（有多少张卡的 implementation 只写 `packages/**`）。
- **然而**：本需求给冲突族加了 `src` 根、却没加左边界断言，于是**引入了一个新的、未被登记的同类后果**：
  `vendor/reqboard/src/rtm/validator.ts` 被切成 `src/rtm/validator.ts`（`ls` 证明该路径不存在）。
  更值得注意的是**跨目录碰撞面**：本仓同时存在 `src/index.ts` 与 `vendor/reqboard/src/index.ts`、
  `src/stage-overview/assembler.ts` 与 `vendor/reqboard/src/stage-overview/assembler.ts`——
  一个窗口写 `src/index.ts`、另一个写 `vendor/reqboard/src/index.ts` 时，两者会被抽成**同一个 key**
  `src/index.ts` → **硬拒一个本不存在的冲突**，且错误消息点名的是**本仓真实存在的那个文件**（会把人指错方向）。
  （核查：`/tmp/rev-newhits.json` 里当前 4 条 `src/index.ts` 命中**都不是**这个形态，故这是**潜伏面**而非已发生。）
  ⇒ 建议（不阻塞本次）：要么给 `PATH_RE` 补上 `(?<![A-Za-z0-9._-])`，要么把 `vendor/` 纳入口径；两条都要重新立项。

### 6.3 ③ 需求/设计里对"唯一取数口"的表述是否准确？

**判定：设计侧准确，需求侧与两处代码注释不准确（见偏离 D-a）。**

- 准确：`design/architecture.md:9`「`declaredFiles` 是**冲突族判据的唯一**路径抽取器」+ `:11-14` 的口径澄清块
  + `design/interfaces.md:5-7` 同样澄清 + `project-manual.md:1724`「冲突族判据的唯一取数口」——与实际一致
  （定义一处、两消费者共用，`grep` 可验）。
- 不准确（四处）：
  1. `requirement.md:75`「`declaredFiles` 是**全仓唯一**抽取器（`grep` 可验）」——`grep` 反而证伪它；
  2. `requirement.md:62`「`declaredFiles` 仍是**唯一**抽取器」；
  3. `src/application/internal/conflict-check.ts:26`「declaredFiles 是**全仓唯一**抽取器」（**本需求改的文件**）；
  4. `tests/path-extraction-scope.test.ts:4`「`declaredFiles` 是全仓**唯一**的路径抽取器」（**本需求新建的文件**）。
  ⇒ 这四处与设计**互相说谎**，正是本仓纪律最忌讳的形态（`design/architecture.md:92`）。修法很低成本：
  把四处改成"冲突族唯一"，或把"全仓唯一"改成"全仓唯一的**冲突族**抽取器"。
  （注：`requirement.md` 是已确认产物，重写需 `change_note`；至少注释与新建用例文件应改。）

### 6.4 ④ 是否可回溯影响存量计划？

**判定：默认路径**不可回溯**（已核验）；但有一条窄路径会重新判定存量计划。**

- 主路径不回溯：冲突门只在 `Decompose.ts:193` 被调用，即**新提交拆分**时；既有已落库计划不会被重新判定。
  且 `Decompose.ts:81-88` 的**幂等守卫（已有未取消任务 → 拒）先于**冲突门执行 ⇒ 重复提交老计划会在更早的门口被拒
  （码不是 `REQBOARD_FILE_CONFLICT`），不会被新口径"补判"。⇒ `design/architecture.md:70` 与
  `real-data-readings.md:70` 的"只对新提交生效"成立。
- **窄路径会重判**：`Decompose.ts:83-85` 的 `rollbackTo`（回退到当前阶段）会**绕过幂等守卫**，
  于是同一张老任务表会再次进入 `findWorkSurfaceConflicts`。⇒ 任何因回退重拆（`reqboard_move` 回退后再 `decompose`）的
  存量需求，会被新口径按 **57 条命中**里的对应条数重新拦住。这条路径**没有任何证据文件提到**，
  也没有写进 `doc-quality-gates.md:80` 的"不回溯"说明里。
- 另：`real-data-readings.md:70` 说"以上 57 条全部落在已经落库/已完成的历史计划上"——这与我的读数一致
  （57 条都在 `plan.json` 的存量数据上），但它同时意味着**这 7 份需求若走回退重拆就会被拒**，
  建议在待决问题里补一句。

### 6.5 ⑤ 其它边界（构建 / 宿主 / 客户端）

- **构建产物含本次修复**（任务书允许的降级核验：时间戳 + 产物内容）：
  `dist/index.mjs` mtime 10:10:48、`lib/client.js` 10:10:50，**晚于**本次测试/源码改动的原始时间（测试 10:03:33 / 10:06:24；
  源码哈希 `4aa0c7f3…` 在 10:10 前已定稿——该文件 mtime 现为 10:16:30，是我按字节还原时被 `cp` 更新的，内容哈希未变）。
  更硬的一条（与 mtime 无关）：`grep -c "(?:src|packages|scripts|tests|docs)" dist/index.mjs` = **1**，
  `grep -c "(?:packages|scripts|tests|docs)" dist/index.mjs` = **0** ⇒ 产物里就是新口径，Old 口径在产物中已不存在。
  `lib/client.js` 里 0 命中（客户端不打包该判据，与"本需求不改客户端"一致）。
  注意：本仓**没有 `lib/main`**（`package.json` 的 `main` = `./dist/index.mjs`；`lib/` 下只有 `client.*`），
  任务书里说的"`lib/main` 产物"在本仓不存在，我按实际产物核的。
- **未复核项（如实声明）**：我没有重跑 `pnpm build`（改用上述产物核验），也**没有**重跑全量
  `npx vitest run --reporter=json` 与 `docs/reviews/test-baseline.failures.txt` 的集合差 ⇒
  证据 `t4-…:39-43` 的"失败 70 / 基线 68 / 新增 11 条全部落在并发窗口在制面"这一条，**我不背书也不否认**（未复核）。
- **宿主是否已加载新版不可核验**（与上一轮评审 `independent-review.md:305-307` 的 R1 同型）：
  修复已在**发布产物** `dist/index.mjs` 里（可验），但"运行中的宿主进程是否已重载该产物"在我的可见范围内**不可核验**。
  后果：`REQBOARD_FILE_CONFLICT` 与 `dependency_warnings` 这两条判据，本需求**全部证据都停留在单测/脚本层**，
  没有任何一条"真实会话里的提交被拦 / 被点名"的读数。这是本次验收最该被记住的一条残余风险。
- **未纳入的同类资产**：`prototype-gates.ts:247` 与 `plan-prototype-refs.ts:43` 是**两份逐字相同的** `PROTOTYPE_PATH_RE`
  （同型"两份真相"味道）。本需求范围外，未改动，仅登记。

---

## ⑦ 结论

# **有条件通过**

本需求的**核心主张成立且经我独立复现**：`PATH_RE` 扩根 + 补 `.mts` 让两处判据第一次真正看见 `src/`
（含 src 卡可抽取率 56.6% → 99.6%；参与判定的依赖边 185 → 386；冲突门 8 → 57、新命中 49 与证据逐字一致），
红-绿-红闭环我亲手跑通（口径还原 → 7 条用例红；还原回 → 34 passed），
测试 fixture 的改动是**合法适配**而非削弱（我把它改回去，实测恰好 2 条红且根因是冲突门抢答）。

阻塞项：**0 条**。以下是放行条件（全部是"补齐/更正"型，不需要改判据语义或回退正则）：

| # | 条件 | 对应偏离 | 为什么必须 |
|---|---|---|---|
| **C1** | 更正 `tests/real-data-readings.md` 的「改前」零交集读数：改为忠实旧口径的 **165**（或明确标注该列实为"四根 + 有 `.mts`"，并说明 `.mts` 单独贡献 19 条边）；同时修正 `:104-105` "下界口径"的方向描述。 | D-c | 读数必须能按声明的口径复跑；当前一列口径不实，且失真方向被写反 |
| **C2** | 撤回/收窄 `real-data-readings.md:46` 的"49 条全部是文件级真命中、没有一条假红"：至少注明"`两端点名 ≠ 两端都要改`"，并点名 `REQ-261005213603-eaed t1×t4 src/domain/limits.ts` 这条**只读引用被当成硬冲突**（这条同时刷新 `doc-quality-gates.md:80` 与 `project-manual.md:1736` 的"49/49 机械核实"表述）。 | D-g、6.1 | 结论强度超出判据能证明的范围；且这正是待决产品问题（区域级口径）的关键证据 |
| **C3** | 把"**全仓唯一**抽取器"四处改为"**冲突族**唯一"（`requirement.md:62,75`；`src/application/internal/conflict-check.ts:26`；`tests/path-extraction-scope.test.ts:4`）。 | D-a | `grep` 当场证伪，且与本需求自己的设计澄清冲突（文档与实现不许互相说谎） |
| **C4** | 在边界/文档里补登记两条：(a) `PATH_RE` 无左边界断言 ⇒ `vendor/reqboard/src/**` 被截成 `src/**`，与真实 `src/index.ts`、`src/stage-overview/assembler.ts` 存在**跨目录碰撞面**（当前 49 条里 1 条已报出不存在的路径）；(b) 回退重拆（`Decompose.ts:83-85` 的 `rollbackTo`）会让存量计划重新进入冲突门 ⇒ "不回溯"要加限定。 | 6.2、6.4 | 二者都是本次口径变更**新引入/新暴露**的边界，目前零登记 |

建议（不阻塞）：`tests/interfaces.md` 这个悬空引用改指 `design/interfaces.md:39`（D-d）；
`tests/readings.mts:2` 的"不落仓库"注释与实际不符（D-e）；`req-doc-validate` 的第 6 项缺口
（缺 `rtm-accepting.yml`，很可能是 `accepting` 转换生成）在验收时补一次或在证据里留一行（D-f）。

**给验收人的一句话**：这个需求把"单测全绿但真实数据不说话"这个病治住了，治得很干净；
剩下的问题不是"没修好"，而是"修好之后暴露出来的两个新边界（文件级判据的只读引用误报、`/src/` 后缀截断）
没有被如实登记到证据与文档里"——C1–C4 补上，就是一个可归档的结果。

---

## 附：只新增一个文件的自证

```
$ git status --short docs/requirements/REQ-261007095750-9f48/
?? docs/requirements/REQ-261007095750-9f48/
```

说明：整个需求目录在 git 里是 **untracked**（`??` 是目录级标记，不是单个文件），
因此上面这行**在该目录内不区分文件**。为把"只新增 `reviews/independent-review.md`"证到位，另附目录级对照：

```
$ ls docs/requirements/REQ-261007095750-9f48/
decomposition.md  design  queue.json  requirement.md  reviews  rtm-brainstorming.yml
rtm-decomposing.yml  rtm-design.yml  rtm-implementing  rtm-implementing.yml  rtm-lifecycle.yml
tasks  tests
                  ^^^^^^^ ← 本次复核唯一新增的目录（复核开始时尚不存在，见 ①.3）

$ ls docs/requirements/REQ-261007095750-9f48/reviews/
independent-review.md          ← 本次唯一新增的文件
```

旁证：复核窗口内被写过的仓库文件里，我经手的只有上面这一个（其余是并发的另一条需求
`REQ-261007100513-6749` 与本需求实现者的写入）：

```
$ find . -type f -newermt '2026-10-07 10:00:00' -not -path './node_modules/*' -not -path './.git/*'
./tests/plan-depends-e2e.test.ts   ./tests/path-extraction-scope.test.ts   ./tests/doc-gate-e2e.test.ts
./tests/concurrency-limits.test.ts ./tests/verify-panel.test.ts            ./tests/query-verify.test.ts
./docs/requirements/REQ-261007100513-6749/**      ← 另一条需求（并发窗口，本需求无关）
./docs/requirements/REQ-261007095750-9f48/**      ← 本需求（实现者写入 + 我新增 reviews/）
```

两次「临时改 + 按字节还原」的自证（这是本次唯一被允许的写操作）：

```
$ shasum -a 256 src/application/internal/conflict-check.ts
4aa0c7f3cbe93aaa83349dd07037b23f1c7acefcc0ec56e7569dc6d9814eedb3   ← 证伪试验前 = 试验后（同一哈希）
$ shasum -a 256 tests/doc-gate-e2e.test.ts
8342f169cdae4ba5cff286e2e7edadab0b1d283a16bf08c09a198d945387811b   ← fixture 试验前 = 试验后（同一哈希）
$ git status --short src/application/internal/conflict-check.ts tests/doc-gate-e2e.test.ts
 M src/application/internal/conflict-check.ts
 M tests/doc-gate-e2e.test.ts
```

（这两行 ` M` 是**本需求实现者**的改动，非本次复核引入；复核前后状态相同，且哈希逐字节一致。
所有复核脚本与临时备份都在 `/tmp`，未落仓库。）
