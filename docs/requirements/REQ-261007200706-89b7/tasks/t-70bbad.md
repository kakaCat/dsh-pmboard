# t-70bbad ask_confirm 拦截清单全部写路径与 budget CAS 描述·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
ask_confirm 拦截清单全部写路径与 budget CAS 描述·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/ask-confirm-prompt.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:47:42.499Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：拦截清单改定性表述 + budget CAS 描述补齐 + 9 挂载工具名反向断言；三条判据全过

### 完成项

- ask_confirm 拦截清单改定性表述：『阻塞期间本窗口**全部写路径**（提交 / 拆分 / 推进 / 任务推进 / 修缮 / 知识层等写工具，以实际拦截面为准）』——不再枚举四工具名
- budget 父对象描述补 CAS 参数：『可带 expectedWindowIndex（CAS 号）：与你看到的窗口号一致才换窗，不一致拒绝并回当前号（防并发覆盖）』
- 测试更新：tests/ask-confirm-prompt.test.ts 新增用例——断言『全部写路径』在场、旧枚举串不在场，并逐个断言 9 个真实挂载工具名都不被枚举（4 passed）
- 与实现对齐取证：grep assertNoPendingConfirm 得真实挂载面 9 处（AdoptTask/ArchiveAmend/Decompose/Knowledge/Move/Regenerate/Submit/TaskMove/TaskRefs），旧文案只列 4 个——定性表述与 9 处不冲突
- 判据 1 grep『全部写路径』命中且无旧枚举 ✔；判据 2 budget 父描述含 expectedWindowIndex ✔；判据 3 ask-confirm-prompt.test.ts 4 passed ✔
- 回归：全量 vitest 与 t6 基线逐条比对——唯一差异 canceled-legacy-read 为已知并行抖动（单跑通过）；size-budget 与 SubmitTool.ts 517 行属**既有红**（t1 前基线即红，且该文件改动前 515 行已超 400），非本卡引入
- typecheck exit 0

### 改动文件

- `src/tools/AskConfirmTool/prompt.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `tests/ask-confirm-prompt.test.ts`

### 下一步

复核子卡：对照 FR-6 设计节核对

---
