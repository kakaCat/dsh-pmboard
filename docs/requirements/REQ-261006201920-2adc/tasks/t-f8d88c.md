# t-f8d88c 子卡落库回填接线（懒展开）·研发

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
子卡落库回填接线（懒展开）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T12:43:35.629Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

研发段交付：子卡落库即无占位符（回填接在唯一构造点 makeChild），目标命令 35 例全绿，RV-2 红绿两次留档。

### 完成项

- makeChild 改为先生成子卡 id，再以 requirementId/taskId/parentAcceptance 调 fillStageAcceptance 回填
- 回填结果同时用于 acceptance 与 implementation 嵌入段（两处同源，用例断言 implementation 含 acceptance 原文）
- expandSubtasks 与 regenerateChain 共用 makeChild，补链路径自动同口径（已加用例）
- 新增 tests/lazy-expand-backfill.test.ts（9 例）：全 20 个阶段展开零残留、两处同源、兜底可跑、req/taskId 真实值、补链同口径、存量卡不被追溯、零副作用
- 目标命令全绿：npx vitest run 三文件 → 3 files / 35 tests passed，exit 0
- git diff --stat：src/application/internal/lazy-expand.ts +16 -3；新增未跟踪文件 tests/lazy-expand-backfill.test.ts
- 反向演练 RV-2：关掉回填 ⇒ 该文件 5 failed exit 1；还原后 sha256 与演练前逐字节相同、复跑 35 passed exit 0

### 改动文件

- `src/application/internal/lazy-expand.ts`
- `tests/lazy-expand-backfill.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv2-backfill-off.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv2-restored-green.txt`

### 下一步

进入 t2 联调段：核对子卡落库路径与 design/interfaces.md 的对外签名不变

---
