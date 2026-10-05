# REQ-261004154937-2ca3 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：token 读数从「这一个窗口花了多少」改成「这个窗口连同它派出去的所有子代理一共花了多少」——按父子会话血缘把后代用量合进来。实测差距不小：某个真实窗口原本只报 141.1M，实际是 226.4M，漏掉 85.3M（约 37.7%），也就是用子代理越多的活，越被系统性低估。实现分四步：先把契约与差值规则定死成纯函数（快照逐成员留痕，差值逐成员算：同一成员相减、中途新起的子代理全额计入、消失的不记负值、水位不可比的不参与、旧快照退化为总数相减）；再让快照真的取到后代（枚举零日志读、单会话用量走投影缓存同步读、未命中时有界冷读预热，取不到的不补 0 只标降级）；然后把两处跨快照差值全部换成新规则，并把「展示含子代理 / 预算闸不含 / 上线前历史不含」三句话写在 Token tab 与卡面上；最后用真数据做交叉验证——本仓的血缘规则与一份独立的朴素复算（向上走 parentSession 链）得到同一批 15 个成员、同一个数。自检：相关 49 条用例全绿，三条关键规则各自做过红态自证，全量失败集合与基线逐文件零差异，类型检查与基线持平，构建通过。已知偏差（取数滞后、新成员全额的高估场景、消失成员的低估、历史不回填、64 成员上限）逐条写在证据里。待人工项：宿主需重载一次才能看到真机新数字（我无权重载）。

## 1. 验收列表

### v1-1 · 定死契约与差值规则：快照带成员、差值逐成员算

**验收内容**：【定死契约与差值规则：快照带成员、差值逐成员算】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/lineage-delta.test.ts 全绿：TC-1a 主+2 子 → totals == 主+子1+子2 且 totals === Σmembers[].totals
2. TC-1b 主+0 子 → 与自身逐字相同
3. TC-1c 三层血缘 depth 0/1/2
4. TC-1d fork 窗口（delegationDepth:0 且非 subagent）不算后代
5. TC-2a 同名成员相减
6. TC-2b 新成员全额
7. TC-2c 消失成员记 0 不记负
8. TC-2d seq 缺失该成员不参与且标 degraded
9. TC-2e 旧快照缺 members 退化为总数相减并标 legacy-snapshot 不抛错。红态自证：关掉聚合 → TC-1a 红
10. 新成员改成只算增量 → TC-2b 红
11. 红绿输出存 evidence/。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

### v1-2 · 让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0

**验收内容**：【让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/session-probe-lineage.test.ts 全绿：注入假 sessionPersistence（主/子/孙三条 header）+ 假 sessionProjectionCache → 闭包含全部后代且 depth 正确
2. 某后代缓存未命中且超冷读预算 → 进 degradedMembers、不进 totals、degradedReason='cold-read-budget'
3. 两服务都缺失 → scope='self' 且 degradedReason='descendants-unavailable'，数字与自身路径逐字相同
4. fork 窗口不算后代。另 ./node_modules/.bin/vitest run tests/session-probe-token.test.ts 既有用例全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

### v1-3 · 两级差值换口径，并把「含子代理 / 闸门不含 / 历史分界」写在明处

**验收内容**：【两级差值换口径，并把「含子代理 / 闸门不含 / 历史分界」写在明处】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts 全绿
2. grep -c "subBuckets(" src/application/internal/token-usage.ts 为 0（两处差值已全部改用 deltaSnapshots）
3. Token tab 口径说明含「含子代理」「预算闸」「上线前」三段（结构断言）
4. 卡面/列表 token 徽章 title 含「含子代理」
5. 预算闸用例（tests/chain-budget*.test.ts）一条不改仍全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

### v1-4 · 收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线

**验收内容**：【收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线】验收

**操作步骤**：
1. ./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts 输出「聚合读数 vs 独立复算」且一致（或偏差能按 design/architecture.md 的已知偏差表解释并写明是哪一条）
2. pnpm test 的失败文件集合与开工前逐文件相同（贴 diff）
3. pnpm typecheck 错误数 ≤ 146
4. pnpm build 退出码 0 且 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt

**验收状态**：✓ 通过

---

## 2. 测试报告

- ./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts → 真数据（121 个会话）上，本仓血缘闭包与一份不 import 本仓代码的朴素做法（向上走 parentSession 链）得到同一批 15 个成员，四桶逐字节一致、差额 0；输出 docs/requirements/REQ-261004154937-2ca3/evidence/t4-lineage-live.txt
- 同一次取证把漏计量化了：该窗口真实 226,420,316 tokens，改造前只报 141,128,714，漏计 85,291,602（约 37.7%）
- ./node_modules/.bin/vitest run tests/lineage-delta.test.ts → 13 条全绿（聚合/恒等式/三层血缘/fork 不算/断链不猜/五态差值/顺序无关/脏成员防御）
- ./node_modules/.bin/vitest run tests/session-probe-lineage.test.ts → 7 条全绿（闭包与 depth、聚合恒等式、缺失不补 0、冷读超预算、服务缺失退回自身、未预热如实标 self）
- 红态自证三份（各自可复现）：关掉聚合 → 2 条红（evidence/t1-red-aggregation-off.txt）；新成员只算增量 → 1 条红（t1-red-newcomer-increment-only.txt）；水位缺失硬相减 → 1 条红（t1-red-seq-missing-hard-subtract.txt）
- ./node_modules/.bin/vitest run tests/session-probe-token.test.ts tests/apply-wiring.test.ts tests/execution-token-guard.test.ts tests/token-endpoint.test.ts tests/token-tab.test.ts → 全绿（既有会话探测 6 + 装配冒烟 5 + 执行凭证 4 + 接口 8 + Token tab 6）
- 预算闸未被改动：./node_modules/.bin/vitest run tests/chain-budget.test.ts → 15 条一条未改仍全绿
- 全量回归：失败文件集合与开工前逐文件零差异（46 文件 / 96 用例）；三次快照 evidence/full-suite-after-{t1,t2,t3}.txt
- pnpm typecheck → 146 与基线持平（本需求文件 0 个错误）
- pnpm build → 退出码 0 + [verify-client] OK；宿主产物含血缘聚合（三个降级原因各 2 处、sessionProjectionCache 4 处、members 17 处），客户端产物含新口径文案
- 口径差异写在明处（Token tab 与卡面 title）：展示含子代理 / 起链预算闸不含 / 本口径上线前的历史数字不含子代理
- 评审报告（内部自评，含 4 处问题与 3 处与设计草图的差异）：docs/requirements/REQ-261004154937-2ca3/reviews/self-review.md
- 测试证据（含 covers 任务对应表、未跑项与真机复核命令）：docs/requirements/REQ-261004154937-2ca3/tests/test-evidence.md
- 收口证据（真数据/兼容回归/预算闸/构建/已知偏差五节）：docs/requirements/REQ-261004154937-2ca3/evidence/t4-evidence.md
- 待人工项：宿主未重载 ⇒ 运行中插件仍是旧口径；重载后按测试证据末节命令复核真机数字

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死契约与差值规则：快照带成员、差值逐成员算 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
| v1-2 | 让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
| v1-3 | 两级差值换口径，并把「含子代理 / 闸门不含 / 历史分界」写在明处 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
| v1-4 | 收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
| v1-6 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 16:13 |
