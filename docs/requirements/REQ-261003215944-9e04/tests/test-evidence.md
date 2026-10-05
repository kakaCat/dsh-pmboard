# 测试证据（REQ-261003215944-9e04）

> 每条都是**可复核**的：命令 + 结果摘要。工作区路径都真实存在。
> 结算结论放在最前面：**四条门禁里 build 与 kb:check 退出码 0；typecheck 与 test 未达标，逐条对账见 §3。**

## 1. 本需求新增的门（全绿）

| 用例文件 | 例数 | 钉住什么 |
|---|---|---|
| `tests/seat-authorization.test.ts` | 19 | 3 角色 × 6 动作共 18 格写成一张表**逐格钉死**；无席位不可写；存量折算；worker 推阶段被拒、worker 推自己的卡通过、observer 被拒且**零写入** |
| `tests/seat-real-store.test.ts` | 4 | **真实分片存储**上：席位落盘 → 摘要带回 → 绑定读命中；预筛只认显式 `seats`（不误伤存量）；改席后可见性翻转 |
| `tests/bind-seat.test.ts` | 16 | 派 worker 后读 **record.json**：`seats` 长度 2 且 owner 项逐字未变；解绑 owner → `REQBOARD_INVALID_INPUT` 且零写入；第 9 席 → `REQBOARD_SEAT_LIMIT`；**owner 自降被拒**；`reqboard_status.seats` 与台账逐字一致 |
| `tests/bind-tool.test.ts` | 6 | 工具壳输出契约：返回键 ⊆ 声明键；入参枚举只允许 worker/observer；**用宿主同一个校验器**跑入参与回执零违规 |
| `tests/seat-fold.test.ts` | 5 | 席位折算（无 `seats` → 单 owner；无来源窗口 → 空数组，不伪造 owner） |
| `tests/open-window-tool.test.ts` | 7 | 开窗成功/降级/失败三类路径；回执不含「已打开」 |
| `tests/cross-window-delivery.test.ts` | 6 | 跨窗口投递的 8 条失败收口 |
| `tests/doc-root-session.test.ts` | 6 | 读根与会话同源（FR-11）；不带会话 id 的对照仍判不存在 |
| `tests/dive-*.test.ts`（4 份） | 56 | 八事件表、单一写入口、确认推进红线、收敛度 |
| `tests/legacy-compat.test.ts` | 5 | 存量零改写（逐文件哈希相等）+ 回滚开关 |

## 2. 命令与结果

```bash
npx vitest run tests/seat-authorization.test.ts tests/seat-real-store.test.ts \
               tests/bind-seat.test.ts tests/bind-tool.test.ts
# → Test Files 4 passed | Tests 45 passed

npx vitest run tests/bind-tool.test.ts tests/bind-seat.test.ts tests/seat-authorization.test.ts \
               tests/seat-real-store.test.ts tests/seat-fold.test.ts tests/task-report.test.ts \
               tests/concurrency-limits.test.ts
# → 7 files / 全绿

grep -rn "bound[0]" src/ | wc -l          # → 0（全仓 16 处已改为按席位取第一条可写的）
grep -rn "\.dive = " src/ | wc -l         # → 9（**未收敛**，见自评报告 §4）
grep -c "reqboard_open_window\|reqboard_bind" README.md   # → 2
```

## 3. 四条门禁命令（**两条未达标，如实登记**）

| 命令 | 退出码 | 证据摘要 |
|---|---|---|
| `pnpm build` | **0** | `lib/client.js 340871 bytes`；`[verify-client] OK bundle=340871 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| `pnpm kb:check` | **0** | `kb-probe: 全部通过（11 项检查）`；修前 2 处生成物漂移，重新生成后零漂移 |
| `pnpm typecheck` | **2** | 2 处错误均在 `tests/worktree-injection.test.ts`(75,12)/(85,12)：`Property 'delivery' does not exist on type 'UseCaseDeps'`。该文件最后修改 2026-10-03 23:55，本次改动未触碰 |
| `pnpm test` | **1** | `Test Files 47 failed | 334 passed`、`Tests 97 failed | 3888 passed`。与动手前的失败清单**逐文件比对完全相同**；本轮唯一转绿：`tests/apply-wiring.test.ts`（工具面清单 18 → 24 对齐现状） |

**人工观察（只能人眼，已由用户确认）**：侧栏出现了新会话；右侧栏能渲染 README 正文。
原文：「两条都正常：侧栏出现了新会话、右侧栏能渲染 README 正文」。

## 4. 文档与门禁维护

- `docs/architecture/project-manual.md`：新增「席位模型与开窗」「Dive 状态转化单一入口」两节，
  **每行判据都亲手跑过**（12 个文件 123 例全绿）。
- `docs/knowledge/architecture.md`：补「文档读根权威源 = 会话工作区」与「席位授权」两行；
  随之重新生成 `code-map.md` / `code-map.symbols.tsv` / `INDEX.md`（kb:check 零漂移）。
- `README.md`：工具表补 `reqboard_open_window` 与 `reqboard_bind`。
- 设计文档订正（把工艺描述对齐到实现）：
  `design/data-model.md`（存量 39 → 实测 52 = 15 热 + 37 归档；`joinedAt`/`lastSeenAt` 为 epoch ms；
  `recover-auto` 的窄例外）、`design/interfaces.md`（`mySeat` 在 JSON 层是 `my_seat`）、
  `design/architecture.md`、`design/test-cases.md`。

## 5. 已知未达标 / 待裁定

1. `pnpm typecheck`、`pnpm test` 两条退出码非 0（既有红，归属见 §3）——已由用户裁定「按现状收，如实登记」。
2. dive 直写点 9 处未收口（收口要改契约，需回计划重新批）。
3. 系统提示词层的绑定口径未改（不参与门禁与写判定，改动会动提示词快照基线）。
4. `mySeat` / `my_seat` 键名二选一。

## 覆盖标注（covers，供 RTM 测试覆盖度门禁读取）

> 14 张父卡 + 12 张子卡逐张对应测试证据。子卡按「研发/联调/复核/测试」四段落在同一份用例上时
> 如实指向同一文件（不为了凑数编造不同命令）；复核段无独立用例时，证据是「对照结论 + 命令输出」。

### TC-1 覆盖 t-6491f8（t1 父卡：席位数据契约与读端折算）

covers: t-6491f8

证据：`npx vitest run tests/seat-fold.test.ts` → 5 passed（无 seats 折算单 owner、无来源窗口折算为空数组不伪造 owner）。

### TC-2 覆盖 t-b04628 / t-ab9bd4（t1 子卡：研发 / 复核）

covers: t-b04628
covers: t-ab9bd4

证据：同上 `tests/seat-fold.test.ts`；契约对账见 `docs/requirements/REQ-261003215944-9e04/tasks/t-ab9bd4.md`。

### TC-3 覆盖 t-dd3067（t2 卡：把授权判定从窗口绑定改为席位授权）

covers: t-dd3067

证据：`npx vitest run tests/seat-authorization.test.ts` → 19 passed（3 角色×6 动作 18 格矩阵、worker 推阶段被拒、worker 推自己的卡通过、observer 被拒且零写入）；`npx vitest run tests/seat-real-store.test.ts` → 4 passed（真实分片存储上落座→摘要→绑定读整链）；`grep -rn "bound[0]" src/ | wc -l` → 0。

### TC-4 覆盖 t-845a64（t3 卡：新增 reqboard_bind 并让 reqboard_status 暴露席位）

covers: t-845a64

证据：`npx vitest run tests/bind-seat.test.ts` → 16 passed（读 record.json：seats 长度 2 且 owner 项逐字未变；解绑 owner → REQBOARD_INVALID_INPUT；第 9 席 → REQBOARD_SEAT_LIMIT；owner 自降被拒；status.seats 与台账逐字一致）；`npx vitest run tests/bind-tool.test.ts` → 6 passed（输出契约 + 宿主同一校验器零违规）。

### TC-5 覆盖 t-5677c4（t4 父卡：新增 reqboard_open_window 并走 DSH 会话 fork）

covers: t-5677c4

证据：`npx vitest run tests/open-window-tool.test.ts` → 7 passed（fork 成功 / 无完成回合降级 / 服务缺失响亮失败 / 回执不含「已打开」）。

### TC-6 覆盖 t-2d7951 / t-147935 / t-5b815e / t-387acf（t4 四段子卡）

covers: t-2d7951
covers: t-147935
covers: t-5b815e
covers: t-387acf

证据：同上 `tests/open-window-tool.test.ts`（7 passed）；联调证据 `src/adapters/SessionWindowOpener.ts` 与 DSH 服务名对账，见 `tasks/t-147935.md`。

### TC-7 覆盖 t-ccd4de（t5 卡：跨窗口投递自署 kind）

covers: t-ccd4de

证据：`npx vitest run tests/cross-window-delivery.test.ts` → 6 passed（含冷会话 resume 与自署 source.kind）。

### TC-8 覆盖 t-e56f9c（t6 卡：让本窗口能接第二个项目）

covers: t-e56f9c

证据：`npx vitest run tests/capture-window-bound-policy.test.ts` → 5 passed（second / handoff 两条分支）。

### TC-9 覆盖 t-fd4f31（t7 卡：不破门红线断言）

covers: t-fd4f31

证据：`npx vitest run tests/gate-not-stretched.test.ts` → 4 passed（G0 人工回合缺失必须拒 + 有人工回合必须过；G3 计划未批必须拒）。

### TC-10 覆盖 t-b70b67（t8 父卡：Dive 事件纯函数与八事件表）

covers: t-b70b67

证据：`npx vitest run tests/dive-transition.test.ts` → 35 passed。

### TC-11 覆盖 t-f2a661 / t-e95aec（t8 子卡：研发 / 复核）

covers: t-f2a661
covers: t-e95aec

证据：同上 `tests/dive-transition.test.ts`；复核发现 `recover-auto` 窄例外并已写入设计文档（`design/data-model.md`）。

### TC-12 覆盖 t-165008（t9 卡：applyDiveTransition 唯一写盘入口）

covers: t-165008

证据：`npx vitest run tests/dive-apply-transition.test.ts` → 10 passed（弹框在途拒写、同值零写入、失败结构化）。

### TC-13 覆盖 t-5471d1（t10 卡：收敛调用点）

covers: t-5471d1

证据：`npx vitest run tests/dive-convergence.test.ts` → 6 passed；`grep -rn "\.dive = " src/ | wc -l` → 9（**如实登记未收敛到零**，见 `reviews/self-review.md` §4）。

### TC-14 覆盖 t-e1e6bb（t11 卡：推进弹框与看板继续接到同一方法）

covers: t-e1e6bb

证据：`npx vitest run tests/dive-confirm-advance.test.ts` → 5 passed（两条入口同事件；确认推进不得把 disarmed 变 armed）。

### TC-15 覆盖 t-0b1df0（t12 父卡：文档读根与会话同源）

covers: t-0b1df0

证据：`npx vitest run tests/doc-root-session.test.ts` → 6 passed；真机复验见 `tasks/t-0b1df0.md`。

### TC-16 覆盖 t-855a24 / t-905e30 / t-122c9a / t-fb3eec（t12 四段子卡）

covers: t-855a24
covers: t-905e30
covers: t-122c9a
covers: t-fb3eec

证据：同上 `tests/doc-root-session.test.ts`（6 passed）；联调验证宿主产物 `dist/index.mjs` 含 `sessionWorkspace`，见 `tasks/t-905e30.md`。

### TC-17 覆盖 t-818e89（t13 卡：迁移与兼容）

covers: t-818e89

证据：`npx vitest run tests/legacy-compat.test.ts` → 5 passed（存量零改写逐文件哈希相等 + 回滚开关 + schema 版本不升）。

### TC-18 覆盖 t-9bf47e（t14 卡：端到端验收与项目文档更新）

covers: t-9bf47e

证据：`npx vitest run <手册两节引用的 12 个判据文件>` → 12 文件 123 例全绿；`pnpm kb:check` 退出码 0；`pnpm build` 退出码 0；`npx vitest run tests/apply-wiring.test.ts` → 5 passed（工具面清单对齐 24 个）；`grep -c "reqboard_open_window\|reqboard_bind" README.md` → 2。人工观察由用户在活宿主确认：「两条都正常：侧栏出现了新会话、右侧栏能渲染 README 正文」。
