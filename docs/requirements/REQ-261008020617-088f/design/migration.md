---
requirement_refs: [RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8]
---

# 迁移设计（REQ-261008020617-088f）

> 本需求**无存量数据迁移**（不动台账、不动队列、不动 `state/` 里既有文件的形状）。
> 本份的"迁移"= 代码与调用点的分批搬迁步骤 + 每步验证 + 回滚。故「兼容期行为」写的是
> **接口并存期的零窗口**（一次性改签名，靠编译期兜底）。

## 迁移步骤 <!-- serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 -->

| 编号 | 操作 | 验证（跑什么看到什么算过） | 失败回滚 |
|---|---|---|---|
| M-1 | 新建 `application/gate/rtm-gates.ts`：把三份克隆合成一份实现 + 三个同名薄壳；删三个旧文件；`gate/index.ts` 改指向新模块；3 份单测构造改 `FileDocRepository`（根的纪律写在函数注释里） | `npx vitest run tests/unit/gate` → 3 份全绿；`npx tsc --noEmit` → 0 错；layer-boundary 越界清单 **15 → 9** | `git checkout -- src/application/gate tests/unit/gate`（新文件直接删） |
| M-2 | `ports.ts` 增 `HostFsPort`；新增 `adapters/FileHostFs.ts`；`rtm-health` 全部 I/O 改经 `host`（根逐次显式）；`rtm-yaml` / `QueryState` / 3 个 HTTP 路由 / 相关测试同步改签名；`UseCaseDeps` 增必填 `hostFs` 并在 5 个装配点补齐 | 上面两条 + `npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/rtm-trigger-prototype.test.ts tests/submit-prototype.test.ts tests/canceled-audit-holds.test.ts tests/canceled-four-faces.test.ts tests/canceled-coverage-gate.test.ts tests/rtm-yaml-live-tasks.test.ts` → 全绿；越界 **9 → 7** | 同上（按文件 `git checkout --`）+ 删 `adapters/FileHostFs.ts` |
| M-3 | `ports.ts` 增 `DiagSinkPort`；新增 `adapters/FileDiagSink.ts`；`diag-log.ts` 改为无 I/O 门面（调用点不变）；组合根与 2 份测试的 `initCaptureDiag` 改吃 sink 实例 | 上面两条 + `npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts` → 全绿；越界 **7 → 5** | `git checkout -- src/application/internal/diag-log.ts tests/...`；删 `adapters/FileDiagSink.ts` |
| M-4 | 新增 `application/internal/paths.ts`（纯 `isAbsolutePath`）；两个用例的 `isAbsolute` / `statSync` / `process.cwd()` 改走纯函数与 `deps.hostFs` | 上面两条 + `npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts` → 与改前读数一致；越界 **5 → 1** | `git checkout -- src/application/use-cases/{Capture,Create}Requirement.ts src/application/internal/paths.ts` |
| M-5 | `ReqboardDiveManager.ts` 自 `application/dive/` 外移到 `adapters/`；重算相对 import；改 `src/index.ts:128` 与 2 份测试（含按**路径字符串**读文件的 `dive-manager-wiring.test.ts`） | 上面两条 + `npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts` → 全绿；越界 **1 → 0**（RF-1 达成） | `git mv` 反向 + `git checkout -- src/index.ts tests/...` |
| M-6 | 新增 `tests/fixtures/layer-boundary-exempt.json`（`frozenCount: 0`、`entries: []`）；`tests/layer-boundary.test.ts` 抽出扫描函数 + 加豁免四条判据与"过期豁免即红"的合成输入用例 | `npx vitest run tests/layer-boundary.test.ts` → application 用例绿、豁免用例绿；整文件仍剩 tools/http 1 条红（另一条腿，未进台账）；`git diff` 中 `LAYER_RULES.forbidden` 零改动 | 删台账文件 + `git checkout -- tests/layer-boundary.test.ts` |
| M-7 | 收尾：`npx tsc --noEmit`；`pnpm baseline:check`；`grep -rn "node:\|@deepseek-ai/" src/application`；文档更新清单里三项落盘（含 `code-map` 最小手改） | 四条命令的读数写进验收材料（命令 + 输出摘要） | 文档改动可单独 revert（`src/` 与 `docs/` 分开提交） |

**顺序纪律**：M-1..M-5 每步都必须以"越界条数下降 + 触及用例全绿 + tsc 0 错"三步同时成立才进下一步；
任何一步出现用例新红 → **停下改**，不带着红进下一批（否则分不清是哪一批引入的）。

**与 `architecture.md` 批次表的对应**：M-1 = B1；**M-2 + M-3 = B2**（同一批"族②宿主态与日志"按
`rtm-health` / `diag-log` 两个独立可验证的小步走，各自带读数 9→7→5）；M-4 = B3；M-5 = B4；M-6 = B5；
M-7 = 收尾。

## 回滚路径 <!-- serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6 -->

- **单元回滚**：每步只涉及少量文件，用 `git checkout -- <显式路径>` 逐文件回退（**禁止 `git checkout .`**：
  工作树里有 262 个其他需求的在途改动，一次全退会毁掉别人的活）；新增文件直接删除。
- **整体回滚**：本需求的所有改动都在"新增端口 + 改签名 + 迁移一个文件 + 测试豁免面"范围内，
  `git revert <本次 commit>` 即可整体回到改前（无数据、无配置、无状态文件形状变更 ⇒ 回滚无残留）。
- **回滚后必须复跑**：`npx vitest run tests/layer-boundary.test.ts` + `npx tsc --noEmit`，
  确认越界清单回到 15 条、tsc 0 错——"回滚成功"也要有读数，不能凭感觉。

## 兼容期行为 <!-- serves: RF-2, RF-3, RF-4, RF-5, RF-6 -->

- **接口并存窗口 = 0**：函数签名一次性改（`workspaceRoot: string` → `docs: DocRepository`、
  `stateDir` → `host + root`、`initCaptureDiag(absPath)` → `(sink)`）。不留"旧签名转发"的过渡态
  ——本仓先例（旧单册端口的并存期）证明过渡态会长出第二套真相。改签名靠 **TS 编译期**兜底：
  `npx tsc --noEmit` 报错清单就是"还要改哪里"的完整清单，故无静默漏改。
- **`UseCaseDeps.hostFs` 必填、无未装配降级**：不做"可选 + 运行期兜底"（那会把装配遗漏从编译期
  挪到运行期，本仓老教训）。5 个装配点（`src/index.ts` + 4 个测试 harness）在 M-2 一次补齐。
- **HTTP 路由的边界情况**：看板 `ctx.deps.applicationDeps` 是可选字段，故两条路由用
  `ctx.deps.applicationDeps?.hostFs ?? new FileHostFs()` 兜底——`FileHostFs` **无构造参数、无状态**，
  兜底实例与注入实例行为逐字相同（既有先例：`panels.ts` / `stages.ts` 同样在路由里直接 `new` 适配器）。
- **`diag-log` 的未初始化态不变**：sink 未装配时门面照旧只 `console.log`（改前 `diagFile === undefined`
  的行为），故"未装配 = 老行为"这句话在日志这条链上是真的。
- **`state/` 下既有文件**：`rtm-failures.json` / `rtm-trigger-traces.json` 的**文件名、键、顺序、
  100 条上限、JSON 缩进（2 空格）**一律不变，改前写下的文件改后照读 ⇒ 无需迁移、无需双写。

## 灰度与观测 <!-- serves: RF-1, RF-8 -->

不适用（纯内部重构：无灰度开关、无流量切分；工具面与看板行为不变，用户侧无可观测差异）。
观测改用**收尾读数**：越界条数（15→0）、层门失败用例数（2→1）、`tsc` 错误数（0）、
相关用例集失败差集（⊆ 改前基线）四项，逐项进验收材料。

## 关键决策与取舍 <!-- serves: RF-3, RF-4, RF-6 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 搬迁粒度 | 一次性改 8 个文件 + 测试（一轮"大爆炸"） | 按四族分 5 批，每批只改一类东西 | refactor 档纪律；且每批都有可数读数（越界条数），出问题时能定位到批 |
| 是否留旧签名转发 | 给三个门/`initCaptureDiag` 保留旧签名适配层 | 一次性改，靠编译期兜底 | 过渡态会长出第二套真相（本仓既有端口的并存期教训）；TS 必填字段让漏改当场报错 |
| `state/` 目录布局 | 端口构造期绑定 `stateDir` | 端口方法收 `root`，`.dsh-data/state` 在适配器内拼 | 根逐次显式（同 `gate-read-root.md`）；同时把散在 3 处的目录布局收敛成一处契约 |
| 日志调用点 | 把 `captureDiag(msg)` 改成 `deps.diag.write(...)`（全量注入） | 门面留原地、只注入 sink | 6 个 application 调用点零改动 ⇒ 本批风险面只剩"初始化 + 2 份测试" |

## 技术方案与亮点 <!-- serves: RF-1, RF-7 -->

**迁移手法**：按"族的独立性"切批，每批的完成判据都是**可数读数**（越界条数 + 触及用例 + tsc），
而不是"我觉得改完了"。族的顺序按依赖排：先合并克隆（改函数体，不动签名以外的面）→ 再引入端口
（改签名，编译器兜底）→ 最后搬迁文件（纯物理移动）。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向 |
|---|---|---|---|---|
| 迁移进度判据 | "整文件转绿才算完" | 越界**条数**逐批下降（15→9→7→5→1→0） | 本轮不给自己登记豁免，清零前不可能全绿；用条数才能每批可验证 | 本文 M-1..M-6 的验证列 |
| 回滚 | `git checkout .` 一键回退 | 逐文件显式路径回退 + 复跑读数 | 共享工作树有 262 个在途改动，全退会毁别人的活 | 本文「回滚路径」 |
| 兼容期 | 留双签名并存一段时间 | 零并存窗口，编译器当清单 | 并存期会静默长出第二套真相 | 本文「兼容期行为」 |
