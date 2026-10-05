# t-ba99ec 接上会话运行态读数，判定「哪条需求在跑」

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接上会话运行态读数，判定「哪条需求在跑」

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
pnpm typecheck 对改动文件零错误；假投影 byId={a:{running:true},b:{running:false}} 下 isSessionRunning('a')===true 且 ('b')===false；sessions 缺失时三个导出函数均不抛，分别返回 false / 空集 / 可安全调用的 no-op 退订（由 t4 用例证明）。

## 实施方案（implementation）
新建 src/client/session-running.ts：isSessionRunning（读 ctx.sessions.list 的 byId[sid].running === true，服务缺失/行缺失/形状异常一律 false）、runningSessionIds（不可得 → NO_RUNNING）、subscribeSessionRunning（缺 subscribe → no-op 退订）、requirementRunning（seats 权威 ∪ sourceSessionId 折算）。改 src/client/session-jump.ts 的 SessionsServiceFace.list 补可选 subscribe 类型。改 src/client/types.ts 补 ClientWindowSeat 与 seats? 声明。不抛错、不打 error 日志。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T13:31:31.995Z，窗口 session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9）

这一步做完，看板能回答「某个会话此刻在不在跑」——运行态读数的唯一入口到位，且拿不到读数时一律当作「不在跑」而不报错。

### 完成项

- 新增 src/client/session-running.ts：读数（isSessionRunning / runningSessionIds）、订阅（subscribeSessionRunning）、需求映射（requirementRunning）与重绘门控辅助（relevantSessionIds / sameRunningSet / runningAmong）
- 读数走 DSH 官方客户端服务 ctx.sessions.list 的 byId[sid].running，不新增任何 host 接口
- 服务缺失 / 列表缺失 / 行缺失 / 字段形状异常 / 无订阅能力 五种降级路径全部不抛错、不伪造
- 席位权威口径落地：seats 有值即权威（含显式空数组），缺省折算单 owner sourceSessionId
- session-jump 的 SessionsServiceFace.list 补可选 subscribe（一行类型放宽，行为不变）
- client/types.ts 补 ClientWindowSeat 与 RequirementSummary/RequirementRecord 的 seats 声明（只补读端类型，不动服务端）

### 改动文件

- `src/client/session-running.ts`
- `src/client/session-jump.ts`
- `src/client/types.ts`

### 下一步

t2：建渲染单点 renderRunningDot 并透传到泳道卡与列表行

---
