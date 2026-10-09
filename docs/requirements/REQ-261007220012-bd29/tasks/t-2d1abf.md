# t-2d1abf confirm_receipt 并入 ask_confirm(ticket)（S2）·联调

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
confirm_receipt 并入 ask_confirm(ticket)（S2）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T14:38:51.575Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S2 联调通过：回执链路九环节同效、注册面 25 一致；5 文件 38 例全绿。

### 完成项

- 回执链路九环节端到端核对：起门 pending+ticket / 未作答 confirmed=false / 肯定作答 confirmed+advanced+from+to / 否定作答 user_choice / 未知 ticket REQBOARD_UNKNOWN_TICKET / 跨窗口 ticket 拒绝 / 被中止挂起全键回执 / 过期基准 (interruptedAt ?? createdAt)+ttl
- 注册面三处一致：registry 25 / 磁盘目录 25 / register 25（apply-wiring I-2 与 registry-log 派生校验全绿）
- schema 面：ask_confirm parameters.properties 含 ticket；target 改可选后发起确认路径仍由用例拒绝缺 target
- 联调证据落盘 docs/requirements/REQ-261007220012-bd29/evidence/t-2d1abf-integrate.md

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-2d1abf-integrate.md`

### 下一步

复核子卡：对照设计 §接口契约（ask_confirm + ticket）逐条核对。

---
