---
req: REQ-261001170807-06fd
doc: test-evidence
serves: FR-1, FR-2
---

# 测试证据（serves: FR-1, FR-2）

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/e2e-close-chain.test.ts tests/subtask-template-acceptance.test.ts` | **6 passed**（修复前：1 failed 3 passed → 红） |
| `npx vitest run tests/domain/done-evidence.test.ts` | 8 passed |
| `pnpm test` | **106 failed / 2854 passed**（基线 106，无新增失败） |
| `npx tsc --noEmit` | **212 errors**（= 基线） |
| `pnpm build` | 通过；`dist/index.mjs` 含 `parentId !== taskId` |

原始输出：`evidence/repro-red.txt`（红→绿两态）、`evidence/live-proof-before-after.txt`（现场 5 次）。

## 覆盖标注（验收门禁用）

covers: t-7a4dae
covers: t-7886b6
covers: t-5eac48
covers: t-ea0811
covers: t-eb1e8b
covers: t-44cb33
covers: t-97203c
covers: t-6ccb96
covers: t-1ea4dc
covers: t-e046a3
covers: t-38c3b4
covers: t-e6cb2d
covers: t-7b09b0
covers: t-966cfb
covers: t-c29602
covers: t-834d89
covers: t-9915f9
covers: t-429784
