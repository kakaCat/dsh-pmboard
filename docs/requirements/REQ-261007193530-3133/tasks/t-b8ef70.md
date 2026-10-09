# t-b8ef70 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）·修复

> 需求：REQ-261007193530-3133 修复 reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

## 在做什么
修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）·修复

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/done-throttle-guidance.test.ts` → 转绿（贴命令与输出），且根因单独写明

---
## 汇报 1（2026-10-07T11:55:26.205Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

修复（FR-4）：throttleRemainingMs 单条读数 clamp 到 [0, throttleMs]

### 完成项

- DoneEvidenceSpec.doneThrottleRemainingMs 单条读数改 Math.max(0, Math.min(throttleMs, ...))
- 返回契约固定为 [0, throttleMs]：下界原有兜底保留，上界补 clamp

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`

---
