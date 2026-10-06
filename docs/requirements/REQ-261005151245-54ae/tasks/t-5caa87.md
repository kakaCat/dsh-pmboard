# t-5caa87 用例接线（openWindow 与 handoffOwner 新建窗口）·研发

> 需求：REQ-261005151245-54ae 开窗补齐继承：新窗口写入标题并继承源窗口模式与 LLM 模型

## 在做什么
用例接线（openWindow 与 handoffOwner 新建窗口）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T07:40:37.728Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，开窗与交接这两条路都会去继承，而且继承失败不会把窗口判死。

### 完成项

- OpenWindow 入参加 title；顺序改为读画像 → 建窗（create 带 preset）→ 继承 → 投递；回执加 inheritance
- HandoffOwner 新建窗口路带回执，to_window 指定已有窗口时整体省略
- 用例级 T-01~T-14 全绿；handoff 新增两条断言全绿

### 改动文件

- `src/application/use-cases/OpenWindow.ts`
- `src/application/use-cases/HandoffOwner.ts`
- `tests/open-window-inherit.test.ts`
- `tests/handoff-owner.test.ts`

---
