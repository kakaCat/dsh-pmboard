---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 测试策略与用例（REQ-261005123641-3982）

> 规范引用：C-11（发版前 `pnpm build` 必须过）。本需求只动 host 侧（不改客户端）⇒ 只需 host 构建，客户端 bundle 不受影响。

## 用例表（每条可跑、可证伪） `serves: FR-1, FR-2, FR-5`

| # | 场景 | 构造 | 断言 | 命令 |
|---|---|---|---|---|
| TC-1 | **并发串味回归**（本需求核心） | 两项目夹具 A/B；窗口 A 的会话根 = A、窗口 B = B | A 写 → **B 调 `reqboard_status`（会校正单例）** → A 再写：**两次都成功**；A 的产物只在 A 目录、B 目录**零新增** | `npx vitest run tests/project-root-concurrency.test.ts`（新增） |
| TC-2 | 真错配仍拒 | 记录 `workspaceRoot` = B（绝对、存在），调用窗口根 = A（人为错配） | 按新口径**放行并写进 B**（记录是权威）；**B 目录内的产物存在、A 目录零新增**——这是「按记录写」的正向断言 | 同上 |
| TC-3 | 声明根不可用 → 响亮拒绝 | 记录 `workspaceRoot` = 不存在的绝对路径 / 相对写法 | 抛 `REQBOARD_INVALID_WORKSPACE`（文案含该路径）；**调用方根目录零新增**（不降级、不误写） | 同上 |
| TC-4 | 校正失效的最后防线 | 仓储替身支持 `setWorkspaceRoot` 但实现为 no-op；记录根 ≠ 单例根 | 抛 `REQBOARD_PROJECT_ROOT_MISMATCH`，文案含两个绝对路径 | `npx vitest run tests/project-scope.test.ts`（既有「错配」用例改造后仍绿） |
| TC-5 | 存量记录（无 `workspaceRoot`） | 记录不带 workspaceRoot | 回落调用窗口 cwd、标注 `attributed=false`；**不误拒**（读不回根就不判） | 同上 |
| TC-6 | 写盘点门禁不退化 | 全仓扫描 | `PROTECTED_WRITERS` / `EXEMPT` / `PENDING_GUARD` 三份清单零改动，写盘点数与基线一致（新裸写仍红） | `npx vitest run tests/project-scope.test.ts`（`写盘覆盖` 用例） |

## 半截失败消除（FR-3）的判定方式 `serves: FR-3`

| # | 场景 | 断言 |
|---|---|---|
| TC-7 | `reqboard_capture` 守卫拒绝时 | 台账 `~/.dsh/reqboard/requirements/` 下**没有**新建记录；`history.jsonl` 无 `draft` 事件（守卫前置 = 零副作用） |
| TC-8 | `reqboard_capture` 正常路径 | 回执字段与现状逐字一致（`used_project_root` / `answers` / `defaults_used` / `note` / `board_link` 全在），`status=brainstorming` |

## 回归基线（每次改动后必跑） `serves: FR-4`

1. `npx vitest run tests/project-scope.test.ts` → 全绿（既有「错配必拒」「零写入」「t8 写盘覆盖」不得为通过而放宽）；
2. `pnpm test` → 失败数 ≤ 开工前基线（开工前先跑一次记基线）；
3. `npx tsc --noEmit` → 错误数 ≤ 基线；
4. 改动涉及构建产物时 `pnpm build` → 退出码 0，且 `dist/index.mjs` 命中新增符号（`assertWritableRequirementProject` 等）防「构建成功但没带上改动」（C-11）。

## 现场复演（验收时的真实证据） `serves: FR-5`

对本次事故窗口复演一次：在 A 窗口发起一次 `reqboard_capture`（弹框停留期间），
同时让 B 窗口调一次 `reqboard_status`，随后完成 A 的弹框 —— 断言：

- 回执**不再**出现 `REQBOARD_PROJECT_ROOT_MISMATCH`；
- A 的 `docs/requirements/<新REQ>/` 落在 A 项目下，B 项目目录零新增；
- 台账该 REQ 的 `history.jsonl` 有 `draft → brainstorming`，且回执里的 `used_project_root` = A 项目根。
