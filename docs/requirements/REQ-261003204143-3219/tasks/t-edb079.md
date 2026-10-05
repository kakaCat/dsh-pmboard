# t-edb079 验证契约用例能抓住漂移（复现卡）·取数调研

> 需求：REQ-261003204143-3219 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

## 在做什么
验证契约用例能抓住漂移（复现卡）·取数调研

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
数据样本量与来源已标注：给出取数命令（如 `npx tsx scripts/<脚本>.mts`）或输出文件路径，对齐 R-013 来源与时点口径

---
## 汇报 1（2026-10-03T13:41:05.211Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

反向演练①数据已取齐：临时摘除 CaptureTool.ts 的 workspace 声明后契约用例必红且点名 answers.workspace，恢复后全绿——证明该用例确实能抓住本次漂移形态。命令：npx vitest run tests/capture-output-contract.test.ts（摘除态 2 failed / 恢复后 2 passed）

### 完成项

- 摘除态运行：2 用例全红，违例原文点名 value.answers.workspace is not a declared property（与 20:44 生产实测逐字一致）
- 恢复后重跑：2 用例全绿（Test Files 1 passed）
- 未遗留任何摘除态改动：工作区 CaptureTool.ts 与演练前备份逐字节一致（仅保留并行窗口的 workspace 修复）

### 下一步

分析卡（t-6bf6ca）：据本数据定「用例能抓住漂移」结论

---
