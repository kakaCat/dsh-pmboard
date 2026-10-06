# t-3cd4ac 对话面板聊天化（气泡/吸顶分页/只读）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
对话面板聊天化（气泡/吸顶分页/只读）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/dialogue-panel 全绿（T-7~T-11）：产物无 data-role=comment-input、无 data-dialogue-search、有只读说明行；气泡三态类名在；pager 是 scroll 第一个子元素；正序断言过；标本 #tab-dialogue 截图对照原型 #FR-6 气泡/吸顶条/只读行

## 实施方案（implementation）
① panels/dialogue.ts：消息改气泡（data-msg=human/agent/system；人靠右蓝实心+右头像「人」；窗口/agent 靠左浅紫+左头像 w/a+名字签；系统居中灰丸，inferred 带 data-inferred 琥珀标）；时间戳 10.5px 等宽入名字签行；长日志气泡折叠+展开。② 分页条移入 .chat-scroll（460px，data-chat-scroll）内部第一个子元素 position:sticky;top:0（data-chat-pager；浅蓝底工具条：实心「↑ 加载更早消息」+加粗「第 N/M 页」+「已加载 x/y 条」）；pageKnown=false 降级不可用态。③ 删底部回复框（data-role=comment-input）与检索框；原位置只读说明行「历史聊天记录 · 只读 —— 共 N 条，本页 M 条」。④ 保持服务端过滤不变量（不读 tool/reasoning 字段）。⑤ styles/report.ts 气泡/吸顶样式（只引 --pm-*）。⑥ 同步 dialogue-panel 断言（T-7~T-11：只读断言、气泡三态、吸顶结构、正序、过滤不变量保留）。验证：npx vitest run tests/dialogue-panel 全绿 + 标本 #tab-dialogue 截图对照原型。

## 上游产出摘要（dependsSummary）
- 服务端契约：verify 端点 + 对话分页游标

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:29:24.308Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t7 对话面板聊天化完成：气泡/吸顶分页/只读三要素落地，四段（研发/联调/复核/测试）全过，联调与复核各抓出并修复一处真缺陷。

### 完成项

- 对话面板聊天化：气泡三态（人右蓝/窗口·agent 左紫/系统灰丸）+吸顶分页条（460px 滚动豁免唯一）+只读历史记录（删回复框与检索框）
- 联调修复：加载更早按钮白底白字（补 primary 类）
- 复核通过无 P0/P1：十条核对点全过、五条偏离裁决可接受
- P2 清理：7 处死选择器 + 3 处死注释已删/勘误
- 测试：dialogue-panel 24/24、范围回归 196/196、tsc 零错、client 重建 OK

### 改动文件

- `src/client/views/panels/dialogue.ts`
- `src/client/views/report-tabs.ts`
- `src/client/styles/report.ts`
- `src/client/render/md-inline.ts`
- `src/client/board-mount.ts`
- `tests/dialogue-panel.test.ts`
- `tests/report-content.test.ts`
- `tests/report-shell.test.ts`
- `tests/report-degrade.test.ts`
- `tests/md-inline.test.ts`

### 下一步

t3 验收面板开工（接缝：只换 verifyPanel.render 为 RTM 列表）

---
