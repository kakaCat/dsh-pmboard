# t-c2e4b8 旧数据与旧端兼容验证·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
旧数据与旧端兼容验证·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T16:29:56.761Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，兼容矩阵的覆盖面被逐条对到 FR 上：四条在本文件、两条在各自实现卡，没有漏面也没有重复。

### 完成项

- 覆盖度核对（对照 data-model.md 兼容矩阵与六条 FR）——本矩阵覆盖：FR-2/FR-1（旧留痕零迁移 + 拒绝粘滞）、FR-3（旧答案值映射）、FR-5（老服务端无 pending 键 → 客户端按 []）、FR-6（旧调用方根解析行为不变）
- 另两处 FR 的兼容面已在各自实现卡内验证、不重复：FR-1 的 askTimed 越界/中立回执（tests/ask-timed.test.ts、tests/confirm-repost.test.ts）、FR-4 的文案口径归零（tests/capture.test.ts、output-contract 族）
- 设计口径核对：data-model 兼容矩阵要求「旧文件/旧端不迁移、缺省语义明确」——本矩阵逐条对上（旧条目 kind 缺省 = reject；老端缺键 = 空数组；旧调用方行为逐字不变）
- 观察记录（供人复核，不阻塞）：本需求选的是「同一份留痕文件 + 可选 kind 字段」而不是设计 IF-6 写的「新文件 + 读时合并旧文件」——t5 的复核卡已如实记录该偏离；好处是旧文件零迁移、不可能出现两份真相，代价是文件名仍是 capture-rejections.json（内容已扩为三类交互）
- 命令：npx vitest run tests/compat-matrix.test.ts tests/capture-interactions.test.ts tests/capture-tool.test.ts → 全绿

### 改动文件

- `tests/compat-matrix.test.ts`

### 下一步

测试段：跑本卡相关测试集并留命令与输出摘要

---
