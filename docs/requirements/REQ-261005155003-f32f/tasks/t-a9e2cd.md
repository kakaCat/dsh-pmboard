# t-a9e2cd 真删详情页评论输入框并保住对话 Tab 评论链路·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
真删详情页评论输入框并保住对话 Tab 评论链路·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T14:23:45.410Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

研发段：头部评论输入框真删，对话 Tab 评论链路逐字保留

### 完成项

- report-head.ts 删除头部评论输入框分支（含 data-role=comment-input 与头部 data-action=add-comment）
- buildCommentList 的只读列表原样保留（在途与终态都渲染 data-comment-list）
- 对话 Tab 的评论表单与 add-comment 通道一字未动（panels/dialogue.ts）
- 核对 board-mount.ts 的 commentInputOf：按 closest(.dsh-pm-comment-form) 作用域取，头部那处删掉后对话 Tab 仍取得到
- 实测：头部 add-comment / comment-input / comment-form 均 0 次；comment-list 1 次
- 实测：对话 Tab comment-form / add-comment / comment-input 各 1 次

### 改动文件

- `src/client/views/report-head.ts`

### 下一步

复核段：独立核对头部与对话 Tab 两侧的渲染计数

---
