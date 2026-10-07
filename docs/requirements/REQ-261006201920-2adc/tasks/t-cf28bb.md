# t-cf28bb 覆盖原子写入与两通道透传

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
覆盖原子写入与两通道透传

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/result-override-reason.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-tool.test.ts 退出码 0；② 覆盖缺理由 ⇒ 报 code result_change_reason_required 且该项 result/resultSource/resultSuperseded/resultChangeReason 四个字段与裁决前逐字相等（台账零改动）；③ 覆盖生效时四元组一次写全，重复覆盖后 resultSuperseded 仍等于最初那次 agent 原文（TC-13/TC-14）；④ 人未改动预填值（文本与 agent 原文相同）⇒ 三个新字段一个都不写（TC-15）；⑤ 不传 changeReason 且不构成覆盖 ⇒ HTTP 200 不报错；⑥ DSH_REQBOARD_NO_ITEM_RESULT=1 时四字段一个都不写；⑦ 反向演练 RV-4 两次输出留档

## 实施方案（implementation）
改 src/application/internal/verdicts.ts：VerdictInput 增可选 changeReason；在既有「人改结果」写入块里判定覆盖（该次裁决带文本 且 与该项现有 result 不同 且 resultSource==='agent'），覆盖生效时一次性写全 result / resultSource='human' / resultSuperseded（首次覆盖写入，重复覆盖不覆盖该字段）/ resultChangeReason；缺理由时抛 VerdictError code='result_change_reason_required'，文案给「可不覆盖 / 或补理由」两条路，且台账零改动（保持 agent 原文与 agent 来源）；回滚开关 DSH_REQBOARD_NO_ITEM_RESULT 生效时整段跳过；materializeReworkTask 把规格里的 requirementRefs/prototypeRefs/decisionRefs/footprint/acceptanceSource 搬到 TaskRecord。改 src/http/routers/verdicts.ts：从 body.verdicts[] 解析 changeReason（normalizeText 上限 1000）并透传，不构成覆盖时缺字段不报错。改 src/application/use-cases/AcceptSheet.ts：第一轮问答后对会被判为覆盖的项补一轮问答（问题 id 形如 <itemId>#change-reason），未作答即不执行覆盖并按未覆盖记录裁决，不拒绝整批。新增 tests/result-override-reason.test.ts（TC-13/TC-14/TC-15）。验证：npx vitest run tests/result-override-reason.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-tool.test.ts；反向演练 RV-4：把覆盖理由校验改成恒真 ⇒ 「缺理由即拒」变红，还原后绿。

## 上游产出摘要（dependsSummary）
- 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:11:22.100Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

t4 完成：覆盖必须带理由且原文不丢（写入原子），两通道同源，错误码与回执文案的既有缺口一并修掉。

### 完成项

- 覆盖成为**原子四元组**：result + resultSource=human + resultSuperseded（agent 原文）+ resultChangeReason（理由），同一循环内依次写全
- 两条写路径分开：首次填写（本无实测结果）只写 result + 来源；覆盖额外写原文与理由——修掉了初版把它们混为一谈导致「首次填写也要求理由」的回归
- 缺理由即拒且**台账零改动**：前置校验排在 applySheetVerdicts 之前（先整批验证、后落状态）
- 重复覆盖保留最初那次 agent 原文（resultSuperseded 只在首次写）
- 两通道同源：看板通道解析透传 changeReason；弹框通道补问一轮（问题 id 形如 <itemId>#change-reason），未作答降级为未复核、不报废整批
- 错误码补登记为 400：result_change_reason_required（新增）与 system_item_disposition_required（既有缺口，此前经看板裁决会落 500）
- 回执文案改读权威的 isFullyDecided——原先读 isFullyDecidedItems，判不出「处置无效」，会出现文案说可归档而门禁拦下的两处相反口径
- 新增 tests/result-override-reason.test.ts 8 例；更新 verdicts-http 的覆盖用例为断言四元组并新增「缺理由 → 400 且零改动」
- 反向演练 RV-4：校验改成恒真 ⇒ 2 failed exit 1；还原 sha256 逐字节相同、复跑 15 passed exit 0
- 四段子卡链全部 done：研发 / 联调（契约 10/10）/ 复核（设计 10/10，登记一处刻意收紧）/ 测试（集合差零新增）

### 改动文件

- `src/application/internal/verdicts.ts`
- `src/http/routers/verdicts.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `src/http/envelope.ts`
- `src/shared/protocol.ts`
- `tests/result-override-reason.test.ts`
- `tests/verdicts-http.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv4-override-reason-off.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv4-restored-green.txt`

### 下一步

批 4 开工 t5：客户端 UI 卡（变更理由输入 / 原文保留展示 / 归档门可见），按权威原型 prototypes/verify-disposition.html#FR-3 与 #FR-4

---
