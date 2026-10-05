# t-5a3ed9 接上会话运行态读数，判定「哪条需求在跑」·研发

> 需求：REQ-261004210128-283d 看板卡片显示会话运行中动效（泳道图 + 列表）

## 在做什么
接上会话运行态读数，判定「哪条需求在跑」·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T13:31:53.260Z，窗口 session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9）

研发段：运行态读数与需求映射单点已落地，看板首次具备「某会话在不在跑」的判定能力。

### 完成项

- 新建 src/client/session-running.ts（读数 / 订阅 / 需求映射 / 重绘门控辅助）
- session-jump 的 list 类型补可选 subscribe
- client/types.ts 补 ClientWindowSeat 与 seats 声明
- 24 项行为自检全过（含席位真值表与五种降级路径）
- typecheck 对改动文件零错误；既有 session-jump + client-view 用例 63 项全绿

### 改动文件

- `src/client/session-running.ts`
- `src/client/session-jump.ts`
- `src/client/types.ts`

---
