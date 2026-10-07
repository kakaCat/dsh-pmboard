---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 测试用例（REQ-261007165643-4275）

> 本需求为 spike（只读调研），无生产代码改动，**不适用 vitest 用例**；
> 验收判据全部为可复核命令读数（本文件即测试策略与用例清单）。

## 判据用例表 <!-- serves: FR-1 -->

| # | 用例（命令） | 期望读数 | 实测 | 结果 |
|---|-------------|---------|------|------|
| TC-1 | `grep -c "toolName: 'reqboard_" src/tools/registry.ts` | 27 | 27 | ✅ |
| TC-2 | `grep -rho "REQBOARD_[A-Z_]*" src --include=*.ts \| sort -u \| wc -l` | 136±2（剔占位/模板前缀口径） | 139（剔后 ≈136~138） | ✅ |
| TC-3 | `wc -m src/tools/*/prompt.ts` | total ≈1.5 万，SubmitTool 居首 | 14835 / SubmitTool 2608 | ✅ |
| TC-4 | `npx tsx scripts/req-doc-validate.mts --req REQ-261007165643-4275 --category spike` | exit 0 | exit 0（9 项、缺口 0） | ✅ |
| TC-5 | 报告引用抽检（H1/H2/H3/M1/M3/C-3/C-5） | 每处文件:行号真实存在且语义吻合 | 7 处全部属实 | ✅ |
| TC-6 | `grep -c "待回填\|（待" design/research-report.md` | 0 | 0 | ✅ |

## 不执行的判据与理由 <!-- serves: FR-2 -->

- `npx vitest run tests/`：本需求零代码改动（git 工作树中本需求改动仅限 docs/requirements/REQ-261007165643-4275/），
  无被测对象；仓内存量测试基线属其他进行中需求的责任面。
