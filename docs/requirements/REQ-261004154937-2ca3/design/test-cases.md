---
serves: FR-5, FR-1, FR-2, FR-3, FR-4
---

# REQ-261004154937-2ca3 设计 · 测试策略（能红的断言）

## 总策略（serves: FR-5）

| 层 | 断言对象 | 工具 | 跑法 |
|---|---|---|---|
| 纯函数层 | `deltaSnapshots` 的五种输入情形（含边界） | vitest 纯单测 | `vitest run tests/lineage-delta.test.ts`（新增） |
| 适配器层 | 枚举闭包 + 取数降级（注入假 `sessionPersistence` / `sessionProjectionCache`） | vitest（假服务） | `vitest run tests/session-probe-lineage.test.ts`（新增） |
| 兼容回归 | 无子代理时数字与今天逐字相同 | 既有夹具 | `vitest run tests/execution-token-guard.test.ts`、`tests/token-*.test.ts` |
| 真数据层 | 真实窗口的聚合值与独立复算一致 | tsx 取证脚本 | `tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts` |
| 契约层 | 预算闸口径未变 | 既有用例 | `vitest run tests/chain-budget*.test.ts`（如名不同则按实际） |

## TC-1 聚合与恒等式（serves: FR-1）

| 用例 | 输入 | 期望 |
|---|---|---|
| TC-1a | 主 + 2 子（各给确定四桶） | `totals == 主 + 子1 + 子2`；`totals === Σ members[].totals` |
| TC-1b | 主 + 0 子 | `totals == 主`，且与改造前的数字逐字相同 |
| TC-1c | 三层血缘（子 + 孙） | 孙会话也在合计里；`depth` 分别为 0/1/2 |
| TC-1d | fork 出来的窗口（有 `parentSession` 但 `delegationDepth:0`、`origin` 非 subagent） | **不算子代理**（不能把分支窗口当后代） |

## TC-2 差值归属规则（serves: FR-2）

| 用例 | 场景 | 期望 |
|---|---|---|
| TC-2a | 同一批成员，各自水位前进 | 逐成员相减之和 |
| TC-2b | 中途新起一个子代理（`t2[m] = X`，S1 无它） | 贡献 = **X**（全额） |
| TC-2c | 某成员在 S2 消失 | 贡献 = 0（**不记负值**，不得把总数拉低） |
| TC-2d | 某成员 `seq` 缺失 | 该成员不参与，差值标 degraded |
| TC-2e | 任一侧缺 `members`（旧快照） | 退化为 `subBuckets`，标 `legacy-snapshot`，**不抛错** |

## TC-3 缺失不补 0（serves: FR-3）

| 用例 | 输入 | 期望 |
|---|---|---|
| TC-3a | 一个后代"永远取不到" | 它进 `degradedMembers`、**不进 totals**；数字 == 可得成员之和 |
| TC-3b | 冷读超过预算（> 8 个） | 超额成员进 `degradedMembers`，`degradedReason='cold-read-budget'`；不阻塞 |
| TC-3c | 两个 DSH 服务都缺失 | `scope='self'`、`degradedReason='descendants-unavailable'`，数字 == 自身路径 |
| TC-3d | 本窗口会话投影不可得 | `source='unavailable'`、空桶（既有语义不变） |

## TC-4 真数据取证（serves: FR-1, FR-5）

```
$ ./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts
窗口 session-5c6b1a8b…：自身 141.1M + 14 个子代理 85.3M = 226.4M
聚合读数 = <脚本输出>   独立复算 = <脚本输出>   偏差 = 0（或按已知偏差表解释）
```
期望：两个数字一致；若因缓存陈旧有差，必须落在 architecture.md 已知偏差表的解释范围内，并在证据里写明是哪一条。

## TC-5 兼容与文案（serves: FR-3, FR-4）

- 无子代理夹具下，需求累计与任务执行差值与改造前**逐字相同**（用既有用例直接跑）；
- 预算闸用例不变（口径未动）；
- 文案断言：Token tab 口径说明含「含子代理」与「预算闸不含」；卡面 `title` 含「含子代理」；
- 旧快照参与差值不抛错（TC-2e 覆盖）。

## 验收命令与期望输出（serves: FR-5）

```bash
./node_modules/.bin/vitest run tests/lineage-delta.test.ts tests/session-probe-lineage.test.ts   # 新增两层，全绿
./node_modules/.bin/vitest run tests/token-endpoint.test.ts tests/execution-token-guard.test.ts    # 兼容回归全绿
./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts     # 真数据一致
pnpm typecheck                                                                                     # 错误数 ≤ 基线（146）
pnpm test                                                                                          # 失败文件集合与开工前逐文件相同
```

**规范引用**：C-14（提交前跑测试并与基线比对）、C-15（改源码必跑类型检查）。
**红态要求（本仓纪律）**：TC-1a / TC-2b / TC-3a 三条必须**实测能红**——把聚合关掉（只算自身）即 TC-1a 红；把新成员改成"只算增量"即 TC-2b 红；把降级成员补 0 即 TC-3a 红。红/绿输出一起存档。
