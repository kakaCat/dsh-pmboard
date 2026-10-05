# t-1ece44 交接用例与 reqboard_handoff 工具·研发

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
交接用例与 reqboard_handoff 工具·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T07:54:13.120Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

研发段落地：交接编排（授权 → 判据 → 开窗 → 一次写台账 → 自署投递 → 回执）与 reqboard_handoff 工具壳。

### 完成项

- HandoffOwner 用例：owner 授权、目标窗口校验、开窗、写台账、投递、回执六步
- 工具壳 reqboard_handoff（参数 reason/mode/to_window + 回执 schema + 摘要渲染）
- 自主边界：非顶墙档必须写明 reason，读数不可得直接拒
- 投递红线：kind 自署且永不为 user

### 改动文件

- `src/application/use-cases/HandoffOwner.ts`
- `src/tools/HandoffTool/HandoffTool.ts`
- `src/tools/HandoffTool/prompt.ts`
- `src/tools/index.ts`

### 下一步

联调段

---
