---
req: REQ-261001184609-cecb
doc: test-evidence
serves: FR-1, FR-2, FR-3
---

# 测试证据

| 命令 | 结果 |
|---|---|
| npx vitest run tests/verify-item-result.test.ts | **10 passed**（绑定 / 只问裁决 / 人工项带理由 / 不被覆盖 / 回滚开关 / 契约三处同步） |
| npx vitest run tests/accept-sheet-tool.test.ts | 11 passed（既有弹框行为未被改坏） |
| pnpm test | **106 failed / 2866 passed**（基线 106，零新增失败） |
| npx tsc --noEmit | **212 errors**（= 基线） |
| pnpm run build:client | [verify-client] OK bundle=331279 bytes |

## 覆盖标注（验收门禁用）

covers: t-910506
covers: t-1bc202
covers: t-ad88fb
covers: t-404edc
covers: t-e35027
covers: t-3cf3f0
covers: t-2f73d0
covers: t-c4e637
covers: t-0fcc6c
covers: t-97a3a3
covers: t-24a52b
covers: t-576a13
covers: t-0f2afe
covers: t-f6f56f
covers: t-cddee2
covers: t-16a110
covers: t-379581
covers: t-5d57e4
covers: t-90e8c6
covers: t-c51e19
covers: t-495a7d
covers: t-56fa32
covers: t-5aeea3
covers: t-832b6b
covers: t-8a445f
covers: t-6c661c
covers: t-ceaba2
covers: t-bd1d47
covers: t-3a9d41
