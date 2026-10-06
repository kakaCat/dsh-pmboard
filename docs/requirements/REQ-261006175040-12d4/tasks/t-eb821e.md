# t-eb821e 卡面渲染改为只读读数（删客户端判定）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
卡面渲染改为只读读数（删客户端判定）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
pnpm vitest run tests/card-face.test.ts 全绿：三态 chip 文案逐字对齐原型；派生行只出 门 c/total（不再有 产物 N/M 与 N 门待确认）；当前门 pending 才渲染确认按钮（design 文案带 count）；planState/archivePrepared 缺省时不渲染对应 chip；grep -c computeGateStatuses src/client 为 0。

## 实施方案（implementation）
改 src/client/views/artifacts.ts：删 computeGateStatuses，chips/派生行（只留 门 c/total）/renderConfirmButton/planChip 改读 req.gates 与 req.planState；改 src/client/views/verification.ts 的 verifyChip/archiveChip 读读数；改 src/client/views/board.ts 列表行「归档材料待补」读 archivePrepared；改 src/client/types.ts 加 GateReading 与三个可选键；改 tests/card-face.test.ts 夹具为摘要形状并补三态/按钮/缺省断言。

## 上游产出摘要（dependsSummary）
- 摘要补三个有界键并把装配收成单点

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:43:02.439Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

t6 完成：卡面不再自己判门，四处渲染改读服务端读数；派生行改「门 c/总数」，确认入口按读数在场，读数缺省整块不渲染。测试夹具改为摘要形状（21 passed），客户端 bundle 重建通过。

### 完成项

- 新增 src/client/render/gate-view.ts：读侧 helper（gatesOf / gateOf），四处渲染共用一种读法
- artifacts.ts：删掉就地读 artifacts 的那份门判定；chips / 派生行 / 确认按钮 / planChip 全部改读读数
- 派生行只出「门 c/总数」（旧「产物 N/M」与「N 门待确认」两段删除，与原型 FR-3 定稿一致）
- 确认按钮：当前门 pending 才在场；design 文案份数取读数 count；missing / confirmed / 读数缺省 一律不给按钮
- verification.ts：verifyChip 读 verification 门读数、archiveChip 读 archivePrepared；读数缺省即不渲染
- board.ts：列表行「归档材料待补」改读 archivePrepared（原 closingGapOf 会因摘要无大字段而每行假红）
- types.ts：新增 GateReading 类型与 gates / planState / archivePrepared 三个可选键
- tests/card-face.test.ts 整体重写为**摘要形状夹具**并补三态 / 派生 / 按钮 / 缺省 / 列表行用例 → 21 passed
- 施工事故与恢复（如实记录）：一次区间替换误删了 renderReqCard / cardActions / renderCardTime，测试立刻报 renderReqCard is not a function，已按原文完整恢复并由 21 条用例验证
- 命令证据：pnpm build:client → [verify-client] OK；pnpm typecheck 仅剩外部错（vendor 路径 + 另一窗口 18:42 在改的 confirm-settle.ts 两条 TS6133）
- 原型对照：FR-3 待定项按设计定为只留 门 c/总数；FR-4 按钮在场/缺席、FR-6 整块不渲染均与 prototypes/card-gates.html 一致

### 改动文件

- `src/client/render/gate-view.ts`
- `src/client/views/artifacts.ts`
- `src/client/views/verification.ts`
- `src/client/views/board.ts`
- `src/client/types.ts`
- `tests/card-face.test.ts`

### 下一步

t7：跨缝用例（只喂摘要字段的渲染断言，改动前必红）

---
