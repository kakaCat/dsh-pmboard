# t-8eeed9 会话文本抽取：dialogue 查询与过滤规则

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
会话文本抽取：dialogue 查询与过滤规则

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
命令 pnpm test -- tests/query-dialogue 全绿；断言包含：产出不包含 tool/call、tool/result、reasoning、run_code 字样（反例）；时间序递增；limit 为 20 时返回不超过 20 条且 hasMore 一致；会话不可得时 available 返回 false，不返回空数组冒充没有对话。

## 实施方案（implementation）
新增 src/application/query/QueryDialogue.ts：复用现有 SessionProbeAdapter 的快照事件与持久化冷读两条取数路径；只保留用户消息与助手消息的文本块；排除工具调用、工具结果、推理块、run_code 包裹内容与过程叙述；系统消息由状态事件、断点、交接、挂起确认、验收裁决组装，措辞取台账原文，回填事件带 inferred 标；游标分页默认 20 条。

## 上游产出摘要（dependsSummary）
- 定死接口与降级契约（六端点 + 信封类型）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
