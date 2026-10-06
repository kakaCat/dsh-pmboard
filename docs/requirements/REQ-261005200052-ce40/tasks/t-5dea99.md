# t-5dea99 加守卫两谓词与判定序：无门/无产物的票不拦写路径·复核

> 需求：REQ-261005200052-ce40 拦截要讲清理由：REQBOARD_CONFIRM_PENDING 必须说清为何被拦、拦的是谁、哪条出路真的通

## 在做什么
加守卫两谓词与判定序：无门/无产物的票不拦写路径·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T12:14:40.443Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t1 复核段：判定序与设计逐条对上，真门不放宽；逆验证 N1/N2 真跑必红并逐字节还原；无偏离，一处 status 文案失真已排入 t3。

### 完成项

- 对照 design/architecture.md 数据流逐条核对：判定序＝注册表 → 台账缺（保守留挂）→ 落章 → 无门 → 无产物 → 拦，实现与设计一致
- 对照 design/interfaces.md：hasConfirmGateOf / hasConfirmableArtifactOf 签名与语义一致；门值域取自 ARTIFACT_CONFIRM_GATES，仓内无第二份 kind 名单（grep 已核）
- 真门不放宽已核：verification / requirement / design / decomposition 在册未落章仍拦；target=plan 有计划仍拦
- 零新 I/O 与零持久状态已核：只读既有 req，放行不写任何标记（读时谓词）
- 逆验证 N2（谓词④ 恒 false）真跑必红：3 例失败，含「有门且产物在册未落章 → 仍拦」
- 逆验证 N1（谓词④ 恒 true）真跑必红：1 例失败（无门票放行）
- 逆验证后逐字节还原：md5 ab9c7384c201ec4732416a9912b2dea4 前后一致
- 回归：pending-guard 14 例全绿 + 相邻四套件 42 例全绿 + tsc 退出码 0
- 遗留一处（已排入 t3）：reqboard_status 的 pending_confirms 仍按 pendingForWindow 列出无门票，其说明文案「非空即表示写路径会被拦」届时会失真，t3 用同一 facts 判据收口

### 改动文件

- `src/application/internal/pending-guard.ts`
- `tests/pending-guard.test.ts`

### 下一步

t2：原型登记删掉自动确认（只留通知）+ 确认调用前移校验，不造答不了的票。

---
