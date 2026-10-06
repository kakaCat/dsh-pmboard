# t-2edc3a 原型登记不再产生挂起票 + 确认前移校验（不造空票）·研发

> 需求：REQ-261005200052-ce40 拦截要讲清理由：REQBOARD_CONFIRM_PENDING 必须说清为何被拦、拦的是谁、哪条出路真的通

## 在做什么
原型登记不再产生挂起票 + 确认前移校验（不造空票）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T12:16:28.186Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t2 研发段：原型登记不再产生挂起票（只留通知），确认调用在登记票之前先校验可落章，不造答不了的票。

### 完成项

- SubmitArtifact.ts 第 ⑤ 步删除 triggerAutoConfirm(kind=prototype)：原型改为登记即生效，只保留通知，不再登记挂起票
- auto_confirm 返回如实投影为 triggered:false + 原因（不再谎报已请人确认）
- AskConfirm.ts 在 port.register 之前加两条前移校验：无该 kind 产物抛 REQBOARD_MISSING_ARTIFACT、无计划抛 REQBOARD_MISSING_PLAN
- 两句文案抽成 confirm-settle 的 missingArtifactMessage / missingPlanMessage 单点，落章校验与前移校验共用同一措辞
- tests/submit-prototype.test.ts 新增 FR-1 用例：登记后 pendingForWindow 为空且 assertNoPendingConfirm 放行
- tests/ask-confirm-pending.test.ts 新增两例：无产物 / 无计划均在登记票之前被拒且票表为空
- 证据：npx vitest run 两套件 → 33 例全绿（20 + 13）
- 诊断探针翻转实测：auto_confirm=triggered:false、live pending ticket=undefined（旧行为断言按计划由 t4 转正）
- npx tsc --noEmit -p tsconfig.json → 退出码 0

### 改动文件

- `src/application/use-cases/SubmitArtifact.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/confirm-settle.ts`
- `tests/submit-prototype.test.ts`
- `tests/ask-confirm-pending.test.ts`

### 下一步

复核段：跑逆验证 N6（删掉前移校验必须打红），并核对前移校验不改变成功路径返回体。

---
