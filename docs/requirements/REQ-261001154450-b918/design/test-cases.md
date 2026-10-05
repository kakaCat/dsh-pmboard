---
req: REQ-261001154450-b918
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 测试策略 · 十三条断言怎么跑、看到什么算过（REQ-261001154450-b918）

> **TL;DR**：原则**修前必红、修后必绿**。分三层——域层纯函数单测、用例/编排集成测、
> 脚本门禁（K11）+ 端到端演练（拿本需求自己走一遍收尾）。

## 断言与用例对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 断言（可证伪） | 层 | 修前 | 修后 |
|---|---|---|---|---|
| 1 | 通过且实际结果为空 → `unverified`，且需求级判定不通过 | domain 单测 | 红（现状记 passed） | 绿 |
| 2 | 台账/文档中不再出现占位文案"未附实际结果" | 集成 + grep | 红（AcceptSheet.ts:211 存在） | 绿 |
| 3 | 系统项通过且处置为空 → 整批拒绝、无裁决落库 | 集成 | 红 | 绿 |
| 4 | 计划批准后自动投递一次，`jobStatus !== 'not_found'` | 集成（stub jobs） | 红 | 绿 |
| 5 | 已存在 active run 时不重复投递（幂等） | 集成 | —— | 绿 |
| 6 | 节流拒绝文案含剩余秒数与合规路径 | 域/用例单测 | 红（只有"请稍后"） | 绿 |
| 7 | 挂起超 TTL 后不再拦写路径 | 集成（假时钟） | 红 | 绿 |
| 8 | 取回执对过期挂起返回 `expired:true` + 指引 | 集成 | 红 | 绿 |
| 9 | `archived` 且无 archive 产物 → `closingGap='archive_missing'` | domain 单测 | 红 | 绿 |
| 10 | 归档材料提交后 `closingGap` 消失 | 集成 | —— | 绿 |
| 11 | 计划任务表缺 FR 引用 → 提交/落库被拒 | 集成 | 红（32/32 全空却通过） | 绿 |
| 12 | 落库后每张顶层卡 `requirementRefs` 非空、覆盖率 100% | 集成 | 红 | 绿 |
| 13 | K11：退出码类期望无基线声明 → `kb:check` 非零；补声明 → 退出码 0 | 脚本门禁 | 红 | 绿 |

## 端到端演练（本需求自己走一遍） `serves: FR-1, FR-2, FR-3, FR-6, FR-7`

```
   ① 拆分落库 -> 检查 queue.json 每卡 requirementRefs 非空      （FR-7）
   ② 批准计划 -> 不调 task_run，确认链已自动投递               （FR-3）
   ③ 验收单：一项通过不填结果 -> 期望 unverified 且不归档       （FR-1）
   ④ 系统项：通过不写处置   -> 期望整批拒绝                    （FR-2）
   ⑤ 全部通过但先不交归档   -> 期望 closingGap=archive_missing （FR-6）
   ⑥ 提交归档材料           -> 期望 closingGap 消失、可归档     （FR-6）
```

## 回归与基线 `serves: FR-1, FR-4, FR-5`

| 项 | 口径 |
|---|---|
| 全量测试 | `pnpm test`，失败数与 **HEAD worktree 基线**一致（当前 106 failed / 2807 passed） |
| 类型检查 | `npx tsc --noEmit` 错误数不高于 HEAD 基线（当前 212 vs 223） |
| 知识层 | `pnpm run kb:check` 退出码 0（含新增 K11） |
| 旧行为 | 未确认产物、已确认产物、存量挂起（无 createdAt）三条路径逐字节不变 |
