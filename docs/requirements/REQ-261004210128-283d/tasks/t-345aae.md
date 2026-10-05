# t-345aae 泳道卡与列表行显示运行中转圈·测试

> 需求：REQ-261004210128-283d 看板卡片显示会话运行中动效（泳道图 + 列表）

## 在做什么
泳道卡与列表行显示运行中转圈·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T13:37:30.230Z，窗口 session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9）

测试段：泳道与列表两处的显示/隐藏、零回归与不误报共 6 组断言落库并全绿。

### 完成项

- TC-08 传 running 集合：泳道卡 data-running 恰 1 次且 aria-label 非空；同输入两次调用逐字节相等
- TC-09 省略 running：输出不含 data-running，且与显式传空集逐字节一致（旧调用点零回归）
- TC-09b 无关会话在跑不误报；TC-09c 人工建卡不误报；TC-09d 多席位 worker 在跑会显示
- TC-10 列表视图同款指示；列表与泳道在同一集合下同时出现/消失
- npx vitest run tests/client-view.test.ts tests/token-card.test.ts tests/client-styles-ownership.test.ts → 67 项全绿

### 改动文件

- `tests/client-view.test.ts`

---
