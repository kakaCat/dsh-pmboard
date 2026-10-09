# t-dab9cc 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）·回归测试

> 需求：REQ-261007193530-3133 修复 reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

## 在做什么
修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）·回归测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 无新增失败（与基线比对，贴汇总输出）

---
## 汇报 1（2026-10-07T11:59:59.408Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

回归（FR-4）：done-throttle 新增 clamp 边界用例

### 完成项

- tests/done-throttle-guidance.test.ts 新增 3 条用例（未来时间戳 ≤60s / 正常历史 50s 不变 / 超窗 0）
- 本文件 9 条全绿；反证：回退 clamp 后未来时间戳用例失败
- 全量基线比对：未引入新失败；pnpm typecheck exit 0

### 改动文件

- `tests/done-throttle-guidance.test.ts`

---
