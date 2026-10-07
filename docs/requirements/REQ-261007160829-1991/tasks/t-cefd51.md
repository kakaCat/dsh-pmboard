# t-cefd51 弹框侧接线（题干形态提示 + 回执分派）·研发

> 需求：REQ-261007160829-1991 修复：needsHuman 验收项经弹框永远无法通过（多问只渲染第一问）

## 在做什么
弹框侧接线（题干形态提示 + 回执分派）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/accept-result-question-wording.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T09:01:10.667Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

研发段：弹框第 2 问题干写形态要求，回执按真实原因分派补法（文案单点）。

### 完成项

- 第 2 问题干追加 ACCEPT_RESULT_FORM_HINT（与提交侧拒绝共用同一常量）
- 未复核回执改为 summary + advice 拼装，删掉写死的归因句
- reason 取值：单一原因才传，混合或老数据传 undefined（中性措辞）
- 无未复核项时返回空串并加守卫，failed/pending 两条分支一字未动
- tests/accept-result-question-wording.test.ts 追加 3 条接线用例
- 既有 91 条断言零改动；本窗口复跑 4 文件 87 passed、typecheck 退出码 0

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `tests/accept-result-question-wording.test.ts`

### 下一步

联调段：核回执键集与相邻用例。

---
