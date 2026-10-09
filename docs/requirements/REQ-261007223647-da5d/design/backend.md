---
doc: design/backend
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-4
---

# 后端设计（REQ-261007223647-da5d · 轻档）

## 模块改动面 · serves: FR-1, FR-2, FR-4

| 模块 | 改动 | serves |
|---|---|---|
| `adapters/UserQuestionsAdapter.ts` | +askTimed 透传宿主限时等待（IF-3） | FR-1 |
| `application/use-cases/AskConfirm.ts` + `SubmitTool` 自动门 | 等待改 askTimed；超时回执 pending+ticket（替 interrupted） | FR-1 |
| `application/internal/gate-request.ts` | reused 分支 +redispatch（IF-4） | FR-1 |
| `application/use-cases/CaptureRequirement.ts` | 两段弹框走 askTimed；cancel/timeout 留痕写入 | FR-1, FR-2 |
| `adapters/CaptureRejectionFile.ts` → 泛化 CaptureInteractionFile | kind 三值 + 旧文件合并读（IF-6） | FR-2 |
| `application/internal/capture-mapping.ts` | 4 问重构 + 剥后缀映射（IF-1/IF-2） | FR-3 |
| 提示词文本（CaptureTool/CreateTool prompt、capture-section、volatile-notice、submit prompt） | 问数口径对齐 4 问、补 prototype、推荐标记统一 | FR-4 |

## S-1 超时不丢票时序 · serves: FR-1

```
用例 → askTimed(预算−2s) ──窗口内作答──▶ 正常映射/落章（现状路径不变）
                └──到期──▶ {kind:'pending'} → registry 保票 → 回执 pending+ticket
                                                     ▲
        看板作答(board-confirm 已有) / 重投(redispatch) / receipt 取回执
```

约束：任何 inline 等待的宽限必须 < 所属工具预算（timeoutWriteMs 30s 的 Submit 自动门 = 纯投递零等待）。

## S-2 错误码与留痕 · serves: FR-1, FR-2

新码：无（repost 复用 REQBOARD_UNKNOWN_TICKET；askTimed 越界复用 REQBOARD_INVALID_INPUT）。
留痕：capture-interactions.json（reject/cancel/timeout 三 kind）；台账结构零变更（B2）。

## S-3 并发约束 · serves: FR-1

redispatch 幂等：同 ticket 重复重投 = 重复通知，无第二道门（gate-request 判定序 ① 保证）；
pending-guard 的写路径拦截名单不变（PENDING_CONFIRM_BLOCKED_TOOLS），超时票与阻塞票同待遇。
