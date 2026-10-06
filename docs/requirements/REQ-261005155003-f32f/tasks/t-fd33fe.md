# t-fd33fe 同步既有渲染断言（五处改动 + 两条新增）·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
同步既有渲染断言（五处改动 + 两条新增）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T14:27:09.737Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

研发段：两份测试文件按清单同步，另加两条新增断言与防删过头的加强断言

### 完成项

- report-shell.test.ts：均需人工确认 → 需人工确认，并加反向断言 not.toContain 旧文案
- report-shell.test.ts 新增两条：aria-describedby 指向节点文本等于服务端 consequence；详情页头部不渲染评论输入框（FR-13）
- report-firstscreen-gaps.test.ts：三处文案断言同步、auto 用例的空断言修正为真判据
- report-firstscreen-gaps.test.ts：评论列表用例改写为「头部无评论框 + 只读列表仍在」
- dialogue-panel.test.ts：回复框用例加强为断言输入框裹在 .dsh-pm-comment-form 内（防删过头）
- report-degrade.test.ts：阳性对照由 add-comment 换成 jump-session（头部评论框已删）
- 一条断言都没删：全部是把「存在」改成「不存在」或换判据

### 改动文件

- `tests/report-shell.test.ts`
- `tests/report-firstscreen-gaps.test.ts`
- `tests/dialogue-panel.test.ts`
- `tests/report-degrade.test.ts`

### 下一步

复核段：逐条数改动处数并核对无删除

---
