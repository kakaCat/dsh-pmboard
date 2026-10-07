# 验收实测记录（REQ-261007100513-6749）

> 环境：工作树 `/Users/mac/Documents/ai/dsh/dsh-pmboard`（**多窗口共享**，存在他窗口在飞改动）；
> Node 侧 `pnpm typecheck` 退出码 0；本沙箱**禁止 child_process**（凡报
> `Access to this API has been restricted. Use --allow-child-process` 的失败记为**环境性**，不是代码回归）。

## 0. 任务 → 测试覆盖对照（`covers` 标注）

> 21 张卡（7 父卡 + 14 子卡）逐张标注承接测试；复核子卡由独立子代理执行，结论见
> `reviews/delivery-review.md`，其证据与研发段同一套件（复核只读、不新增产物）。

| 任务 | 角色 | 承接测试（`covers`） |
|---|---|---|
| t-74eb0c | t1 契约·父卡 | `covers: t-74eb0c` → `tests/contract-types.test.ts`(10) |
| t-7e85ab | t1 契约·研发 | `covers: t-7e85ab` → `tests/contract-types.test.ts`(10) |
| t-6177ea | t1 契约·复核 | `covers: t-6177ea` → 同套件（复核 19 项逐字核对，见评审报告） |
| t-cb4684 | t2 头部稳定化·父卡 | `covers: t-cb4684` → `tests/capture-section-stability.test.ts`(11) |
| t-6661e0 | t2 头部稳定化·研发 | `covers: t-6661e0` → 同套件 |
| t-9d7946 | t2 头部稳定化·复核 | `covers: t-9d7946` → 同套件 + 受保护套件 105 绿 |
| t-ef4b17 | t3 尾部投递·父卡 | `covers: t-ef4b17` → `tests/volatile-notice.test.ts`(25) |
| t-9a1d24 | t3 尾部投递·研发 | `covers: t-9a1d24` → 同套件 |
| t-5dd294 | t3 尾部投递·复核 | `covers: t-5dd294` → 同套件（含四条新剧本） |
| t-95086b | t4 记账批量·父卡 | `covers: t-95086b` → `tests/task-move-batch.test.ts`(16) + `tests/done-throttle-guidance.test.ts`(6) |
| t-b19a96 | t4 记账批量·研发 | `covers: t-b19a96` → 同两套件 |
| t-7d94a6 | t4 记账批量·复核 | `covers: t-7d94a6` → 同两套件 + `tests/application/use-cases.test.ts`(21) |
| t-111f24 | t5 子卡预算·父卡 | `covers: t-111f24` → `tests/subtask-budget.test.ts`(17) |
| t-100945 | t5 子卡预算·研发 | `covers: t-100945` → 同套件 |
| t-a30d70 | t5 子卡预算·复核 | `covers: t-a30d70` → 同套件（含两条真实形状用例） |
| t-863abc | t6 度量命令·父卡 | `covers: t-863abc` → `pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286`（逐位复现基线） |
| t-3f60b3 | t6 度量命令·研发 | `covers: t-3f60b3` → 同命令 |
| t-a5782d | t6 度量命令·复核 | `covers: t-a5782d` → 同命令 + 独立 python 实现交叉验证两例 |
| t-f0684a | t7 兼容回归·父卡 | `covers: t-f0684a` → `tests/legacy-compat-6749.test.ts`(19) |
| t-6c1af5 | t7 兼容回归·研发 | `covers: t-6c1af5` → 同套件（含 14 次自挑变异） |
| t-7606a5 | t7 兼容回归·复核 | `covers: t-7606a5` → 同套件（复核自挑 4 次变异，返工后全部变红） |

## 1. 本需求各套件（逐条实跑）

| 命令 | 结果 | 对应条款 |
|---|---|---|
| `npx vitest run tests/contract-types.test.ts` | **10 passed** | FR-1..FR-6（契约层） |
| `npx vitest run tests/capture-section-stability.test.ts` | **11 passed** | FR-1 |
| `npx vitest run tests/volatile-notice.test.ts` | **25 passed** | FR-2 / FR-3 |
| `npx vitest run tests/task-move-batch.test.ts tests/done-throttle-guidance.test.ts` | **22 passed** | FR-4 / FR-5 |
| `npx vitest run tests/subtask-budget.test.ts` | **17 passed** | FR-6 |
| `npx vitest run tests/legacy-compat-6749.test.ts` | **19 passed** | 兼容与迁移（t7） |
| `npx vitest run tests/application/use-cases.test.ts tests/task-move-role.test.ts tests/task-move-snapshot.test.ts tests/output-contract.test.ts` | 全绿（21 / 5 / 2 / 42） | 回归 |
| `npx vitest run tests/capture.test.ts tests/stage-prompts.test.ts tests/acceptance-criteria.test.ts` | 105 passed / **1 存量红**（`不许沉默`） | 受保护套件 |
| `pnpm typecheck` | **exit 0（0 错）** | C-15 |
| `pnpm build` / `pnpm build:client` | exit 0 / `[verify-client] OK bundle=755113 bytes` | C-11 / C-12 |

### 存量红的只读取证（`不许沉默`）

```
git show HEAD:src/application/internal/capture-section.ts | grep -c 不许沉默   → 0
git grep -c 不许沉默 HEAD -- src                                            → 空
但 HEAD 的 tests/capture.test.ts:143 已断言它 ⇒ HEAD 即红，与本需求无关
且 .dsh-data/baseline-cases.txt:7 已存底
```

## 2. 关键性质剧本（FR-1/FR-2 的机器判据）

| 剧本 | 断言 | 结果 |
|---|---|---|
| 头部稳定 | 同 (facts,tasks) 两次组装**逐字节相等**；status 与在制卡变化后仍相等 | ✅ |
| 头部版本数 | **连续 8 次变更后头部段版本数 = 1** | ✅ |
| 未绑定 × 待捕获命中 | 整段与改造前**逐字节相同**（1060 字符，以 `toBe(改造前函数输出)` 钉死） | ✅ |
| 无生产者覆盖 | 经 `applyTaskRollup`（不经任何生产者）推进到 accepting → 装配缝扫差异并投出状态行与 accepting 纪律 | ✅ |
| 投递被丢弃 | `agent/inbox/discarded` → 头部继续承载**且**下次协调补投（两路至少一路在场） | ✅ |
| 空态不翻版 | 「A → 空(24s) → B」只投 2 次；空态久留 5 分钟补投一次且不重复 | ✅ |
| 投递通道 | 走 `next-step`；`followup` 调用数 = 0 | ✅ |

## 3. 变异测试（可证伪性）

**t7 复核方自挑的 4 次变异**（返工后全部变红）：

| 变异 | 结果 |
|---|---|
| F′ 夹具真形状 → 假形状（`executions.sessionId` 改回子会话 UUID） | 2 条红（归属由 `parent-unique-in-progress` 变 `exact-session`；需求级评论变卡评论） |
| G 删 `validateQueue.ts` 的 `REQUIRED_TASK_FIELDS` 块 | 6 条红 |
| H 删 `request-counter` 的 `await port.write(next)` | 1 条红（非空前哨） |
| I 删 `index.ts` 的 `parsed?.v === 1` | 1 条红（源码字面量守卫） |

**实现者自挑的 14 次变异**（t7 报告）：P1 加必填 / P2 60→55 / P3 单卡加 `partial` / P4 `countable` 恒真 / P5 `QUEUE_VERSION`→2 / P6 节流失效 / P7 子卡不再豁免 / P8 `available` 恒真 / P9 写路径回填 / J1 回退 `note`（request-counter）/ J2 回退 `note`（ExecuteTask）——**全部变红、还原复绿**。

> 口径说明：变异只在 `/tmp` 仓库副本进行，真实工作树零改动；副本 11,220 个文件 mtime 零差异（该用例自身不写仓）。

## 4. 全量失败归属（权威差集）

- 本窗口全量 `npx vitest run`：**51 文件 / 95 用例失败 / 6,775 通过**。
- 其中 **23 条为环境性**（child_process 被沙箱拒：`typecheck`、`queue/QueueRepository`、`prompt-gates`、`kb-cli-parity` 等）。
- 权威差集 `npx tsx scripts/test-baseline.mts --check` 的**真新增**逐条点名结果为：`client-view`(3)、`compat-req-261006201814`(2)、`header-progress-e2e`(2)、`kb-*`(10)、`legacy-board-route`(2)、`live-tasks-single-source`(2)、`migrate-ledger-v8v9`(2)、`prompt-gates`(1)、`queue/QueueRepository`(1)、`reqboard/landing-failure-loud`(1)、`skills-materialize`(1)、`system-file-opener`(1)、`typecheck`(1)、`error-code-inventory`(3, 点名 `REQBOARD_PROTOTYPE_*` 两码与 `REQBOARD_FILE_CONFLICT` 覆盖态) —— **无一条属本需求**。
- 定向复查的 6 条（`dive-gate-prompt` 2 / `dive-session-driver-wiring` 3 / `size-budget` 1）与 `layer-boundary` 3 条，与 `.dsh-data/baseline-test.txt`（10-06）的**汇总行与行号逐字相同** ⇒ 存量红。
- 抽查四类最相关失败逐条判非我方：`template-address-injection`（地址段为空＝他窗口 REQ-261006201841-944d 在飞）、`interruption-checkpoint`（我方 turn/end 钩子有 try/catch 且顺序在断点写入之前）、`triad-gate`/`e2e-triad-gate`（需求级迁移变为人工闸门＝他窗口在飞）、`task-status-integration`（多出 `run`/`workflow` 键＝他卡工具改动）。

## 5. 同口径成本读数 + 三条免责声明

```
pnpm cost:report --req REQ-261007100513-6749
会话 18 / 请求 1,915 / 未命中 3,209,368 / 命中缓存 369,900,672 / 输出 1,655,947 / 墙钟 5.7h
缓存失效点 1 条：10-07 15:10:08（未命中 581,416）——其前空档 163.6 分钟 ⇒ 前缀缓存 TTL 过期
（对照：同窗口 29.5 分钟空档未触发重算 ⇒ TTL 介于 30 与 164 分钟之间）
```

**不得据此宣称效果**，三条原因：

1. **供应商相关**：基线 7a43 的 24 次全量重算全部发生在 `kimi-coding/k3`；本需求跑在 `deepseek-flash`，该窗口 9 次头部重写**全部保住缓存**（0 失效点），唯一一次重算是 TTL 过期。即「头部重写 ⇒ 缓存作废」在本 provider 上不复现。
2. **做法差异**：本需求 17 个子代理全部**紧凑输入包 + 不用 fork**；基线有 9 个 `subagent_fork` 带整段父上下文。这是做法差异，不是代码差异。
3. **改造在自身执行期基本未生效**：t4（批量收尾）在末期才落地，此前一直用旧单卡路径收尾并**当场撞过 60s 节流**（历史可查）。效果证据只能是单测与剧本断言，或将来在 kimi 类 provider 上做同口径对照。

## 6. 复现命令

```bash
# 本需求各套件
npx vitest run tests/contract-types.test.ts tests/capture-section-stability.test.ts \
  tests/volatile-notice.test.ts tests/task-move-batch.test.ts \
  tests/done-throttle-guidance.test.ts tests/subtask-budget.test.ts \
  tests/legacy-compat-6749.test.ts
# 类型与构建
pnpm typecheck && pnpm build
# 同口径成本（基线快照点复现）
pnpm cost:report --req REQ-261006130057-7a43 --until 1791338511286
# 失败归属
npx tsx scripts/test-baseline.mts --check
```
