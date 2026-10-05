# REQ-261001154450-b918 归档材料 · 收尾门硬化 + 自动链默认开

> **TL;DR**：来源是一次会话审核（REQ-261001143526-8475 的 82/100 复盘）。结论是**五处"记账环节"漏洞**——
> 证据可以留白、系统项可以无处置通过、批准后没人开链、收尾可以缺归档、追溯字段可以全空。
> 本需求把它们补成代码级硬约束，10 张卡全部落地，零回归（106 failed / 212 类型错误 与开工前一致）。

## 一、交付物

| 类 | 内容 |
|---|---|
| 代码 | `unverified` 第三态与验收两问（`AcceptSheet.ts` / `AcceptanceSheetSpec.ts` / `VerificationDoc.ts`）· 新域错误码 `system_item_disposition_required`（`errors.ts`）· 节流剩余毫秒（`DoneEvidenceSpec.ts`）· 收尾闭环判据（`Predicates.ts`）· 挂起 TTL（`limits.ts` / `PendingConfirmRegistry.ts`）· 计划引用两通道与门禁（`SubmitTool.ts` / `content-gate-wiring.ts` / `confirm-settle.ts`）· 投递回执说真话（`auto-advance-note.ts`）· 看板判据同源（`board.ts`）· K11（`kb-probe.mts`） |
| 测试 | 新增 **41 条**用例（含端到端六步演练 `tests/e2e-b918-drill.test.ts`） |
| 文档 | `docs/architecture/project-manual.md` 新增机制备忘「收尾门的三条硬约束」· `docs/knowledge/conventions.md` 的 C-14/C-15 补基线行 |
| 证据 | `tests/test-evidence.md`（含 covers 覆盖 48 张卡）· `evidence/e2e-drill.txt` · `evidence/t9-compat-regression.txt` · `reviews/t1-review.md` |

## 二、一句话结论（进归档索引）

把"完成了但其实没记账"的四种形态（验收无结果、系统项无处置、计划引用空转、收尾缺归档）补成代码级硬门，并让门禁自己的话可判定（K11）。

## 三、合并去向

| 去向 | 落了什么 |
|---|---|
| `docs/architecture/project-manual.md` | 新增机制备忘「收尾门的三条硬约束」：八条问题 → 结论 → 可跑判据；变更记录加一行 |
| `docs/knowledge/conventions.md` | C-14/C-15 补「基线：`命令`」行（K11 要求：声明豁免必须给基线） |

## 四、已知留白（不掩盖）

- **两次批准仅一次投递**的端到端用例未做（需装配假 jobs 的集成夹具）。
- **需活会话的后台任务往返**不可确定性复现，未纳入演练，也不声称已验。
- 会话审核中发现的**人工闸门认知错误**（复核/测试子卡 agent 其实可以关闭，我此前误判）已在本需求实施中纠正，不构成代码待办。
