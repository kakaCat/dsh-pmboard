# t-bebc07 验收裁决收口：两问一批 + 去占位 + 系统项必处置

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
验收裁决收口：两问一批 + 去占位 + 系统项必处置

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

npx vitest run tests/accept-sheet-tool.test.ts tests/domain/req-b918-gates.test.ts tests/domain/verification-doc.test.ts tests/pm-question-badge.test.ts → 全绿。**按实测收紧后的口径**（原卡面写"grep 未附实际结果 src/ 无输出"，实测发现该短语仍应作为 unverified 的**状态标签**存在，只是绝不能再作为裁决意见写入）：① 没有任何代码路径把该短语写进 sheet.items[].opinion（grep -rn "opinion.*未附实际结果" src/ 无输出）；② 通过但无实际结果 → 该项 status=unverified、opinion 为空、需求不归档；③ 系统项通过无处置 → 抛 system_item_disposition_required 且不留下半批已改记录（先验后改）；④ 每项两个弹框问题且 header 均带 PM 标志。

## 实施方案（implementation）
AcceptSheet.ts 每题拆两问（<id> 选项 + <id>#result 文本）；verdicts.ts 删占位兜底，通过且结果空 → unverified；系统项通过且处置空 → 整批拒绝 system_item_disposition_required；需求级全通过排除 unverified。

## 上游产出摘要（dependsSummary）
- 定门规纯函数与状态契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T08:53:29.126Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

这一步做完，什么变了：验收单再也不能"什么都没记就算通过"——点通过必须留下看到了什么，留不下就记「未复核」且需求不能归档；机器报出来的系统项缺口，不写处置就整批拒绝。

### 完成项

- 弹框每题两问（裁决 + 实际结果），删除占位文案兜底
- unverified 第三态：不计入通过、需求不得据此归档
- 系统项通过无处置 → 整批拒绝（system_item_disposition_required，先验后改）
- 验收文档新增未复核状态标签；第二问 header 带 PM 标志

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/domain/workflow/VerificationDoc.ts`
- `src/domain/errors.ts`
- `tests/accept-sheet-tool.test.ts`

---
