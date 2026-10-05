# t-8c5f5d 给人一个开关：看板继续能接回手动模式的需求·联调

> 需求：REQ-261002173819-69c7 修复 reqboard 自动化断链：Dive 无法重新武装 + 自动实施链投递失败

## 在做什么
给人一个开关：看板继续能接回手动模式的需求·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T10:11:36.859Z，窗口 session-c997b014-0c5c-4679-9439-98f6d0a3fc20）

联调确认这条链路真的通了：人点一下「继续」→ 台账立刻变成自动跑 → 下一次心跳就会起轮；同时暂停那一侧（on:false）仍然一个字段都不碰 Dive。

### 完成项

- 请求样例与响应核对：POST /req/autorun {id,on:true} → 200，台账 armed+active，advanceNote 含「已重新武装」
- 响应形状核对：键集合 ⊆ 需求记录字段 ∪ {advanceNote}，未新增任何返回键（用例断言）
- 链路核对：看板请求 → armExplicit 写台账 → isDrivableRequirement 为真、isStalledWake 为真 → 下一拍心跳即可叫醒（R-7）
- 反向核对：on:false 只置 autoRun=false 与 pausedReason=manual，dive 字段逐字节不变（R-9）
- Dive 侧回归：round-driver 26 例、round-state 18 例、migration 7 例、board-entry 7 例、board-attach 6 例全绿
- 本卡验收命令：dive-rearm 24 例 + autorun-rearm 2 例全绿

### 下一步

复核子卡：逐条对照 design/interfaces.md 的 armExplicit 行为矩阵

---
