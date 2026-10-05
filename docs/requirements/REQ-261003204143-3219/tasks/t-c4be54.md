# t-c4be54 落地 answers 键共享常量并核对 schema 声明（修复卡）·复现

> 需求：REQ-261003204143-3219 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

## 在做什么
落地 answers 键共享常量并核对 schema 声明（修复卡）·复现

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <新增回归用例>` → 修复前失败、修复后通过（贴两次输出）

---
## 汇报 1（2026-10-03T13:59:53.657Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复现段完成：回归用例「修复前红、修复后绿」两次输出均已取得——摘常量键时 3 用例红且 tsc 在两处点名 workspace（capture-mapping.ts:262、CaptureTool.ts:31），恢复后 3 passed

### 完成项

- 修复前失败证据（反向演练②）：摘除 CAPTURE_ANSWER_KEYS 的 workspace → 契约用例 3 红（含键集断言点名漂移）+ tsc TS2353 两处点名 workspace
- 修复后通过证据：恢复键 → 契约用例 3 passed 全绿
- 辅以 t1 反向演练①：摘 schema 声明 → 2 红点名 answers.workspace → 恢复绿

### 下一步

修复段（t-d26141）：共享常量实现已落地，待登记改动文件

---
## 汇报 2（2026-10-03T14:00:09.344Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

补落盘凭证：反向演练②的红/绿输出摘要与结论已落盘到本卡文档（开工后由汇报写入）

### 改动文件

- `docs/requirements/REQ-261003204143-3219/tasks/t-c4be54.md`

---
