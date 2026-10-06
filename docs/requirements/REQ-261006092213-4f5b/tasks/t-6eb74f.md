# t-6eb74f 提交侧：results 参数 + 逐项交代硬门 + 落结果·联调

> 需求：REQ-261006092213-4f5b 验收项由 agent 实测完成：人只做审核员

## 在做什么
提交侧：results 参数 + 逐项交代硬门 + 落结果·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T02:07:57.420Z，窗口 session-851897de-d884-4ab8-b689-160d66853eb4）

联调：工具参数、返回体与落库形状在同一次真实调用里闭合

### 完成项

- 参数 schema 已声明 results 数组，元素含 ref/result/needsHuman/humanReason
- 元素 additionalProperties=false，未声明键不会被静默丢
- ref 的 kind 枚举与验收项来源四类逐一对应
- 返回体五个新键全部在 output schema 声明，绑定层不会拒收
- 真实调用链闭合：工具壳 → 用例 → 台账 → 返回体（25 项用例）
- 请求样例与期望响应一致：coverage=complete、bound=4、matched=4

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/application/use-cases/SubmitVerification.ts`

### 下一步

复核子卡：请独立复核者按设计逐条对照并自跑证据

---
