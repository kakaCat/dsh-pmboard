# t-5ad80b confirm_receipt 并入 ask_confirm(ticket)（S2）·复核

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
confirm_receipt 并入 ask_confirm(ticket)（S2）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007220012-bd29/design/` 逐条核对；`npx vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T14:39:04.719Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S2 复核：P-1~P-7 无偏离，4 条不阻断偏离已登记；13 文件复跑全绿。

### 完成项

- 对照设计 §接口契约（ask_confirm + ticket）逐条核对 7 项：P-1~P-7 无偏离（含「返回体零新增键」「用例原样复用」「旧工具名零命中」）
- 偏离登记 4 条（不阻断）：D-1 target 由 required 放宽为可选（否则 ticket-only 调用在绑定层被 ToolArgsError 拒、FR-2 不可达；发起确认路径的校验仍在用例层）；D-2 渲染收敛为单入口（render 拿不到分派路径，且设计要求零新增输出键；渲染信息不丢）；D-3 历史负向断言收紧为「不含重新发起的指令」（意图保留）；D-4 P1 基线夹具按流程重跑
- 复核复跑 13 个测试文件全绿
- 复核证据落盘 docs/requirements/REQ-261007220012-bd29/evidence/t-5ad80b-review.md

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-5ad80b-review.md`

### 下一步

测试子卡：跑 FR-2 五条判据 + 全量回归与基线对照。

---
