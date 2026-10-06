# 验收判据实测矩阵 · REQ-261006092213-4f5b

> 本文件是验收前置「9 类文档」里的 `tests/` 证据：把 `requirement.md` 的判定标准 A1–A9 逐条落到
> **跑什么命令、看到什么**。命令与输出摘要均为本机真实执行结果（2026-10-06）。

## 判据 → 命令 → 观测

| 判据 | 命令 | 观测（真实输出摘要） |
|---|---|---|
| **A1 逐项落章** | `npx vitest run tests/accept-sheet-tool.test.ts` | 29 passed；「带 results 提交 → 每个可预见项带 result 且 resultSource=agent」断言 `results_bound=4 / matched=4 / coverage=complete` |
| **A2 人零输入** | `npx vitest run tests/accept-sheet-zero-input.test.ts tests/verdicts-http.test.ts` | 9 + 6 passed；有结果的项 `asked` 里**没有** `<id>#result`（只 1 问）；零输入点通过 → `passed` 且 `opinion === result`；留空 + 无结果 → `unverified`（HTTP 200，不是 400） |
| **A3 漏项被拒** | `npx vitest run tests/accept-sheet-tool.test.ts` | `REQBOARD_RESULT_COVERAGE_MISSING` 且消息含 `task:t-…` 点名 + 「补齐：」三段式；`store.peekRevision()` 前后相等（台账零变更） |
| **A4 例外显式** | 同上 + `tests/stage-panel.test.ts` | `needsHuman===true` 且 `humanReason` 非空才落库（缺理由 → `REQBOARD_RESULT_EMPTY`）；看板行带 `data-needs-human="1"` + `.dsh-pm-flag.verify-pending`；弹框该行保留第 2 问、题干含理由 |
| **A5 反例仍拦** | `tests/accept-sheet-zero-input.test.ts`（9） + `tests/domain/req-b918-gates.test.ts`（17） | 无结果项零输入点通过 → `unverified`，**不弹**「验收通过并归档」（`asked` 无 `final-pass`）；全未复核时 `gate_status='pending'`、`archived=false`；`isFullyDecided=false` |
| **A6 响亮** | `tests/accept-sheet-tool.test.ts` | 坏 ref → `REQBOARD_RESULT_REF_INVALID` 且点名 `t-as0001x`；重复 → `REQBOARD_RESULT_REF_DUPLICATE`；空结果 → `REQBOARD_RESULT_EMPTY`；**判定顺序**：坏 ref 与漏项同时出现时报 REF_INVALID（先指不到项，后漏项） |
| **A7 兼容回滚** | `npx vitest run tests/verify-item-result.test.ts` | 15 passed；老写法不带 results → `results_coverage='legacy'`、`results_bound=0`；文本键未命中 → `results_unmatched=['v9-99']`；开关置 1 → 提交吃 legacy + 裁决取 `evidence[0]`；存量单据进 `sheetHistory` 且逐字相等 |
| **A8 本仓门禁** | `npx tsc --noEmit -p tsconfig.json`；`pnpm test`；`pnpm build:client` | tsc 退出码 0（零输出）；全量 `Tests 68 failed \| 5933 passed (6023)`，**68 ≤ 基线 106**（失败项均为其它未提交工作树：输出契约缺映射、W7 拆分语义、node-panel 样式等）；`[verify-client] OK bundle=654049 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| **A9 原型** | `docs/requirements/REQ-261006092213-4f5b/prototypes/INDEX.md` + 登记回执 | 唯一 `authoritative` = `prototypes/verification-result.html`（`detail.html` 标 `superseded`）；锚点 `#FR-3 / #FR-4 / #FR-5` 与 `evidence/prototype-conformance.md` 逐屏对上；原型已以 `reqboard_submit(kind=prototype)` 登记 |

## 用例落点（与 `design/test-cases.md` 对照）

| 文件 | 项数 | 覆盖 |
|---|---|---|
| `tests/result-binding.test.ts` | 30 | A1 / A3 / A6（纯函数六族体检与写入纪律） |
| `tests/accept-sheet-tool.test.ts` | 29 | A1 / A3 / A6 / A7（含 12 项本轮新增） |
| `tests/accept-sheet-zero-input.test.ts`（新） | 9 | A2 / A5（零输入通过、未复核底线、needsHuman 例外、回滚裁决侧、C1 重问） |
| `tests/verdicts-http.test.ts`（新） | 6 | A2 / A5 / A6（看板通道同口径 + 既有硬规则不被放宽 + 响应形状不变） |
| `tests/verify-item-result.test.ts` | 15 | A7 / A8（老写法、回滚开关、存量单据、契约三处同步） |
| `tests/domain/req-b918-gates.test.ts` | 17 | A5（放行判据同口径、needsHuman 不吃兜底、系统项处置仍必填） |
| `tests/stage-panel.test.ts` | 61 | A2 / A4（预填 = 台账原文、三态来源、needsHuman 不预填、前端不拦留空通过） |

合计 **167 项**（`7 files / 167 passed`）。

## 用例覆盖标注（covers: 任务卡）

> 覆盖度门禁按本仓约定读 `tests/*.md` 的 `covers:` 标注；下面按"哪张卡由哪些用例覆盖"逐行标注，
> 父卡与子卡都点名（子卡是父卡链的阶段卡，证据由同一批用例承载）。

### 提交侧与纯函数（t2 父卡链 / t1 父卡链）

covers: t-3153e8, t-d0d5e1, t-7c6a72, t-464d04

covers: t-62130a, t-9d4bad, t-6eb74f, t-74d896, t-aab172

### 裁决口径与底线（t3 父卡链）

covers: t-3a769a, t-f9da11, t-48a832, t-10c72e, t-f41d95

### 看板通道与界面（t4 / t5 父卡链）

covers: t-8d3c5d, t-174efd, t-b3de64, t-be0066, t-cd1355

covers: t-60a977, t-825070, t-e68298, t-df7493, t-61fbfa

### 兼容回滚与文档（t6 / t7 父卡链）

covers: t-ee18ef, t-c51d42, t-f95b53, t-da54f1, t-0b4142

covers: t-d00097, t-b54e40, t-e77477

## 人工验收证据（不可自动化部分）

- 看板逐项行五种形态一屏：`evidence/verification-sheet-1280.png`（2560×2160，2 倍图；出图脚本
  `scripts/req-verification-sheet-shot.mts`，用**生产渲染器** + 全量真实 CSS，落图前自检渲染串四形态）。
- 原型对照与差异清单：`evidence/prototype-conformance.md`（含 6 条刻意差异与本次复核修点表）。
- 会话弹框问数：由宿主原生渲染，本仓只能决定问数与题干——已由 `accept-sheet-zero-input` 的
  `asked` 断言锁定（有结果 1 问 / needsHuman 保留第 2 问）。

## 运行态说明（**请先读这一段**，2026-10-06 实测）

**仓库代码已完工并构建，但宿主里跑的是旧构建**——两枚指纹可直接对照：

| 项 | 值 |
|---|---|
| 宿主当前运行的插件（`reqboard_status` 的 `plugin_build`） | `aa88b274674d` |
| 本次重新构建产物（`shasum -a 256 dist/index.mjs`） | `9b5da9a303aa` |

后果与处置：

1. 已提交的验收单 **v1（11 项）是旧构建产出的**：它不含逐项 `result` / `resultSource`
   （旧代码不认识 `results` 参数），因此**这张单不能证明 FR-1 在运行态生效**。
2. 本需求的运行态行为（逐项落章、漏项即拒、零输入通过、看板预填）已由 **167 项用例在真实工具入口上锁定**
   （见上文矩阵）；要看运行态闭环，请在宿主**重载 / 重启 reqboard 插件**（新构建指纹 `9b5da9a303aa`），
   然后重新提交一次验收材料——新单会带每项 `result`，`results_coverage='complete'`。
3. 顺带修掉一个**旧构建暴露的真缺陷**：`SubmitTool` 的 `doc_sync_pending` 只声明了
   `source` / `downstream`，而值里一直带 `reason` / `at` ⇒ 凡"有文档待同步"的 submit，
   **产物已落库、回执却被绑定层判 `invalid output`**（本次提交实测踩中）。已在 src 补声明并重建；
   首次提交的回执异常即由此而来，不影响台账里已落地的验收材料。

## 未达成项（如实披露）

- `pnpm kb:check` **仍退出 1**。其中 `kb-build --check` 已零漂移（本需求造成的符号/类名漂移已消除）；
  余下 5 项为 `kb-probe` 的既有失败，均属其它未提交工作树：
  `K1 INDEX 超 8000 字` / `K5 kb-0043、kb-0048 孤儿条目` / `K6 两条 one_liner 超长` /
  `K3 design-tokens 220 行超 200（本次改动前已 219）` / `K10 C-27 骨架占位`。
- 承上：本需求**未触碰**上述知识层条目；若要 `kb:check` 归零，需由那些条目的归属需求处理。
