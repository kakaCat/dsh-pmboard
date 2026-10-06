# t-1e7c7c 端到端回归锁：确认后无需人敲字即起轮·研发

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
端到端回归锁：确认后无需人敲字即起轮·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T10:46:22.816Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

端到端回归锁落地：真装配下确认后不注入任何用户消息即起轮；并补齐两条确认通道的清位驱动接线。

### 完成项

- 新建 tests/wake-after-confirm.test.ts：真装配（真投递器 + 真驱动 + 真在途登记表 + 事件桥替身）
- TC-11：弹框在途 → 人晚答（带 ref）→ 停手位清、status 变、inbox 收到 1 条 dive 回合
- TC-12：否定作答 → 不落章不推进，但照样起 1 轮
- 发现并补齐真实缺口：AskConfirm 与 gate-prompt 的清位出口未接 onCleared
- 该缺口后果：否定作答后链上什么都不发生（FR-2 字面语义未落实）
- 幂等保护：肯定作答时收敛点已带 notify:false 清位，通道 finally 那次 cleared=false ⇒ 不会二次补发
- 反向验证两次均命中：拿掉收敛点清位 ⇒ TC-11 红；拿掉通道接线 ⇒ TC-12 红（原始输出已留档）

### 改动文件

- `tests/wake-after-confirm.test.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/dive/gate-prompt.ts`
- `docs/requirements/REQ-261006170150-52cc/evidence/wake-after-confirm-reverse.md`

### 下一步

复核段：核装配边界与反向验证证据

---
## 汇报 2（2026-10-06T10:46:37.201Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

补记研发段验收要求的改动读数（新增文件用行数，接线用净增行数代替 diff --stat）。

### 完成项

- 新增文件（未跟踪，diff --stat 不显示，以行数代摘要）：tests/wake-after-confirm.test.ts 193 行
- 新增文件：evidence/wake-after-confirm-reverse.md 78 行
- AskConfirm.ts：本卡净增 5 行（awaiting 的 onCleared 注入 + 注释）
- gate-prompt.ts：本卡净增 4 行（同上）
- 本卡合计 +4 文件（2 新增 + 2 处定向接线）

### 下一步

（补充读数，研发段已关单）

---
