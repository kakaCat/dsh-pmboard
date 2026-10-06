# t-8fb41e 对话面板聊天化（气泡/吸顶分页/只读）·研发

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
对话面板聊天化（气泡/吸顶分页/只读）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T09:10:25.642Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t7 研发完成：对话面板改聊天 App 形态（气泡三态+吸顶分页+只读历史记录），回复框与检索框删除干净，24/24 + 190/190 绿，tsc 零错。

### 完成项

- dialogue.ts 重写为聊天气泡：人靠右蓝/窗口·agent 靠左紫/系统居中灰丸+回填标；时间戳入名字签；长日志 details 折叠+收纳标
- 吸顶分页条：.chat-scroll 460px 内第一个子元素 sticky（实心加载更早+第 N/M 页+已加载 x/y），pageKnown=false 降级态
- 删回复框与检索框（含 report-tabs.ts 的 input 接线与全部死代码），原位只读说明行
- report.ts ⑧ 段置换为 FR-6 标记块（只引 --pm-*）；片头硬约束注释写明 chat-scroll 唯一豁免
- 测试 T-7~T-11 改写：dialogue-panel 24/24 绿；波及 8 套件 190/190 绿；tsc 零错
- 偏离四条均合理留痕（检索接线实际在 report-tabs.ts；无任务 id 不编名字签；长日志阈值 120 字符同 FR-3 口径；死选择器残留属并行卡块未动）

### 改动文件

- `src/client/views/panels/dialogue.ts`
- `src/client/views/report-tabs.ts`
- `src/client/styles/report.ts`
- `tests/dialogue-panel.test.ts`
- `tests/report-content.test.ts`
- `tests/report-shell.test.ts`
- `tests/report-degrade.test.ts`

### 下一步

t7 联调子卡：标本渲染对话面板核对气泡/吸顶/只读行

---
