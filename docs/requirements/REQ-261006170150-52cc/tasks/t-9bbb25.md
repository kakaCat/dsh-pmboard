# t-9bbb25 组合根与心跳装配：清位即驱动、过期即恢复

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
组合根与心跳装配：清位即驱动、过期即恢复

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/heartbeat-awaiting-resume.test.ts 全绿：台账 awaiting + 在途已过期 ⇒ 一趟 tick 后停手位清、resumed 含该需求、notifyDrivable 调 1 次；未过期 ⇒ 停手位保持、resumed 不含、0 次；② npx vitest run tests/dive-wake-e2e.test.ts 全绿（真装配零回归）

## 实施方案（implementation）
改 src/application/dive/wake-heartbeat.ts：WakeHeartbeatDeps 加 notifyDrivable，对账清位时带 onCleared。改 src/application/dive/ReqboardDiveManager.ts：心跳的 notifyDrivable 接 this.round.onRequirementMoved。改 src/index.ts：useCaseDeps 注入 notifyDrivable = (id) => diveManager.roundDriver().onRequirementMoved(id)。新建 tests/heartbeat-awaiting-resume.test.ts（TC-8、TC-9）。

## 上游产出摘要（dependsSummary）
- 等待位契约：清位回调与 notify 开关
- 在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:01:59.935Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

组合根与心跳装配完成：过期对账清位成功即请求一次驱动，台账里「过期后自动恢复」不再只走一半。

### 完成项

- wake-heartbeat.ts：对账清位带 onCleared = deps.notifyDrivable
- ReqboardDiveManager：心跳 notifyDrivable 接 this.round.onRequirementMoved
- index.ts：useCaseDeps.notifyDrivable 接 round 半既有入口
- 不新增进会话的投递路径（唤醒唯一经 round 半的预留→投递→准入）
- acceptance ①：tests/heartbeat-awaiting-resume.test.ts → 4/4 绿，退出码 0
- acceptance ②：tests/dive-wake-e2e.test.ts → 5/5 绿（真装配零回归）
- 装配面回归 42/42 绿（含 apply-wiring 宿主接线冒烟）；tsc 0 条
- 子卡链 4 张全 done（研发 / 联调 / 复核 / 测试）
- 偏差如实登记：全量失败 70 > 基线 68，逐条追因后 6 个失败文件均不引用本需求模块（本卡新增失败 0）

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `src/index.ts`
- `tests/heartbeat-awaiting-resume.test.ts`

### 下一步

t-0808ec（兼容形态与存量恢复演练）；t-0c7769 待 confirm-settle.ts 稳定后再动

---
