# t-ee18ef 迁移与兼容：老写法、回滚开关、存量单据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
迁移与兼容：老写法、回滚开关、存量单据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/verify-item-result.test.ts 退出码 0：不带 results 的提交成功且 results_coverage==='legacy'；置 DSH_REQBOARD_NO_ITEM_RESULT=1 后结构化绑定关闭、裁决回旧口径（evidence[0] 兜底恢复）；存量 sheet 在提交前后快照相等。

## 实施方案（implementation）
src/domain/workflow/AcceptanceSheetSpec.ts 的 itemResultBindingEnabled 语义写清（关闭 = 不结构化绑定 + 恢复 evidence[0] 兜底）；src/application/use-cases/SubmitVerification.ts 让老写法 evidence 里 `id :: 结果` 未命中的键进 results_unmatched（不再静默），不带 results 时 results_coverage='legacy'；存量在册验收单不回写；tests/verify-item-result.test.ts 在同一文件内断言新旧两种口径。

## 上游产出摘要（dependsSummary）
- 提交侧：results 参数 + 逐项交代硬门 + 落结果
- 裁决口径与底线：零输入通过 / unverified / 放行判据

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T03:05:00.422Z，窗口 session-851897de-d884-4ab8-b689-160d66853eb4）

t6 完工：迁移与兼容三面（老写法 / 回滚开关 / 存量单据）全部落地

### 完成项

- 老调用方不带 results 照旧可用（整单证据语义不变）
- 回滚开关一行生效：提交不绑定 + 裁决回证据兜底
- 开关态在工具描述与开关注释里写清（两义不再混）
- 文本写法未命中键进回执，不再静默丢弃
- 存量在册验收单不回写、不回算
- 验收命令 15 项全绿；全量失败 68 ≤ 基线 106

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `tests/verify-item-result.test.ts`

### 下一步

t7：更正过期口径并补机制备忘

---
