# t-b15fb4 看板 pending 票接线·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
看板 pending 票接线·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T16:27:46.851Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，接线与设计口径逐条对上：空态归容器、取数与摆放归接线、缺省时输出与改造前逐字节一致。

### 完成项

- IF-5 核对：客户端消费的就是服务端下发的六键（ticket/requirement_id/target/kind/created_at/interrupted）+ 加法式 interrupted_at/expires_at/remaining_ms；端到端用例证明字段名与类型对得上
- frontend.md §空态与降级核对：老服务端无键 → 宽松解析按 []（用例断言）；无票 → 横带零渲染；取数失败 → 既有整页错误态兜底（容器 error 分支备用，见 t9 复核段的偏离说明）
- frontend.md §交互路径核对：「去作答」跳既有确认区（与卡片 open-req 同款导航，不造第二个作答入口）；「重投」调 IF-4 的 /confirm/repost 并在回执里如实呈现（still-open / gone / unavailable）
- 实现纪律核对：buildBoard 第 7 参缺省空串 ⇒ 未接线 / 无票时输出与改动前逐字节一致（用例断言两次调用结果相等且不含横带类名）
- 偏离说明（如实记录）：设计写「pending_confirms.length>0 才渲染」由 t9 容器实现，本卡只负责**取数与摆放**（分层：容器管空态，接线管数据）——与 frontend.md 组件树的分层一致
- 命令：npx vitest run tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts tests/pending-ticket-row.test.ts → 全绿

### 改动文件

- `src/client/board-mount.ts`

### 下一步

测试段：跑本卡相关测试集并留命令与输出摘要

---
