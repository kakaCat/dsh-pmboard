# 测试证据 · REQ-261002164800-d8f2

> 采集时间：2026-10-02 17:2x ｜ 采集窗口：session-fcfe356b ｜ 全部命令原样可复跑。
> 判定口径一律"**跑什么、看到什么算过**"，不接受口头描述。

## 1. 本需求新增用例（8 个文件 / 56 条，全绿）

| 文件 | 条数 | 覆盖条款 | 命令 |
|---|---|---|---|
| `tests/reqboard/requirement-refs.test.ts` | 16 | FR-2 | `npx vitest run tests/reqboard/requirement-refs.test.ts` |
| `tests/reqboard/plan-refs.test.ts` | 9 | FR-1 / FR-3 | 同上（换文件名） |
| `tests/reqboard/plan-landing-parity.test.ts` | 7 | FR-1 / FR-3 / FR-6 / FR-7 | 同上 |
| `tests/reqboard/board-plan-approve.test.ts` | 5 | FR-1 / FR-6 | 同上 |
| `tests/reqboard/task-refs-repair.test.ts` | 6 | FR-4 | 同上 |
| `tests/reqboard/backfill-task-refs.test.ts` | 4 | FR-5 | 同上 |
| `tests/reqboard/landing-failure-loud.test.ts` | 4 | FR-6 | 同上 |
| `tests/reqboard/legacy-refs-compat.test.ts` | 5 | FR-1 / FR-5 / FR-7 | 同上 |

汇总命令（一次跑完）：

```bash
npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts \
  tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts \
  tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts \
  tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts
```

期望：`Test Files 8 passed` / `Tests 56 passed`。

## 2. 修前必红（每条都记了"红在哪"）

| 断言 | 修前实测 |
|---|---|
| 计划里的 `requirement_refs` 能落到卡上 | `normalizePlanTasks([{…, requirement_refs:['FR-1']}])` 输出**没有该键**（白名单丢弃） |
| 一张无 FR 的卡不拖垮整批 | 批准路径抛 `REQBOARD_PLAN_REFS_MISSING` → **0 张卡**（实测 REQ-261002161439-277d 16:30:40） |
| 两条入口取数一致 | 手动 `reqboard_decompose` 不读文档覆盖表 → 卡上 refs 全空（277d 11 张父卡全空） |
| 覆盖度读数可信 | `generateRTMData` 拿投影对象算 → `covers_frs` 恒空数组 |
| 落库后能补引用 | `grep -rn "requirementRefs" src` 的写点只有建卡一处 |
| 无落点警告看得见 | 只进回执（一次性返回体），看板/台账查不到 |
| 存量空引用能批量补 | 全仓无任何回填路径（只有逐卡手工入口） |

## 3. 全量与工程规范（本卡收口时实测）

| 命令 | 实测输出摘要 | 基线 | 判定 |
|---|---|---|---|
| `npx vitest run` | `99 failed / 3240 passed / 20 skipped (3359)` | ≤ 106 failed（C-14） | 通过 |
| `npx tsc --noEmit` | `189` 个 error | ≤ 223（C-15） | 通过；本需求改动文件零错误 |
| `pnpm build` | 退出码 0；`[verify-client] OK bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` | 退出码 0（C-11） | 通过 |

### 既有噪声（改动前后同样失败，非本需求引入）

- `tests/output-contract.test.ts`：TaskAdopt / Knowledge / Regenerate 三个工具的响应源映射缺失（3 项）；
- `tests/plan-mode.test.ts:221`、`tests/auto-chain-approval.test.ts:82`、`tests/t17-queue-e2e.test.ts:130`（3 项）；
- `tests/reqboard/store-contract.test.ts` / `tests/reqboard/shard-repository.test.ts` 属另一窗口在途的 v10 分片迁移，会随其进度波动。

## 4. 真库只读试跑（回填器）

```bash
pnpm tsx scripts/backfill-task-refs.ts --dry-run --root /Users/mac/Documents/ai/dsh/dsh-pmboard \
  --ledger ~/.dsh/dsh-reqboard.json --report /tmp/backfill-report.json
```

实测输出摘要：`需求数 26` / `候选 10` / `无来源 1` / `跳过 618`；`--check` 输出 `empty_with_doc_coverage: 10`。

候选全部落在 REQ-261002161439-277d；无来源那 1 张是它的 t10 文档卡（覆盖表确实没给它条款）——如实留空并列出。

**未执行 `--apply`**（会改活数据，留人拍板）；`--apply` / `--check` / `--restore` 三步的语义由
`tests/reqboard/backfill-task-refs.test.ts` 在夹具上验证。

## 5. 测试隔离纪律（防污染真实仓库）

RTM 同步按 `docs.workspaceRoot()` 落盘；本需求新增用例一律把该根指向临时目录
（`mkdtempSync` + `afterEach(rmSync)`）。实测跑完 `ls -d docs/requirements/REQ-test-*` 为空。

## 6. 相关证据文件

- 收口证据（命令 + 输出摘要 + 回滚演练三条路径）：`docs/requirements/REQ-261002164800-d8f2/notes/t8-baseline-evidence.md`
- 自评报告：`docs/requirements/REQ-261002164800-d8f2/reviews/self-review.md`
- 每张卡的逐段汇报：`docs/requirements/REQ-261002164800-d8f2/tasks/`

## 7. 卡 ↔ 测试覆盖对照（covers 标注）

> 供 RTM 覆盖度门禁读取：每张卡（父卡与子卡）都标注了它由哪些用例覆盖。

### TC-FR2 refs 契约卡（含四段子卡）covers: t-9d4dd7 t-117268 t-31f506 t-8e4d81 t-6acfda
covers: t-9d4dd7 t-117268 t-31f506 t-8e4d81 t-6acfda

### TC-FR1/FR3 取数单点卡（含四段子卡）covers: t-90dc24 t-24f37b t-fdc36c t-1a9dd5 t-782eb3
covers: t-90dc24 t-24f37b t-fdc36c t-1a9dd5 t-782eb3

### TC-FR1/FR7 落库层收敛卡（含四段子卡）covers: t-3c0a50 t-22ca89 t-881e7b t-9aa25b t-28610b
covers: t-3c0a50 t-22ca89 t-881e7b t-9aa25b t-28610b

### TC-FR1/FR6 看板批准卡（含四段子卡）covers: t-2f828a t-261cc0 t-234fb2 t-d7a86e t-764fa9
covers: t-2f828a t-261cc0 t-234fb2 t-d7a86e t-764fa9

### TC-FR4 补写入口卡（含四段子卡）covers: t-286e32 t-fcda30 t-7d0040 t-8d1a47 t-ec4a12
covers: t-286e32 t-fcda30 t-7d0040 t-8d1a47 t-ec4a12

### TC-FR5 存量回填卡（含三段子卡）covers: t-14c7b1 t-98c67a t-0113b3 t-2d778f
covers: t-14c7b1 t-98c67a t-0113b3 t-2d778f

### TC-FR6 失败响亮卡（含三段子卡）covers: t-6df9db t-ea81bd t-4dd9e1 t-75e897
covers: t-6df9db t-ea81bd t-4dd9e1 t-75e897

### TC-FR1/FR5/FR7 收口卡（含三段子卡）covers: t-1f9170 t-b949bc t-633c87 t-97aec2
covers: t-1f9170 t-b949bc t-633c87 t-97aec2
