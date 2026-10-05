# t4 证据：真数据取证 + 兼容回归 + 预算闸未动 + 构建（REQ-261004154937-2ca3）

## 真数据取证：聚合规则 vs 独立复算

```
$ ./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts
会话总数（本工作区索引到的全部） = 121
根会话                          = session-5c6b1a8b-3234-4f35-b28f-1f1a20834721
A 本仓实现 · 成员数             = 15 （含自身）
B 独立复算 · 成员数             = 15
A 聚合读数(total tokens)        = 226420316
B 独立复算(total tokens)        = 226420316
差额                            = 0
自身用量                        = 141128714
后代用量合计                    = 85291602
四桶（A）                       = {"uncachedInputTokens":2395771,"outputTokens":924129,"cacheReadTokens":223100416,"cacheWriteTokens":0}
PASS：聚合规则（descendantsOf + 合计）与「向上走 parentSession 链」的独立复算逐字节一致
```

**这次取证比的是两件事**：
1. **血缘规则**：本仓 `descendantsOf`（BFS 闭包 + 判据）与一份**不 import 本仓代码**的朴素做法
   （对每个会话向上走 `parentSession` 链）得到**同一批成员**（15 = 自身 + 14 个子代理）；
2. **合计**：两边四桶逐字节一致（差额 0）。

**顺带证实了需求里的量级**：该窗口真实消耗 **226.4M**，而改造前只报 **141.1M**——
**漏计 85.3M（约 37.7%）**，与需求分析阶段的估算一致。

## 兼容回归（逐文件 diff，不靠失败数）

```
$ pnpm test
 Test Files  46 failed | 343 passed | 3 skipped (392)
      Tests  96 failed | 4002 passed | 20 skipped (4118)

$ diff <开工前基线失败文件集合> <本次失败文件集合>
（完全相同：0 差异）     汇总：evidence/full-suite-after-t3.txt
$ pnpm typecheck   → 146（与基线持平；本需求文件 0 个）
```

## 预算闸未动（本次只改展示口径）

- `tests/chain-budget.test.ts` **15 条用例一条未改**，仍全绿——闸门判据与阈值都没碰。
- 差异已写在明处（`src/client/token-info.ts` 的 Token tab 口径说明 + 设计文档）：
  **展示含子代理 / 起链预算闸不含**，且**本口径上线前的历史数字不含子代理**。

## 构建

```
$ pnpm build
✔ Build complete … [verify-client] OK  bundle=344406 bytes
dist/index.mjs  → 含血缘聚合（descendants-unavailable / cold-read-budget / legacy-snapshot 各 2 处、
                  sessionProjectionCache 4 处、members 17 处）
lib/client.js   → 含新口径文案（「含子代理」3 处）
```

## 已知边界与偏差（响亮记录，不静默）

1. **取数滞后**：集合异步刷新、用量同步读（枚举是异步的、快照链是同步的）。首拍（进程刚起、集合未刷）
   如实标 `scope='self'`；某后代缓存未命中时本轮记 `degradedMembers`，异步冷读预热后下一轮才计入。
2. **新成员全额计入**的已知高估场景：若某子会话其实早于本阶段就存在、只是上次取数失败，
   其全额会被算进本次——这种情形由 `degraded` 标出（设计已知偏差表第 1 条）。
3. **消失成员记 0** 会低估它最后一段增量（设计已知偏差表第 2 条）。
4. **历史快照不回填**：上线前的数字仍是旧口径，由文案交代时间分界。
5. **本探测用的是日志折叠复算**（近似 DSH token-meter 的折叠规则），不是宿主进程内的投影读数；
   它的用途是**cross-check 血缘与合计规则**，不是替代宿主读数。宿主侧由单测（假服务）与装配冒烟覆盖。
