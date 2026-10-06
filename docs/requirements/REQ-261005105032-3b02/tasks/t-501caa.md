# t-501caa 加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/move-gate-paths.test.ts 全绿：S-1 标本（feature + sides 含 frontend + 无已登记 prototype）走四条路径全部返回 prototype_missing，会话侧传输码均为 REQBOARD_MISSING_PROTOTYPE；同标本把 G2（设计文档集）置为失败时四条路径也都拒（双锁）；人为注释掉任一调用点后重跑 → 对应用例红（四条各一次）。npx vitest run tests/artifact-gates.test.ts tests/design-gates.test.ts 既有用例零回归；pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 src/application/internal/content-gate-wiring.ts：新增唯一的 async helper contentGatesForMove(docs, req, from, to)，内部按 (from,to) 分派——brainstorming→design 依次跑 checkPrototypePresenceGate → checkPrototypeVersionGate → checkPrototypeAnchorsGate → checkDecisionLogGate，短路返回首个 GateFailure；其余转移与非 UI（sides 不含 frontend）或非 feature/refactor 需求返回 undefined。四条路径在同步门之后调用它：① src/application/use-cases/MoveRequirement.ts（assertArtifactGates 之后、G2 判定之前）；② src/application/use-cases/AskConfirm.ts 的推进块（新增接线，失败 → advanced:false + 门消息）；③ src/http/routers/requirements.ts 的 handleReqMove（preGate 之后、g2CompletenessFailure 之前，mutate 内复查）；④ src/application/use-cases/ConfirmArtifact.ts（advanceTargetFor 命中且未显式关闭推进时，失败 → advanceNote 追加门消息、不推进）。不动同步单点 assertArtifactGates 的签名与职责，不合并既有 G2 调用。回归写成一个文件 tests/move-gate-paths.test.ts：对四条入口各断言一次，且同时断言既有 G2 仍生效；逐条注释掉任一调用点该用例必须红。依据 design-brief §2 与 §10 #22/#46。

## 上游产出摘要（dependsSummary）
- 实现原型三门与元数据解析（prototype-gates.ts + 条件必交判定）
- 实现裁定记录门与会话留痕判据（decision-gates.ts）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:03:36.646Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，「交没交原型、裁没落账」只在一个地方判，却被所有转移路径共用——「某条路径漏了门」从结构上不再可能，而且这一点有全库差集为零的机械证据。

### 完成项

- 唯一 async 门禁入口落地：按转移分派、短路首个缺口、裁定留痕自取自算（探针走既有端口）
- 接线五个调用点（含卡面漏写的两处真实落点），每点单独变异验证「停用即红」
- 按需求文档把裁定门适用面放宽到所有 feature 需求；三个原型门仍限 UI
- 被合法打破的 7 处既有夹具按「只补夹具、零断言语义」修正
- 零回归机械证明：全库 A/B 差集为空（最强的一条证据）
- 26 例新用例全绿、typecheck 0

### 改动文件

- `src/application/internal/content-gate-wiring.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/confirm-settle.ts`
- `src/http/routers/requirements.ts`
- `src/application/use-cases/ConfirmArtifact.ts`
- `src/application/internal/artifact-gates.ts`
- `tests/move-gate-paths.test.ts`
- `tests/artifact-gates.test.ts`
- `tests/acceptance-criteria.test.ts`
- `tests/application/use-cases.test.ts`
- `tests/dive-confirm-advance.test.ts`
- `tests/dive-gate-prompt.test.ts`
- `tests/fault-injection.test.ts`
- `tests/output-contract.test.ts`

### 下一步

t11/t12 依赖本卡；t12 另需补台账两键的写侧（见执行裁决清单第 2 节）。

---
