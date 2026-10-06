# 验收判据实测矩阵 · REQ-261006123819-3af3

> 本文件是验收前置「9 类文档」里的 `tests/` 证据：把 `requirement.md` 的整体验收标准 A1–A7
> 与六条 FR 的关键判据逐条落到**跑什么命令、看到什么**。命令与输出摘要均为本机真实执行结果。
> 采集时刻：2026-10-06 · HEAD `917b39d` · 工作树 `266 files changed, 16325 insertions(+), 2244 deletions(-)`
> （指纹口径见 FR-6：没有工作树指纹的「跑通了」不可复现——本仓多窗口共用工作树。）

## 整体验收标准（A1–A7）

| 判据 | 命令 | 观测（真实输出摘要） |
|---|---|---|
| **A1 契约三文件全绿** | `npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` | `Test Files 3 passed` / `Tests 53 passed`，exit 0（改动前 output-contract 4 failed） |
| **A2 绝对数字从规范性面消失** | `grep -rn "≤ 98\|≤ 197\|基线 106\|当前 223" docs/knowledge/ docs/guides/ docs/architecture/` | 仅 `entries/kb-0025.md` 2 处——设计在 `design/interfaces.md` 例外表登记为「决策记录，不追改」（证据优先）；规范性面（conventions / guides / architecture 正文）命中 0 |
| **A3 已归档需求判 passed** | `npx tsx` 门禁探针（读真实台账调 `buildGateVerdicts`） | 分片台账 50 条 + JSON 台账 37 条 = **87/87** archived 记录 `verdict='passed'`，且 `at` 全部等于 `statusHistory` 里 archived 事件的 `at`（不符 0） |
| **A4 知识层自检全过** | `npx tsx scripts/kb-probe.mts`；`pnpm kb:check` | `kb-probe: 全部通过（12 项检查）` exit 0（改动前 7 项失败）；`kb:check` exit 0 且无 `[drift]` 行；INDEX 7627 字符 ≤8000 |
| **A5 本需求有提交且不越界** | `pnpm commit:check --req REQ-261006123819-3af3`；`git show --name-only HEAD` | `OK：… 有 1 条提交`（`917b39d`）exit 0；越界文件数 0（提交内容 ⊆ 本需求清单） |
| **A6 验收材料带工作树指纹** | 本文件顶部 + `notes-fr6-template-gate-degradation.md` | 指纹在场（HEAD + `git diff --stat` 摘要）；模板要求已落在 `templates/implementing/test-evidence.md` 与 `templates/accepting/verification.md` 的既有节内 |
| **A7 全量失败用例集合差为空** | `npx tsx scripts/test-baseline.mts --check` | `本次失败 61 条 · 基线 68 条`，**`新增失败 0 / 不再失败 7`**，tsc 退出码 0 / error TS 0 |

## 六条 FR 的关键判据

| FR | 命令 | 观测 |
|---|---|---|
| FR-1 工具登记面 | `grep -c` 工厂扫描 / RV-1 | 放宽后扫到 27 个工厂（原 25，漏 Bind/Handoff）；`registry.dir` 与磁盘 27 个目录差集为空；RV-1 删 TaskAdopt → output-contract 红并点名，还原复绿 |
| FR-2 基线口径 | `grep -n 基线 docs/knowledge/conventions.md`；`kb-conventions-sync --check` | C-14/C-15 段落三位绝对数字 0 处、含 `docs/reviews/test-baseline.md` 指针；C-28 挂可跑命令 `pnpm commit:check --req <REQ-id>`；覆盖清单零缺口零漂移 |
| FR-3 死字段 | `grep -rn archivedAt\|archivedBy src/ tests/ scripts/` | **命中 0**；七文件 254 passed；`pnpm build:client` → `[verify-client] OK` |
| FR-4 知识层 | `npx tsx scripts/kb-probe.mts`；`grep -c kb-conventions-c-22` | 12 项全过；`kb-conventions-c-22` = 1、`kb-0043|kb-0048` = 2；两处产出孤儿的根因各有正反用例 |
| FR-5 提交纪律 | `pnpm commit:check --req …`（两方向） | 未提交 → `FAIL` exit 1；提交后 → `OK` exit 0；缺口清单见 `reviews/review-log.md` |
| FR-6 证据指纹 | `pnpm templates:check`；`grep 工作树 templates/` | exit 0（模板 6 类 OK 6 / FAIL 0）；两个模板的既有节内均要求 HEAD + `git diff --stat` 摘要 |

## 反向证伪（本仓惯例：人为改坏必红）

| 编号 | 注入 | 观测 |
|---|---|---|
| RV-1（FR-1） | 从 `TOOL_REGISTRY` 删 TaskAdopt 一条 | output-contract 红并**点名 `TaskAdopt`**；还原后复绿（文件逐字节一致） |
| RV-3（FR-3） | `archivedMomentOf` 恒返 `undefined` | 归档门仍 `passed` 但 `at` 键**整体省略**（不是 `at: undefined`） |
| RV-4（FR-3） | 判据退回「按材料有无」 | 归档门退回 `pending`（断言 `expected 'pending' to be 'passed'`） |
| RV-6（FR-4） | 删 INDEX 里 kb-0043 行 | K5 报孤儿 `kb-0043` |
| RV-7（FR-4） | 删 INDEX 里 c-22 行 | 新增的 K12 点名「C-22 缺索引行」 |
| 联调负控（FR-3） | 剪断客户端读的 `d.gates` 读数 | 跨端联调用例立刻红（证明该用例承重） |

## 已知缺口（不冒充为已解决）

1. **部分改动未纳入本次提交**：与别窗口在飞改动逐文件交织，按 D-8 + 人工裁定只提交零风险子集。
   逐文件清单与实测理由见任务卡 `t-f1a4c2` 的完工汇报；提交后 `git status --porcelain` 仍 425 项。
2. **报告类模板仍无机械门禁**：`templates/implementing/review.md` 与 `test-evidence.md` 被
   `scripts/template-gate-probe.mts` 显式登记为「无线上门禁」。本次只做到「模板里写要求」，
   **不等于**「已被门禁保证」——详见 `notes-fr6-template-gate-degradation.md`。

## 覆盖标注（`covers:`）—— 卡片 → 实测判据

> 下面每条 `covers:` 指明「该任务的验收标准由本文件哪一行判据覆盖」。
> 判据行为上文的 A1–A7 与六 FR 表、反向证伪表。

covers: t-1f7453
covers: t-0d442a
covers: t-ec33f6
covers: t-ac2770
covers: t-8e77dd
covers: t-a9229c
covers: t-80336d
covers: t-f1a4c2
covers: t-e88a19
covers: t-8d2f69
covers: t-bb42b1
covers: t-ddf731
covers: t-8c33a3
covers: t-46cf93
covers: t-1b6959
covers: t-aaacce
covers: t-342565
covers: t-45b7a0
covers: t-225538
covers: t-8128ae
covers: t-49df00
covers: t-1e7270
covers: t-65bdf2
covers: t-2f8638
covers: t-a46617
covers: t-49e34c
covers: t-844531
covers: t-51e8cc
covers: t-6610fd
covers: t-b3ea5d
covers: t-dd9aa7
