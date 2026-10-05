# t-d5dbae 定死契约与差值规则：快照带成员、差值逐成员算·复核

> 需求：REQ-261004154937-2ca3 token 统计纳入子代理消耗（跨会话聚合口径）

## 在做什么
定死契约与差值规则：快照带成员、差值逐成员算·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T07:58:03.100Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

复核段完成：规则与设计逐条一致，并修掉两处「原因标签名不副实」——降级原因现在能如实说出到底是水位不可比、快照不可得还是旧快照。

### 完成项

- 逐条对照 design：TC-1a~e、TC-2a~h 全部落地（含 fork 窗口不算后代、断链不猜、顺序无关、脏成员防御），无行为偏离
- 复核抓出并修掉两处标签不诚实：水位不可比原先误用 cold-read-budget、快照本身不可得误用 descendants-unavailable；现补 member-unavailable 与 snapshot-unavailable 两个独立原因（面板上说出的原因必须是真的）
- 一处与设计草图的实现差异如实登记：deltaSnapshots 返回 {delta, degraded, degradedReason} 而非裸 TokenBuckets——设计自己的数据模型要求差值侧标降级，裸桶装不下这个信息；t3 用 .delta 取值
- 复核后回归：13 条用例全绿；类型检查 146 与基线持平

### 改动文件

- `src/shared/protocol.ts`
- `src/domain/token/lineage.ts`
- `tests/lineage-delta.test.ts`

---
