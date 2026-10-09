---
requirement_id: REQ-261007193530-3133
---

# 复盘：reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

> 来源：REQ-261007165643-4275（体检报告）§2.1/§2.2 裁决的第 1 批边界 bug。
> 本文是归档必填文档（bug 档 requiredDocs 含 retro）：记录**先复现 → 根因 → 修复**的闭环与证据指针，以及遗留项。

## TL;DR

- 四处 bug 全部落在**既有收敛点的边界**上：回执构造、任务状态迁移、需求转移闸门、节流读数。
- 修法都是「把判据挪回单点」：FR-1 让可选键缺席而非 `undefined`；FR-2 补上漏接的调用方并抽单源助手；
  FR-3 给逆动作补同一道门；FR-4 给读数补上界。
- 四条 FR 都有**反证**（回退修复即红）：8 条用例在修前失败、修后 36 条全绿。

## 闭环（先复现 → 根因 → 修复） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| FR | 复现（修前） | 根因 | 修复 | 反证 |
|----|-------------|------|------|------|
| FR-1 H1 | 弹框否定 + 空反馈 → 回执含 `undefined` → snapshotJsonValue 抛 `value is not lossless JSON` | `AskConfirm.ts:449` 显式写 `undefined` 值 | 条件展开（键缺席） | 回退 → 1 failed |
| FR-2 H2-role | 看板把子卡推 `integrating/testing/in_review` → 放行（落进无出边状态） | `handleTaskMove` 调 `transitionTask` 缺 `role` → 缺省 `legacy` | 抽 `roleOfTask` 单源 + 传参 | 移除 role → 3 failed |
| FR-3 M2 | agent 走 `canceled → draft` 复活需求 → 放行 | 人工门集合漏了复活边 | 集合加 `canceled>draft` | 删键 → failed |
| FR-4 M6 | `statusHistory` 出现未来时间戳 → 读数 90000 > 60000 | 单条读数只兜下界 | 行内 clamp `[0, throttleMs]` | 回退 → 1 failed |

**证据指针**：`tests/evidence.md`（命令 + 输出摘要 + red-green 全表）、`design/test-cases.md`（用例表与期望读数）、
`reviews/self-review.md`（不利证据与遗留项）。

## 做对了什么 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

1. **bug 档纪律真的省了事**：先复现再动手。FR-2 的第一版用例从 `todo` 起步，
   而 `todo → integrating` 在两张转移表里都非法——用例修前修后都绿，等于没测。
   是「反证」这一步把它抓出来的（改成 `in_progress` 起点后，移除 role 立刻 3 failed）。
2. **收敛点补漏，而不是在调用方复制判据**：FR-2 抽 `roleOfTask` 单源，避免"工具面一套、HTTP 面另一套"。
3. **不利证据照写**：全量测试的 69 条存量失败没有被打扮成绿；用 `git stash` 抽验归因后才下结论。

## 遗留项（明确不在本批） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| # | 遗留 | 影响 | 建议 |
|---|------|------|------|
| 1 | 全量 `pnpm test` 69 条存量失败（`baseline:check` 报"新增"10 条） | 基线与当前工作树漂移，后续需求都会撞同一批假红 | 由对应负责人跑 `npx tsx scripts/test-baseline.mts --refresh` 落账 |
| 2 | HTTP 面 `actor` 取自请求体且无鉴权（H2 另一半） | 本地任意进程可伪造 `actor:'human'` 绕过人工门 | 需一次小型设计（鉴权模型），另立项 |
| 3 | 已卡进非法态的存量子卡不做数据迁移 | 存量脏数据仍在（本批只堵新增入口） | 出现实际卡死再立修缮项 |
| 4 | `MoveTask.roleOf` 与 `roleOfTask` 两份同口径实现并存 | 未来可能漂移 | 下次触碰该文件时合并为单源 |
| 5 | `pnpm test` 未纳入"必须全绿"的本地门 | 假红/假绿都靠人看 | 与 #1 一并治理 |

## 后续跟进项与责任人 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- #1 基线刷新：**本仓维护者**（阻塞面最广，优先级最高）。
- #2 HTTP 鉴权：**下一个接手 reqboard HTTP 面的窗口**（需先立项）。
- #3 / #4：**触碰对应文件时顺手做**，不单独立项（避免为 3 行改动开需求）。
