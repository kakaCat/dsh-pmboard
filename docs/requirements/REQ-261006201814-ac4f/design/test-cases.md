# 测试策略与用例设计（REQ-261006201814-ac4f · 第二版）

> 设计产物：定义判据的形状与锚点。任务划分与依赖属拆分阶段。
> **第二版新增**：FR-10 的 A/B 归因判据成为硬要求（实施期实证：单文件验收漏掉 10 条回归）。

## 测试层级与覆盖意图 `serves: FR-1, FR-2, FR-5, FR-7, FR-8, FR-10`

| 层级 | 覆盖什么 | 锚点文件 | 期望 |
|---|---|---|---|
| 单元 | 扫描器、码提取、棘轮比较 | `tests/error-code-inventory.test.ts`、`tests/error-code-exempt.test.ts` | 全绿 |
| 集成 | 码触发矩阵（造场景 → 触发 → 断码） | `tests/error-code-matrix.test.ts` | 零覆盖 25 → ≤5 |
| 契约 | 基线两集合与 failures 三方对账 | `tests/baseline-triage.test.ts` | 双向相等 |
| 进程 | 隔离：仓内写入被内核拒绝 + 契约锚点 | `tests/setup/hermetic-guard.ts` + 其元测试 | 写仓即红 |
| 矩阵 | 角色/条件 × 动作 × 断言（码 + 零写入 + 状态不变） | `tests/{authorization,concurrency,empty-input}-matrix.test.ts` | 逐格钉死 + 计数断言 |
| 归因 | A/B 对照 + 同配置复跑（**本版新增**） | `tests/helpers/ab-attribution.ts` | `introduced` 为空 |
| E2E | 反向演练：改坏 → 判据必红 → 逐字节还原 | `tests/drill/reverse-drill-error-codes.mts` | 退出码 0 |

**为什么要有「进程」与「归因」两层**：本需求治的病（假绿）恰好是单元/集成层**看不出来**的——
判据本身失守、或验收口径过窄。故必须有「改坏实现 → 判据必红」的演练层（FR-8）
与「两侧对比才敢说不是本次引入」的归因层（FR-10）。

## 错误码覆盖矩阵 `serves: FR-2, FR-3`

```
   tests/fixtures/error-code-inventory.json
        │  covered=false 的码集合
        ▼
   tests/fixtures/error-code-exempt.json ◀── 必须双向相等
        │
        │  对每个「可触发」的码，矩阵里必须有且仅有一条 TriggerSpec
        ▼
   tests/error-code-matrix.test.ts
        ├─ 逐条：trigger() → 观察 code → expect(code).toBe(spec.code)
        ├─ 断到「码本身」，不断中文文案（文案一改就碎正是 FR-6 要治的）
        └─ 三条自检：specs 非空 / 码必须在 inventory 里 / 同码不得重复超一次
```

**三档 tier 的造景手法**：

| tier | 手法 | 成本 |
|---|---|---|
| `direct` | 直调工具/函数传非法入参，**不需夹具** | 低（几行） |
| `fixture` | 复用已有同族夹具换字段造状态 | 中 |
| `fault` | 注入假端口（假 store 让 `mutate` 返回 undefined、假 JobsPort 让 `start` 抛、假 resolve） | 中 |

**已勘定的可达性**：`direct` 4 条（如 `reqboard_run_status` 传不存在 id → `REQUIREMENT_NOT_FOUND`）；
`fault` 6 条（3 条只需一个假端口）；`fixture` 15 条（约 11 条可复用同族夹具）；
高风险 3 条（`NOT_AUTORUN` / `REQ_NOT_FOUND` 工具层不可达、`AWAITING_MANUAL` 造链成本高）。

**闸门**：`REQBOARD_STORE_INCONSISTENT` 设计选「缺 store 的 deps」为主用例（真实误用路径，不需打桩），
「`mutate` 返回 undefined」为对照。

## 豁免棘轮测试 `serves: FR-3, FR-9`

| 断言 | 反例（必须红） |
|---|---|
| exempt ⊆ inventory 的 covered=false 集合 | 把已能触发的码留在白名单 |
| inventory 的 covered=false 集合 ⊆ exempt | 有码没覆盖、也不在白名单 |
| `entries.length ≤ frozenCount` | 上调 frozenCount 放宽 |
| `reason` / `plan` 非空 | 空理由的豁免 |
| `blocker=no-production-point` 只给死码 | 给在产码打此标 |

**匹配键**：`code`；产生点用 `site.file` + `site.anchor`（行原文），**不用行号**。

## hermetic 三层测试 `serves: FR-5, FR-9`

| 层 | 判据 | 能抓住 | 抓不住 |
|---|---|---|---|
| ⑤-a 权限模型 | worker 带 `--permission --allow-fs-write=<tmp>`；写仓 → `ERR_ACCESS_DENIED` | **所有进程内写入**（含绕过夹具的路径） | 旧 Node 无此开关时（须如实标注跳过） |
| ⑤-b 契约锚点 | 所有 docs 替身的根必须是绝对临时根；改回 `'.'` → 必红 | 已知类泄漏（harness 单点） | 未知的新写入口 |
| ⑤-c 隔离副本 | `git worktree` 内跑全量，前后逐文件内容哈希不变 | 跨进程/子进程写入 | — |

**⑤-a 的启动自检**（必须有）：setupFiles 内试写一个仓内探针路径；
**若没被拒绝**即说明权限模型未生效 → 打印响亮警告并标记「⑤-a 未覆盖」，不静默当通过。

**⑤-b 的元测试**（必须有）：在临时目录装载守卫 → 故意让一个假 docs 替身返回 `'.'` →
断言 `TEST_HERMETIC_CONTRACT` 抛出且 violations 记到一条；再让替身返回绝对临时根 → 断言不抛。

**D-4 纪律**：**不得**用「全工作树 git 哈希」做判据（实测只跑只读文件期间别的窗口仍在改）。

## A/B 归因测试（FR-10） `serves: FR-10`

| 断言 | 反例（必须红） |
|---|---|
| `introduced`（带改动 − 回退）为空 | 出现任一新失败 |
| 同配置各跑 ≥2 次且 `stable=true` | 只跑一次就声称「不是本次引入」 |
| `restore()` 逐字节还原（sha256 复核） | 用「按路径检出」还原 |
| 产物落 `docs/reviews/` 且含两侧集合 | 只写一句「经确认非本次引入」 |

**实测基线（t2 卡，第二版据此定判据）**：首版改动 vs 回退 = 35 vs 25 → `introduced` 10 条
（全在 create/capture）；补 `keyOf` 后 → 两侧同为 25；同一配对连跑 3×3 逐次相同（既有脆弱性）。

## 基线分诊测试 `serves: FR-4, FR-3`

| 断言 | 反例（必须红） |
|---|---|
| `reverse ∪ other == failures` | `baseline:refresh` 引入一条新失败 → 既不在 reverse 也不在 other |
| `reverse ∩ other == ∅` | 同一条进两集合 |
| notes 用例列 == `reverse.txt` | 删一条 notes 条目 |
| 表头计数 == 两份 txt 实际行数 | 手改表头数字 |
| `红因类别` ∈ 受控枚举 | 自造类别 |
| 两集合 count 与 `unknown` 条数只减不增 | 上调 count / 把已知红因退回 unknown |

**分诊方向**：68 条里混着**真反向用例**（如 `tests/decompose-tools.test.ts` 的
「越权/不存在/人工闸门一律拒绝」）与**架构棘轮债**（如 `tests/layer-boundary.test.ts` 实测
`domain/checkpoint.ts`、`domain/job-spec.ts` 用 `Date.now()`）。后者红因是**既有 src 债**，
红线内不可达，记 `src-debt` + 「不可达」，清零另立需求。

## 越权 / 并发 / 空输入矩阵 `serves: FR-7`

范式照抄 `tests/seat-authorization.test.ts:71`——**逐格钉死 + 计数断言防漏格**：

```
   角色/条件 × 动作 → 三件套断言
   ┌────────────┬──────────┬──────────────┬───────────────┬──────────────┐
   │ 角色/条件   │ 动作      │ 断码          │ 零写入         │ 状态不变      │
   ├────────────┼──────────┼──────────────┼───────────────┼──────────────┤
   │ observer   │ move     │ SEAT_READONLY │ 台账 revision  │ status 不变   │
   │ worker     │ confirm  │ 拒绝          │ 产物无新章      │ confirmedAt  │
   │ 无席位      │ submit   │ NO_SEAT       │ 无文件落盘      │ …            │
   └────────────┴──────────┴──────────────┴───────────────┴──────────────┘
   末尾一条计数断言：cells === 角色数 × 动作数（改枚举时它先亮）
```

**「零写入」怎么判**：读台账 `revision` 与队列文件 mtime（比内容哈希便宜且不被时间戳噪声干扰）。
**「状态不变」**：读回记录后逐字段比对该动作**不该碰**的字段。

## 反向演练 `serves: FR-8`

| 演练 id | 改坏什么 | 期望 |
|---|---|---|
| `drill-code-matrix` | 删掉矩阵里任一码的断码断言 | 矩阵必红且点名该码 |
| `drill-exempt-ratchet` | 从 exempt 删一条（不更新 covered） | 棘轮用例必红 |
| `drill-inventory-guard` | 在 inventory 删掉一个仍存在于 src 的码 | 口径守卫必红 |
| `drill-hermetic-contract` | 让 harness 的根返回 `'.'` | 契约锚点守卫必红 |
| `drill-triage-refresh` | 往 failures.txt 追加一条假失败 | 分诊用例必红 |

## 判据命令清单 `serves: FR-1, FR-2, FR-4, FR-5, FR-8, FR-9, FR-10`

改动前后都要跑并留读数（读数**必须带工作树指纹**：HEAD 短哈希 + `git status --porcelain | wc -l`）：

| 判据 | 命令 | 期望 |
|---|---|---|
| 反向断言数（R4） | `grep -rhoE "\.(toThrow\|toThrowError\|rejects)\b" tests --include='*.test.ts' \| wc -l` | ≥ 改后冻结值，只增不减 |
| 反向占比（R5） | R4 ÷ `grep -rho "expect(" tests --include='*.test.ts' \| wc -l` | 改前 3.82% → 上升 |
| 零覆盖码数（R8） | `npx vitest run tests/error-code-inventory.test.ts` | 25 → **≤5** |
| 双形态 + 假阴性率 | 同上（守卫打印） | 假阴性率如实报出（改前 7/102 = 6.86%） |
| 权限模型真拦 | `npx vitest run tests/hermetic-guard.test.ts` | 写仓被 `ERR_ACCESS_DENIED` |
| 基线不劣化 | `pnpm baseline:check` | 失败集合差为空 |
| 反向演练 | `npx tsx tests/drill/reverse-drill-error-codes.mts` | 退出码 0 |
| A/B 归因 | `npx vitest run` 两侧各 ≥2 次 + 集合比对 | `introduced` 为空 |
| 零删断言 | `git diff -U0 -- tests \| grep -c '^-.*expect('` | **0** |
| 兼容性 | `git diff --stat` | `src/` 改动数 0；`it(` 标题改写数 0 |
