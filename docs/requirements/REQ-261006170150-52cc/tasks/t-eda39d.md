# t-eda39d 组合根与心跳装配：清位即驱动、过期即恢复·研发

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
组合根与心跳装配：清位即驱动、过期即恢复·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T09:59:47.816Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

把「清位即驱动」接进组合根与心跳：过期对账清位成功即请求一次驱动，与 store 桥同一条 round 半入口。

### 完成项

- wake-heartbeat.ts：reconcileAwaitingStops 清位时带 onCleared = deps.notifyDrivable（缺省不传）
- ReqboardDiveManager.ts：心跳的 notifyDrivable 接 this.round.onRequirementMoved
- index.ts：useCaseDeps.notifyDrivable 接 diveManager.roundDriver().onRequirementMoved
- 两处都走 round 半既有入口 ⇒ 不新增任何进会话的投递路径
- 新建 tests/heartbeat-awaiting-resume.test.ts：4 例（TC-8 两例 / TC-9 两例）

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `src/index.ts`
- `tests/heartbeat-awaiting-resume.test.ts`

### 下一步

联调段：核两条注入路径与兼容缺省

---
## 汇报 2（2026-10-06T09:59:58.085Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

补记研发段验收要求的 git diff --stat 摘要，并标明 index.ts 统计含并发窗口 WIP。

### 完成项

- git diff --stat 摘要：ReqboardDiveManager.ts 4 增、wake-heartbeat.ts 20 增 1 删（本卡净增）
- index.ts 66 增 2 删中含别窗口 WIP；本卡在该文件净增约 5 行（1 字段 + 4 行注释）
- 新增测试：tests/heartbeat-awaiting-resume.test.ts（127 行）
- 行数读数：wake-heartbeat 231 行、ReqboardDiveManager 226 行（均在 400 行门禁内）；index.ts 1024 行为基线在册存量超限文件

### 下一步

（补充读数，研发段已关单）

---
