# FR-6 降级登记：报告类模板今天没有机械门禁

> 本文件是 REQ-261006123819-3af3 FR-6 验收标准 3 要求的**降级登记**载体。
> 验收材料（`verification.md`）必须引用本文件，并**不得**出现「模板要求已被门禁保证」一类表述。
>
> 采集于 2026-10-06 · 工作树：与 `test-baseline.mts --check` 打印的指纹同刻（多窗口共用工作树，行号会漂）。

## 事实（逐条可核验）

| 事实 | 出处（现行行号） |
|---|---|
| `review.md` / `test-evidence.md` 被显式登记为报告类模板、**无线上门禁**，只受「占位符全登记」约束 | `scripts/template-gate-probe.mts:83`、`:108-112`、`:385`（设计期写作 `:105-112`、`:390-391`，行号已随并发改动漂移） |
| `verification.md` 由生成器输出**固定节**，窗口写入的字段在 `submit` 时被覆写 | `src/domain/workflow/VerificationDoc.ts`、`src/application/use-cases/SubmitVerification.ts` |
| 拆分/任务卡/验收至今没有门禁必填节集合 | `scripts/doc-section-parity.mts` |

## 因此本次做了什么、没做什么

- **做了**：在 `templates/implementing/test-evidence.md` 的 `## 环境` 与
  `templates/accepting/verification.md` 的 `## 证据` 两个**既有节内**加入工作树指纹要求
  （采集时间 + HEAD 短哈希 + `git diff --stat` 摘要）。只在既有节内加要求，未新增节，
  故 `pnpm templates:check` 保持绿（实测 exit 0）。
- **没做 / 做不到**：这些要求**没有机械门禁兜底**——一个窗口不写指纹，不会有任何检查报错。
  「写了要求」≠「已被门禁保证」，本文件存在的意义就是不让前者被当成后者。
- **后续候选（另立需求）**：把报告类模板纳入门禁（需动 `template-gate-probe.mts` 的模板分类，
  属门禁改造，超出本需求量级）。

## 反向证伪（FR-6 验收标准 3 的预置条款）

把本文件从验收材料里删掉 → 验收材料不再有任何「无机械门禁」的说明，
而模板层确实**没有**自检会因此报错——这正是「降级」二字的实证：
本条 FR 的落点只能是「模板写要求 + 验收材料如实登记」，不是「新增门禁」。
