# t-2be0cd 对话 Tab（一条流 + 系统消息 + 回复框）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
对话 Tab（一条流 + 系统消息 + 回复框）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-dialogue 全绿；断言包含：产物不包含 tool/call、reasoning、run_code 字样；系统消息与人类消息同容器且时间序一致；回复框选择器可见。

## 实施方案（implementation）
新增 src/client/views/dialogue-panel.ts：一条流（人与 agent 气泡 + 系统消息居中灰条），回填事件带回填标；底部回复框沿用现有评论提交链路；默认 20 条与加载更早的分页。不做内层滚动。

## 上游产出摘要（dependsSummary）
- 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T01:46:00.761Z，窗口 session-00af6c69-e55e-4878-8d4e-74056a439b01）

这一步做完，对话 Tab 读起来像聊天记录：人说的、agent 回的一条条排下来，阶段推进之类的机器事件以小字居中混在同一条流里。

### 完成项

- 一条连续时间线：人机气泡与系统消息混排按时间序
- 回填事件带标；不认识的机器事件丢弃并计数而非冒充人话
- 加载更早与就地检索齐备，回复框沿用既有链路
- 自测：23 例全绿，含变异验证过的反例

### 改动文件

- `src/client/views/panels/dialogue.ts`
- `tests/dialogue-panel.test.ts`

### 下一步

t16 渲染断言（内容与留痕）

---
