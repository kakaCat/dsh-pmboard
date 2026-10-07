# t-df4bcf 归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
归档条三态渲染 + 详情「在别处」提示块接线（沿用权威原型）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
跑 npx vitest run tests/board-archived-origins.test.ts 全绿，逐条断言：① kind=local → 输出含 data-src="local" 与「本仓」文本；② kind=elsewhere → 含「别处」与项目名，且 data-project 属性等于项目名；③ kind=unknown → 含「归属未知」且不含「本仓」字样；④ origins 缺该 req 键 / 整参缺省 → 输出不含 dsh-pm-archived-src（逐字降级）；⑤ 既有 data-action/data-req/data-status 属性仍在（回归钉）；⑥ 详情提示块在 elsewhere/unknown 两态出现、local 态不出现，且 stage-detail/report-tabs 不传新参时输出与改动前逐字节相同。

## 实施方案（implementation）
① 改 src/client/views/board.ts 的 renderArchivedBar(cards, limit, origins?)：新增 span.dsh-pm-archived-src[data-src] 与包标题的 span.dsh-pm-archived-text、包 id 的 span.dsh-pm-archived-id；origins 缺键或缺整参 → 不渲染标注（逐字降级）；② 改 src/client/styles/base.ts：新增选择器 ≤4 条（.dsh-pm-archived-src 三态 + .dsh-pm-archived-text），令牌只用既有 --dsw-*/--pm-*，C 态用 --pm-c-warn + 虚线边框（非颜色编码）；③ 改 src/client/board-mount.ts：把 state.origins 传给 renderArchivedBar；④ 给 src/client/views/stage-detail.ts 与 src/client/views/report-tabs.ts 各加一个可选入参，复刻提示块（复用既有 .dsh-pm-cprog-panel-note，零新增选择器；不越界读别的项目工作区）；⑤ 扩 tests/board-archived-origins.test.ts 或新建渲染断言覆盖三态与降级。

## 上游产出摘要（dependsSummary）
- /state 派生 origins：服务端一处判项目来源三态（local / elsewhere / unknown）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:27:38.750Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

t9 全卡完成：看板归档条说清结论在哪，跨项目不再是一片空白。

### 完成项

- 四条子卡全 done：研发/联调/复核/测试各有汇报与读数
- 归档条按项目来源渲染三态：本仓 / 别处·项目名 / 归属未知，data-src 与 data-project 齐
- 详情两处提示块接线；缺 origins 时逐字降级，旧输出逐字节不变
- 新增选择器恰好 4 条、仅用既有令牌；client 产物已重建且校验 OK
- 判据：board-archived-origins 28/28

### 改动文件

- `src/client/views/board.ts`
- `src/client/styles/base.ts`
- `src/client/board-mount.ts`
- `src/client/views/stage-detail.ts`
- `src/client/views/report-tabs.ts`
- `src/client/types.ts`
- `tests/board-archived-origins.test.ts`

### 下一步

t12 反向演练组（脚本由子代理落地中）

---
