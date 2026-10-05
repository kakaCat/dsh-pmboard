# t-48dfcb 为详情与任务卡渲染补缺字段防御性降级

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
为详情与任务卡渲染补缺字段防御性降级

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/req-detail-ondemand.test.ts -t detail-defense 全绿：用 RequirementSummary 形状调 buildReqDetail 不抛异常且输出含「暂无评论」；renderComments(undefined)、renderComments(null)、renderComments([]) 三者输出逐字节相同。

## 实施方案（implementation）
改 src/client/views/stage-detail.ts（buildReqDetail/buildTabContents 对 comments/artifacts/plan/verification/archive/statusHistory/docLinks 按缺失兜底；评论计数统一全文 comments.length）；改 src/client/render/dom-utils.ts（renderComments 接受 undefined/非数组，输出与空数组逐字节一致的空态）；改 src/client/views/stage-panel.ts（任务卡评论同口径）；在 tests/req-detail-ondemand.test.ts 追加 TC-1/TC-8。

## 上游产出摘要（dependsSummary）
- 实现详情取数模块 req-detail-store 并落地 store 单测

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T12:33:47.191Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

这张卡做完，服务端少一个字段或多一个 null 时，详情页与任务卡按空态渲染而不是整块崩掉——把「一个字段缺失就把页面打没」这条脆弱面堵上。

### 完成项

- 三张子卡（研发/复核/测试）全部 done
- 交付：四个渲染文件的缺字段兜底 + 5 例防御用例（含本 bug 回归锚点）

### 改动文件

- `src/client/render/dom-utils.ts`
- `src/client/views/stage-detail.ts`
- `src/client/views/stage-panel.ts`
- `src/client/views/timeline.ts`

### 下一步

下一张卡 t-f075e2（详情接线）

---
