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
## 汇报 1（2026-10-05T01:28:13.418Z，窗口 session-00af6c69-e55e-4878-8d4e-74056a439b01）

这一步做完，对话 Tab 有了真数据源与真分页：一条连续时间线里只有人机文本与系统消息，工具与推理在服务端就被剔掉；会话读不到时会明说不可用，不会显示成「没有对话」。

### 完成项

- 对话一条流查询落地：服务端结构性排除工具调用、工具结果、推理、run_code 与过程叙述
- 系统消息（阶段推进、计划退回、交接、中断、挂起确认、验收裁决）取台账原文并带回填标
- 偏移游标分页：默认 20 条、上限夹取、下一页游标直接可喂回，三页不重不漏
- 会话事件读端两条腿接上：活窗口快照与冷会话持久化读，读不到与读到为空严格分开
- 自测：13 例全绿（含变异验证过的反例断言）；typecheck 零错误

### 改动文件

- `src/application/query/QueryDialogue.ts`
- `tests/query-dialogue.test.ts`
- `src/application/ports.ts`
- `src/adapters/SessionProbeAdapter.ts`

### 下一步

t6 接线六条只读路由（依赖 t3/t4/t5/t2）

---
