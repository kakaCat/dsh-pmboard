---
requirement_refs: [RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8]
---

# 测试用例设计（REQ-261008020617-088f）

> 重构的验收靠**行为等价**：跑什么、看到什么算过。本份是这次交付实际依赖的用例清单
> （含新增的证伪类用例），命令与读数在 `tests/evidence.md` 里逐条贴出。

## 用例总览 `serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8`

| 编号 | 用例文件 | 覆盖 | 命令 | 期望 |
|---|---|---|---|---|
| TC-1 | `tests/layer-boundary.test.ts` | RF-1, RF-7 | `npx vitest run tests/layer-boundary.test.ts` | application/ 越界 0；12 用例仅剩边界外 tools/http 那 1 条红 |
| TC-2 | `tests/unit/gate/{design,task-coverage,acceptance}-gate.test.ts` | RF-2 | `npx vitest run tests/unit/gate` | 3 文件 9 用例全绿（**断言一字未改**） |
| TC-3 | `tests/unit/rtm-health.test.ts`、`tests/rtm-health-legacy.test.ts` | RF-3 | 同左 | 落盘形状（五键/2 空格/100 条）+ 原型节判据 + 新增「state 目录缺失也能落盘」 |
| TC-4 | `tests/dive-wake-wiring.test.ts`、`tests/reqboard/degraded-startup.test.ts` | RF-4 | 同左 | 真读日志文件断言 `[WAKE-FAIL]`；一条失败一行 |
| TC-5 | `tests/workspace-root-resolution.test.ts`（新增） | RF-5 | 同左 | 6 条行为等价断言（见下） |
| TC-6 | `tests/create-doc-location.test.ts`、`tests/create-delegated-owner.test.ts`、`tests/capture.test.ts` | RF-5 | 同左 | 全绿（哨兵/降级落点/错误码） |
| TC-7 | `tests/dive-wake-wiring.test.ts`、`tests/dive-manager-wiring.test.ts` | RF-6 | 同左 | Service 名/inject/订阅分组/失败留痕不变 |
| TC-8 | `tests/canceled-audit-holds.test.ts`、`tests/canceled-four-faces.test.ts`、`tests/canceled-coverage-gate.test.ts`、`tests/rtm-yaml-live-tasks.test.ts` | RF-3 | 同左 | RTM 入口签名变更后无回归 |
| TC-9 | `pnpm test`（全量） | RF-1, RF-8 | 同左 | 失败集合 ⊆ 改前基线且逐条可归因 |
| TC-10 | `npx tsc --noEmit` | 全部 | 同左 | 退出码 0、0 错误 |
| TC-11 | `tests/kb-invalidation.test.ts`、`tests/kb-operations.test.ts` | RF-1 | 同左 | 全绿（知识层未被改坏） |
| TC-12 | `pnpm kb:check` | RF-1 | 同左 | code-map 零漂移 |

## 证伪类用例（"这条判据真的会响"） `serves: RF-2, RF-7`

| 编号 | 手法 | 期望 |
|---|---|---|
| TC-13 | 合成输入：台账条目指向**已修好**的文件 → `unusedExemptions(bad, entries)` | 返回该条（点名过期豁免）；两条都命中时不点名（防"永远点名"的假响） |
| TC-14 | 临时真写入 1 条过期豁免 + `frozenCount=1` → 跑层门 | 专属用例点名「过期豁免」、形状用例点名「超过硬上界 0」；还原台账即回绿 |
| TC-15 | 畸形 RTM（缺 `functional_requirements`） | 落 `rtm_not_found`，**不得**静默判过（刻意不防御） |
| TC-16 | state 目录不存在时 `recordRTMFailure(host, root, …)` | 不抛、落盘成功、不留 `.tmp-*`（改前该路径抛错并被吞） |

## 行为等价类用例 `serves: RF-2, RF-5`

| 编号 | 手法 | 期望 |
|---|---|---|
| TC-17 | 迁移前后运行时对照（临时 tsx 脚本，15 条断言） | 三条门的 fail 消息/code/gaps、pass 消息、`rtm_not_found` 形状逐字相同 |
| TC-18 | `isAbsolutePath` 与 `node:path.isAbsolute` 逐例对照（16 个样例，含 win32 与 `C:`） | 全等（**含 POSIX 下反斜杠开头不算绝对**这条实测纠偏） |
| TC-19 | create 侧三例（非绝对 / 路径在但不是目录 / 不存在） | `REQBOARD_INVALID_WORKSPACE` + 两句文案逐字一致 |
| TC-20 | `HostFsPort.cwd()` | 等于 `process.cwd()`（capture 的「宿主默认工作区」哨兵源） |

## 逐卡测试覆盖（`covers:` 标注） `serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8`

> 验收覆盖度门禁按 `covers: t-xxx` 认账。每张卡（父卡 + 四/三段子卡）后面写的是**它自己卡面
> 验收命令**的落地情况——子卡与父卡同源（子卡承载该卡的阶段验证），故同一批命令覆盖整条链。

| 卡 | 主题 | 覆盖它的用例 | covers 标注 |
|---|---|---|---|
| t1 / 研发 / 复核 / 测试 | 三份同构 RTM 门合并为单点 | TC-2（三门单测断言未改）、TC-17（运行时 15 条等价断言）、TC-10 | `covers: t-3ac912, t-bdc020, t-56cf20, t-b602f1` |
| t2 / 研发 / 联调 / 复核 / 测试 | HostFsPort / DiagSinkPort 与装配 | TC-10（tsc 即漏改清单）、TC-15（六方法契约冒烟）、TC-7（apply-wiring） | `covers: t-8ba560, t-89c4b2, t-713e3f, t-920291, t-fa4275` |
| t3 / 研发 / 联调 / 复核 / 测试 | rtm-health 写路径端口化 | TC-3（落盘形状 + 新用例）、TC-8（canceled 系 + rtm-yaml 入口） | `covers: t-3b104c, t-0786cd, t-ce4694, t-68f2a5, t-6a958f` |
| t4 / 研发 / 联调 / 复核 / 测试 | rtm-health 读路径端口化 | TC-3、TC-6（/state 的 rtm_health 形状） | `covers: t-a5c088, t-56f055, t-6334ba, t-b45bdc, t-2392a4` |
| t5 / 研发 / 联调 / 复核 / 测试 | diag-log 门面化 + FileDiagSink | TC-4（日志双写链路 21 用例） | `covers: t-43b907, t-1acef2, t-4015d5, t-5e3012, t-09c338` |
| t6 / 研发 / 联调 / 复核 / 测试 | 两处绝对路径判定收口 | TC-5（新增 6 条等价断言）、TC-18、TC-19、TC-20、TC-6 | `covers: t-d2890d, t-9b13d3, t-4f8221, t-2abc03, t-02e835` |
| t7 / 研发 / 联调 / 复核 / 测试 | Dive Service 外移适配层 | TC-7（Service 名 / inject / 订阅分组 / 失败留痕） | `covers: t-d18c15, t-bfcceb, t-01fbef, t-987ec0, t-c0a71e` |
| t8 / 研发 / 复核 / 测试 | 层门豁免面 | TC-1（层门 12 用例）、TC-13（合成输入）、TC-14（端到端证伪） | `covers: t-54f247, t-afafc8, t-903c9a, t-7c3395` |
| t9 / 文档段 / 复核段 | 文档与知识层同步 | TC-11（kb 两份用例）、TC-12（code-map 零漂移） | `covers: t-dca1de, t-911edb, t-a019a3` |
