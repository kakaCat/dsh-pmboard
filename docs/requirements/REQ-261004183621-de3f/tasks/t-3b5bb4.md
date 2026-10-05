# t-3b5bb4 漏登当场见：提交时对账，不处置就不让过·研发

> 需求：REQ-261004183621-de3f 归档清单自动收录需求目录内文件（未列即拦或自动补）

## 在做什么
漏登当场见：提交时对账，不处置就不让过·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T10:43:04.200Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，漏登不再只是事后一句没人看的警告：提交归档时系统当场对账，既没列进清单、又不属于豁免文件的，会被直接拦下并告诉你两条路——要么收进清单，要么写明为什么不收。归档记录、评论与工具回执里都能看到这次对账的结论；如果嫌太严，一个开关就能退回旧的只警告不拦。

### 完成项

- 对账前移到写台账之前：未列未豁免且未声明 → 当场拒绝，台账与评论零改动
- 三分类落地（已列/豁免/未列）+ 单次遍历（不再第二次遍历第二份口径）
- unlisted_ack 三类校验：覆盖不全 / 路径不在未列集合 / 空理由分别拒
- 闸门 enforce（缺省）/ warn 两态；warn 下照常写对账结果与留痕
- 对账结果落归档记录 + 评论摘要 + 返回体 reconcile（保留 unlisted_files/warning 兼容）
- 工具 schema 增 unlisted_ack 入参与 reconcile 出参
- 8 条新用例全绿；既有归档与产物门禁回归 44 条全绿

### 改动文件

- `src/application/use-cases/SubmitArchive.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/ports.ts`
- `tests/archive-reconcile.test.ts`
- `tests/helpers/tool-deps.ts`

### 下一步

联调子卡：确认既有调用方（含 agent-dh 前缀形态）走通对账。

---
