---
req: REQ-261001170807-06fd
doc: architecture
serves: FR-1, FR-2
---

# 架构 · 两道门与它们的数据来源（serves: FR-1, FR-2）

> **TL;DR**：两个缺陷同源——**判据/模板的依据与真实流程错位**。收尾门的依据是任务台账的 `parentId`；
> 验收门的依据是 acceptance 文本里的可执行锚点。前者缺归属维度，后者缺命令。

```
  关父卡
    │
    ▼
  assertDoneEvidence（application/internal/support.ts）
    ├─ 父卡路径 → checkDoneEvidence → 60s 节流（本文改动点①）
    └─ 子卡路径 → checkSubtaskEvidence（豁免节流，三项口径）
                     │
                     ▼
            DoneEvidenceSpec.findRecentAgentDoneTask
              判据 = 有 agent-done 且 within 窗口 且 **不是本卡自己的子卡**
```

| 层 | 职责 | 本次改动 |
|---|---|---|
| DoneEvidenceSpec | 纯判定：谁算"刚被关过" | 加 `parentId` 归属排除 |
| support.ts | 取副作用证据后交给纯判定 | 传参已含 parentId（无需改查询） |
| SubtaskTemplate | 子卡验收文本的唯一事实源 | 16 阶段改为可执行命令 |
