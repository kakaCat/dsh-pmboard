# t-c5c71f 原型登记不再产生挂起票 + 确认前移校验（不造空票）·复核

> 需求：REQ-261005200052-ce40 拦截要讲清理由：REQBOARD_CONFIRM_PENDING 必须说清为何被拦、拦的是谁、哪条出路真的通

## 在做什么
原型登记不再产生挂起票 + 确认前移校验（不造空票）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T12:16:50.864Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t2 复核段：N6 逆验证必红并逐字节还原；文案单点与真门路径未变；无偏离。

### 完成项

- 逆验证 N6（删掉前移校验）真跑必红：2 例失败（无产物 / 无计划两条都被打红）
- 逆验证后逐字节还原：AskConfirm.ts md5 ab9ff3385d769b49dba321ab850b72f0 前后一致
- 对照 design/interfaces.md：两句文案为单点（confirm-settle 的 missingArtifactMessage / missingPlanMessage），落章校验与前移校验共用
- 成功路径返回体不变已核：相邻四套件 35 例（ask-confirm / ask-confirm-blocking / confirm-pending-guard / pending-guard）全绿
- 登记侧改动已核：triggerAutoConfirm 仍用于 requirement / plan 两条真门路径，原型路径只留通知
- 探针翻转实测：auto_confirm = triggered:false + 原因，live pending ticket = undefined
- 无偏离；诊断探针的旧行为断言按计划留给 t4 转正

### 改动文件

- `src/application/use-cases/SubmitArtifact.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/confirm-settle.ts`
- `tests/submit-prototype.test.ts`
- `tests/ask-confirm-pending.test.ts`

### 下一步

父卡收口后开 t3（诊断投影与四处文案）。

---
