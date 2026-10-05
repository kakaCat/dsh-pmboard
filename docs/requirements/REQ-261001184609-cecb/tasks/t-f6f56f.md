# t-f6f56f 材料即结果：提交验收材料时逐项绑定·测试

> 需求：REQ-261001184609-cecb 验收不再要人填结果：agent 跑完验证自己落章，人只点通过

## 在做什么
材料即结果：提交验收材料时逐项绑定·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-01T10:53:19.304Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

t2·test：绑定函数落地并接入提交入口；无 :: 的老写法行为不变。

### 完成项

- bindItemResults 纯函数
- 接入 SubmitVerification
- 用例 4/4 绿

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/verify-item-result.test.ts`

### 下一步

父卡收尾

---
