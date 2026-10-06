# 用例设计 · REQ-261006164732-6503 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 关注点：把判据放回真实场景里走一遍——每条用例都标注**今天的表现**与**修后的表现**。

## UC-1 拆分门：提交计划 + agent 再请求同门（本次事故现场） <!-- serves: FR-1, FR-3 -->

```
修前： submit(kind=plan) → 自动弹框A(pc-89b19a) ；agent 再请求 → 又弹框B ← 两个框（16:42:06 / 16:42:10 实证）
修后： submit(kind=plan) → requestGate 建门（ticket=pc-A）→ 弹框A
       agent 再请求    → requestGate 命中 reused → 不弹框，返回 pending=true + ticket=pc-A
```
人的体验：**只被问一次**。agent 的体验：拿到 ticket → `reqboard_confirm_receipt` 取回执 → 继续。
断言：弹框端口 1 次、票表 1 条、两次 `ticket` 相同（T-2 U1）。

## UC-2 需求门：人在宽限内作答 vs 宽限外作答 <!-- serves: FR-3 -->

| 时刻 | 修前 | 修后 |
|---|---|---|
| 宽限内作答 | agent 补弹命中"已落章"早退（16:37:48 实证）→ 1 个框 | 同样 1 个框（复用/早退二选一都只 1 个框） |
| 宽限外作答 | agent 补弹**真弹第二个框**（16:42:10 实证） | `reused` → 不弹第二个框 |

关键差别：修前的行为**依赖人的手速**，修后与手速无关——这是"根治 vs 止血"的分界。

## UC-3 迟到作答：被取代 / 需求已推进的门 <!-- serves: FR-5 -->

```
修前： 门A 被清理 settle 后，人仍点了它 → 后台续跑走完整落章 → approvedAt 被覆写（16:42:13.402 实证）
修后： 点它 → 前提检查（gateOpen=false 或 onSourceStage=false）→ recordStaleAnswer
       → 回执 confirmed=false + note「已被取代 / 需求已推进到 implementing」+ 一条评论；台账零新时间戳
```
人的体验：点了也不会"改历史"；留痕说明为什么这次点击没生效。

## UC-4 真门正常路径（零回归对照） <!-- serves: FR-4 -->

```
首次请求（无既有门）→ opened → 弹框 → 肯定答复 → 落章 + 自动推进 → 回执 confirmed=true, advanced=true
                    → 否定答复 → 不落章、不推进，只留痕（既有口径）
                    → 超宽限未答 → pending=true + ticket（既有口径）
```
断言：与改造前**逐字一致**（G2 设计门的第一轮确认、G4 验收门的第一轮确认都走这条）。

## UC-5 异门陈旧票：窗口不能被钉死 <!-- serves: FR-1 -->

```
场景：上一步留下未作答的设计门（人走开了），窗口现在要提交拆分计划
修前： 登记计划门时把设计门一并 settle（不分门）——今天正好是"清掉同门旧票"的近因
修后： 同门 → 复用；异门 → 仍 settle（避免窗口被钉死到 TTL 30 分钟）
```
断言：T-2 U4；且 `pending_confirms` 里不会同时出现两道门的旧票。

## UC-6 看板作答通道 <!-- serves: FR-2 -->

```
看板「待确认」→ 点确认 → ConfirmArtifact → 落章（同一条 applyConfirmDecision）
```
- 门下唯一，看板与会话看到的是**同一道门**（同 ref、同题干、同归属需求）；
- 看板作答同样过 A-4 的两个前提与首写不变（看板不是法外通道）。

## UC-7 人的视角：同一件事不再被问两次 <!-- serves: FR-2, FR-6 -->

```
被问 → 看到的是：需求名 / 门的目标（需求文档·设计·计划·验收）/ 题干 / 能否在看板答
等待中再提交产物 → 不会再冒第二个框；agent 收到的是"已有一道门在等（ticket=…）"
事后查账 → approvedAt / 证据原文只可能是**第一次**那次作答写下的值
```
断言：`reqboard_status` 的 `pending_confirms[]` 能回答"谁在等、等的是哪道门"（T-2 U9）。
