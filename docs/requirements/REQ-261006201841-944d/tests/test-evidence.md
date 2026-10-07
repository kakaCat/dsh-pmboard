# 测试证据（REQ-261006201841-944d · 2026-10-06）

## 环境与口径

- 仓根：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
- 运行器：vitest 2.0.0（`npx vitest`）；类型检查 `npx tsc --noEmit -p tsconfig.json`
- 工作树指纹：`HEAD = d0f01d6`（**无 commit 可指**：本工作区被多窗口共用，收尾时全树
  `git diff --stat` = 150 文件 / 4381+ / 647− 未提交；本需求自身改动面 21 个文件）
- **判决口径**：本需求的回归判据按**改动前后两次自采的失败用例集合差 + 逐文件归因**判，
  **不比绝对数、不刷测试基线**（`docs/reviews/test-baseline.*` 一字未改）。
  理由：多窗口共用工作树时绝对读数随时在动，不可界定（F-3）。

## 跑了什么

```
# 1 本需求自己的判据（新用例 10 文件）
npx vitest run tests/archive-materials-shape.test.ts tests/archive-targets-gate.test.ts \
  tests/archive-manifest-render.test.ts tests/archive-manifest-write.test.ts \
  tests/kb-invalidation.test.ts tests/kb-coverage-probe.test.ts tests/kb-index-rank.test.ts \
  tests/board-archived-origins.test.ts tests/archive-ledger-audit.test.ts \
  tests/application/use-cases.test.ts

# 2 契约升级组（7 文件，t11）+ 相邻回归
npx vitest run tests/archive-reconcile.test.ts tests/archive-reconcile-e2e.test.ts \
  tests/artifact-gates.test.ts tests/acceptance-archive.test.ts tests/archive-compat.test.ts \
  tests/kb-archive-deposit.test.ts tests/output-contract.test.ts

# 3 全量回归（自采快照，用于集合差）
npx vitest run --exclude '**/kb-coverage-probe.test.ts' --reporter=json \
  --outputFile=/tmp/req944d-post-final2.json     # 该文件单独跑见下
npx vitest run tests/kb-coverage-probe.test.ts

# 4 反向演练（整体验收标准 1/2/3）
npx tsx scripts/reverse-drill-matrix.mts --group archive
npx tsx scripts/reverse-drill-matrix.mts --group all

# 5 只读核对脚本（FR-8）
npx vitest run tests/archive-ledger-audit.test.ts
npx tsx scripts/archive-ledger-audit.mts --json --ledger-root <台账副本>

# 6 知识层 / 文档 / 构建
pnpm kb:check
npx tsx scripts/req-doc-validate.mts --req REQ-261006201841-944d
node scripts/verify-client-build.mjs
npx tsc --noEmit -p tsconfig.json
```

## 结果摘要

| 命令 | 改动前基线 | 改动后 | 判定 |
|---|---|---|---|
| 本需求新用例（10 文件） | 文件不存在 | `10 files passed`；`Tests 118 passed (118)` | ✅ 全绿 |
| 契约升级组（7 文件） | 旧形态夹具红（约 63 条） | `7 files passed`；`Tests 111 passed (111)` | ✅ 全绿 |
| 全量 `vitest run`（自采快照） | 6245 用例 / **122 失败 / 57 文件**（`/tmp/req944d-pre.txt`，前一窗口 20:26 自采） | 6613 用例 / **71 失败 / 38 文件**（+ `kb-coverage-probe` 单跑 7/7 绿） | ✅ **本需求相关 16 文件 0 失败**；新增失败文件 **1 个**且可归因（见下） |
| `--group archive` | 脚本无该组 | 3 条全过、**退出码 0** | ✅ 整体验收标准 1/2/3 |
| `--group all` | 28 条 | 28/28 `allOk`、`archive_refs=[]` | ✅ 既有三组未被削弱 |
| `req-doc-validate` | — | 9 项判据（实判 8 / 读数不可得 1）、缺口 0、**exit 0** | ✅ |
| `verify-client-build` | — | `OK bundle=721645 bytes`，关键符号与 CSS 分片完整 | ✅ 构建新鲜度 |
| `tsc --noEmit -p tsconfig.json` | 同一条存量错 | **1 条错**：`tests/query-docs-roots.test.ts(36,7) TS2415`（该文件与 HEAD 逐字一致 ⇒ 存量，非本次引入） | ✅ 零新增 |
| `pnpm kb:check` | 12 项检查，红 `{K1,K3,K7,K9,K10}` | 14 项检查，红 `{K1,K7,K14}` | ⚠️ **本需求引入新红 0**；K14 新红为他方欠债（见下） |

## 逐条验收标准对照

### 整体验收标准 1（反向演练 ①：不存在的 `merged_into` 必被拒并点名）

命令：`npx tsx scripts/reverse-drill-matrix.mts --group archive` → `✅ [RV-1]`，退出码 0。
拒绝消息原文（节选）：
`文件不存在（normalized=docs/architecture/__no_such_doc__.md）……（生效根 …/rv1-stub-workspace，判据来源 by=path-fallback）（REQBOARD_FILE_MISSING）`
→ **点名了路径 + 生效根 + 判据来源三要素**。材料 `submit-materials.json` 改坏前/还原后 sha256 均
`b8ad553d6a94…`（逐字节一致），且**还原后同一次提交：通过**（`success=true`）。

### 整体验收标准 2（反向演练 ②：删掉覆盖度检查分支必有用例变红）

`✅ [RV-2]`：把 `scripts/kb-probe.mts` 的 K13 分支整段块注释 → `npx vitest run
tests/kb-coverage-probe.test.ts -t '冷侧有归档材料但无 req'` **退出码 1、红例 1**，且点名用例
「① 冷侧有归档材料但无 req: 条目 → K13 红并点名该 id」（是**断言失败**，不是「没有覆盖」）；
`kb-probe.mts` sha256 `00187c55…` 逐字节还原；**还原后复跑退出码 0、红例 0**。

### 整体验收标准 3（存量只读核对如实报数）

`✅ [RV-3]`（台账**副本**上跑，不改真台账）：
`realMissingTargets=2 / missingTargetsOnFallbackRoot=2 / sectionDriftStrict=22 /
sectionDriftLooksLikeSection=14 / missingManualPath=1 / unknownRoot=3 / naiveMissing=15`（七项全 ✅）；
副本树与真台账树 sha256 前后**逐字节一致**（本次 `4ad608f59d31…`），副本之外**零新增文件**。
报告落 `archive-reconcile-report.md`（含逐条清单、生效根、口径说明与「按当前工作区直接比会误判 15 条」的反例）。

### 整体验收标准 4（改动前后集合差 + kb 读数）

- **集合差**：新增失败文件 **1 个** —— `tests/error-code-inventory.test.ts`（2 条）。
  红的是别窗口新增的传输码 `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED` /
  `REQBOARD_PROTOTYPE_PLACEHOLDER`（定义在 `src/application/use-cases/MoveRequirement.ts`，
  由别需求的 `src/application/internal/prototype-anchor-gate.ts` 等使用）**未登记进错误码清单**；
  本需求**零新增错误码**。修法属该窗口范围：`npx tsx tests/drill/refresh-error-code-inventory.mts`。
- **本需求相关 16 个测试文件在两个自采快照中均 0 失败**。
- **`pnpm kb:check`**：本需求新增 `K13`/`K14` 两项读数；`K13` 绿且判词如实点名 6 条零沉淀
  （基线豁免、非新增）；`K3/K9/K10` 已由别窗口修绿；`K1/K7` 为存量；
  **`K14` 新红**由别窗口 21:30 新沉淀 `kb-0064`（`req: REQ-261006201649-cc89`，失效条件仍为模板句）
  触发 —— 那是 K14 的设计行为，本次**不刷基线隐藏**（见 `reviews/self-review.md` 披露 ①）。

> 口径限制（如实写）：上表「改动前」快照取自前一窗口（20:26），早于 t11/t12 落地，
> 其中含本需求旧形态夹具的红（122 中约 63 条），**不能当作「本需求引入的回归」**；
> 故决定性判据是「本需求相关 16 文件 0 失败 + 其余新增失败逐条归因」。

### 整体验收标准 5（红线自查）

- diff 文件集合 ⊆ {归档提交、知识层、归档目录呈现} 三片：源码 9 个
  （`shared/protocol.ts`、`application/use-cases/SubmitArchive.ts`、`application/internal/archive-targets.ts`、
  `application/internal/requirement-origins.ts`、`domain/requirement/archive-manifest.ts`、
  `domain/knowledge/invalidation.ts`、`domain/knowledge/operations.ts`、`adapters/KnowledgeRepository.ts`、
  `http/routers/stages.ts`）+ 客户端 6 个 + 脚本 3 个 + 用例 10 个 + 需求文档。
- **无新增路径字符串比较型项目判定**：新增的 `startsWith` 只有
  ① `protocol.ts` 的 `mergeTargets` **文档白名单**前缀（FR-2 明确要求，与 `merged_into` 同源），
  ② `SubmitArchive.ts` 的错误码前缀与点文件判断。取根一律走
  `rootOfRequirement` + `sameProjectRoot`（单点）。
- **未碰**：验收标准、原型门、`docs/reviews/test-baseline.*`（一字未改）。

### 整体验收标准 6（吃狗粮 + 三态可复现）

- FR-7 三态：`npx vitest run tests/board-archived-origins.test.ts` → 28/28（`data-src` 三态、
  三态文案、`data-project`、缺 `origins` 逐字降级、旧输出逐字节不变、新增选择器恰好 4 条）；
  构建产物校验 OK。
- **本需求目录的 `archive.md`：本次无法产生事实** —— 它由归档提交（FR-5）在**归档时刻**渲染，
  验收未过不能走归档。FR-5 机制已由 `tests/archive-manifest-write.test.ts` 6/6 钉住
  （含二次提交 `written=false`、写盘失败台账零写入、`archive.md` 进「已列」不触发未列闸门）。
  验收时请按「时序未到」而非「未实现」判断。

## 覆盖对照（FR → 用例文件 → 读数）

| 条款 | 用例文件 | 读数 |
|---|---|---|
| FR-1 合并去向存在且非空 | `archive-targets-gate`(7)、`archive-materials-shape`(10)、RV-1 | ✅ 三态 + 跨项目 + 归属未知 + 非空 + 零访问 |
| FR-2 `path#anchor` + 白名单 | `archive-materials-shape`(10)、`archive-targets-gate`(7)、`archive-compat`(6) | ✅ 形态 / 白名单 / 锚点三因可分 + 读侧兼容 |
| FR-3 归档沉淀覆盖度 | `kb-coverage-probe`(7)、RV-2 | ✅ 含台账不可达不报绿、删分支即红 |
| FR-4 失效条件可判定 | `kb-invalidation`(11)、`kb-coverage-probe`(7)、`kb-index-rank`(6) | ✅ 两态 + 集合差 + 零字符降权 |
| FR-5 `archive.md` 渲染 | `archive-manifest-render`(17)、`archive-manifest-write`(6) | ✅ 含幂等与台账零写入 |
| FR-6 机器产物折叠 + 摘要 | 同上 | ✅ 含解析失败降级与不搬迁 |
| FR-7 看板来源三态 | `board-archived-origins`(28) | ✅ 视觉判断登记为人工项（见下） |
| FR-8 存量只读核对 | `archive-ledger-audit`(5)、RV-3 | ✅ 读数 2/2/22/14/1/3/15 可复跑 |

## 失败与未跑项（如实列出，不粉饰）

1. **`tests/error-code-inventory.test.ts`（2 条红）**：归因**别窗口**新增错误码未登记清单
   （`REQBOARD_PROTOTYPE_*`）。本需求零新增错误码；修法：
   `npx tsx tests/drill/refresh-error-code-inventory.mts`（属该窗口范围）。
2. **`pnpm kb:check` 的 `K1` / `K7` / `K14` 红**：`K1`（INDEX 8543 > 8000）与 `K7`（生成物漂移）
   是存量且被别窗口加重；`K14` 由别窗口新沉淀 `kb-0064` 触发（K14 按设计点名）。**本需求引入新红 0**。
3. **`tests/query-docs-roots.test.ts(36,7) TS2415`**：存量（该文件与 HEAD 逐字一致）。
4. **未跑（只能人看）**：运行中宿主 GUI 上「看板归档条三态 + 详情提示块」的**视觉**对照截图。
   agent 侧已跑的是 DOM/CSS 断言（28 条）与构建校验；请真人打开权威原型
   `prototypes/archive-source-label.html` §1～§3 与本仓看板逐态比对（验收单的 `prototype-compare` 项）。
5. **未跑**：本需求自身的归档提交（`archive.md` 吃狗粮）——需验收通过后进入归档阶段才有事实。
6. **已登记不改**：`scripts/reverse-drill-matrix.mts` 的两处框架扩展（可选 `restoreCheckCmd`、
   `ArchiveDrill` 定制执行器）为 t12 所必需，已写入脚本头注释；既有三组必填字段未放宽（`--group all` 28/28 为证）。

## 覆盖标注（`covers:`）—— 卡片 → 本文件哪一条判据覆盖它

> 口径：**父卡**由「本卡判据命令 + 实测读数」那一行覆盖（见「结果摘要」与「逐条验收标准对照」）；
> **子卡**按阶段归到同一份读数上——研发段 = 该卡落地文件 + 定向用例全绿那一条；
> 联调/复核段 = 契约/口径核对结论那一条；测试段 = 该卡判据命令的复跑读数那一条。
> 三条反向演练（RV-1/RV-2/RV-3）与集合差是**全卡共用**的证伪证据，故每张卡都引它。

| 覆盖对象 | 覆盖它的判据（本文件位置） |
|---|---|
| 12 张父卡 | 「结果摘要」表对应行 + 「逐条验收标准对照」1～6 |
| 12 条子卡链的研发段（13 张） | 对应测试文件的定向读数（118 + 111 条全绿） |
| 12 条子卡链的联调/复核段（12 张） | 「复核动作」表（契约/口径核对 + 既有三组 28/28） |
| 12 条子卡链的测试段（12 张） | 对应判据命令复跑 + 集合差归因 |
| 全 58 张 | RV-1 / RV-2 / RV-3 三条反向演练（改坏即红 + 逐字节还原） |

t-59aabb 与其子卡
covers: t-59aabb
covers: t-415665
covers: t-e37249
covers: t-213211
covers: t-9b6ad7

t-119fa7 与其子卡
covers: t-119fa7
covers: t-edc681
covers: t-55d1a1
covers: t-66cb80
covers: t-ffe4c7

t-f1e145 与其子卡
covers: t-f1e145
covers: t-a074b3
covers: t-8689f6
covers: t-92c038
covers: t-f05740

t-1346ed 与其子卡
covers: t-1346ed
covers: t-a762a1
covers: t-c8eb8f
covers: t-babe0d
covers: t-c75df0

t-82b565 与其子卡
covers: t-82b565
covers: t-139dd5
covers: t-4c443a
covers: t-6c7226
covers: t-f4837b

t-ae7678 与其子卡
covers: t-ae7678
covers: t-d0fc41
covers: t-dcd943
covers: t-0e909c
covers: t-5c3f1c

t-167e82 与其子卡
covers: t-167e82
covers: t-0bcf97
covers: t-af10d1
covers: t-e45975
covers: t-910cd5

t-58bf0d 与其子卡
covers: t-58bf0d
covers: t-169be7
covers: t-e590da
covers: t-46807a
covers: t-729629

t-df4bcf 与其子卡
covers: t-df4bcf
covers: t-ef8d4c
covers: t-5c4b0f
covers: t-64c528
covers: t-4002a6

t-79cabc 与其子卡
covers: t-79cabc
covers: t-cbd3a3
covers: t-0279da
covers: t-626092
covers: t-c09c8d

t-a3fa40 与其子卡
covers: t-a3fa40
covers: t-2eee08
covers: t-52bc4d
covers: t-04b58e

t-02fa7f 与其子卡
covers: t-02fa7f
covers: t-7b6fed
covers: t-69ef33
covers: t-fb7f93
