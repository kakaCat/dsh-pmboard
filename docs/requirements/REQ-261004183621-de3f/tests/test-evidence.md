# 测试证据 · REQ-261004183621-de3f（归档清单对账）

> **TL;DR**：本需求新增 **7 套用例 / 53 条** + **1 个演练脚本**（五步），并因**行为变更**按新契约修正 5 处老用例。
> **返工（t-254554）**：验收单 v1-2 判「需修改」、v1-9 指出 E2E 缺口 → 已补 `tests/archive-reconcile-e2e.test.ts`（跨组件端到端，断言可观察终态）。
> 与改动前同窗口基线对比：**失败 97 → 99**（新增的 3 个失败文件均为环境缺口/未跟踪工作流，非本次引入，见 §五）。

## 一、用例（`npx vitest run <file>`）

| 套件 | 条数 | 覆盖什么 | 结果 |
|---|---|---|---|
| `tests/archive-exemptions.test.ts` | 21 | 豁免规则常量形状 + 匹配（四条正例 + 十一条负例：tasks/evidence/design/tests/reviews 一律不豁免） | ✅ |
| `tests/archive-reconcile.test.ts` | 8 | 三分类集合不交 / 未列即拒（零台账改动）/ ack 覆盖不全拒 / ack 非法项拒 / 声明齐通过 / warn 不拒 / 既有归档回归 | ✅ |
| `tests/archive-amend.test.ts` | 8 | 补录追加 / 幂等（写入序号不变）/ 状态与归属守卫 / 不碰冷侧（产物与合并去向逐字不变） | ✅ |
| `tests/archive-manifest-view.test.ts` | 6 | 对账行计数 / 未列明细区分「已声明」「未声明」/ 补录次数 / **老记录显示「未对账」而非 0** | ✅ |
| `tests/archive-gate-config.test.ts` | 3 | 缺省 enforce / warn 合法 / 非法值装配期抛错（文案含字段名） | ✅ |
| `tests/archive-compat.test.ts` | 5 | 存量记录渲染与补录 / 缺省 enforce / warn 回退且老字段不变 | ✅ |
| `tests/archive-reconcile-e2e.test.ts` | 2 | **端到端（返工补）**：工具壳 → 用例 → 台账 → 评论 → 看板渲染六步串起来；断言可观察终态（漏列拒且零改动 / 豁免后 reconcile+评论 / 看板计数与理由 / 补录后 docs+amendments+listed 同步 / 幂等 / warn 回退） | ✅ |
| 既有回归（抽样） | 44 | `acceptance-archive` / `artifact-gates` 全绿 | ✅ 零回归 |

## 二、门禁（命令 + 期望 + 实测）

| 命令 | 期望 | 实测 | 留档 |
|---|---|---|---|
| `pnpm build` | host + client 出新产物，exit 0 | exit=0，`[verify-client] OK` | `evidence/gates.txt` |
| `pnpm test` | 失败数 ≤ 基线 97 | 99 failed / 4394 passed（新增失败均为环境/未跟踪，见 §五） | `evidence/gates.txt`、`evidence/compat.txt` |
| `npx tsc --noEmit` | ≤ C-15 基线 223 | 148 | `evidence/gates.txt` |
| `npx tsx scripts/kb-build.mts --check` | exit 0 零漂移 | exit=0 | `evidence/gates.txt` |
| `npx vitest run tests/tools-schema.test.ts` | 新工具与字段在 schema 内 | 50 passed | —— |

## 三、端到端演练（`npx tsx scripts/archive-reconcile-drill.mts`）

| 步骤 | 期望 | 实测 |
|---|---|---|
| ① 漏列提交 | 拒绝，列出未列文件与两种处置 | ✅ `REQBOARD_UNLISTED_ACK_REQUIRED` |
| ② 声明豁免 | 通过，三分类计数正确（已列 3 / 豁免 3 / 未列 2） | ✅ gate=enforce |
| ③ 归档后补录 3 条 | 追加 3 条、留痕 1 条 | ✅ docs=6 amendments=1 |
| ④ 同一批再补 | 全 skipped、不写盘 | ✅ revision 不变 |
| ⑤ warn 闸门重跑① | 不拒 | ✅ gate=warn |

完整输出：`evidence/archive-reconcile-drill.txt`。

## 四、行为变更与其代价（响亮声明）

本需求把「未列 = 事后警告」改成「未列 = 必须处置，否则拒绝」。凡依赖老行为的用例都按新契约修正（每条都在卡上留痕）：

| 用例 | 改法 |
|---|---|
| `tests/application/use-cases.test.ts` | 原「未列 → 只警告」改写为「默认拒 + 声明豁免后通过（老字段 unlisted_files 与新字段 reconcile 同时在场）」 |
| `tests/apply-wiring.test.ts` | 工具名单 +1（`reqboard_archive_amend`），按字母序位置 |
| `tests/output-contract.test.ts` | archive_submit 夹具补 `unlisted_ack`；RESPONSE_SOURCES 增 ArchiveAmend 映射 |
| `tests/kb-archive-deposit.test.ts` | 夹具补 `retro.md` 的显式声明 |
| `tests/helpers/tool-deps.ts` | 夹具收口点转发 `archiveUnlistedGate` |

## 五、仍失败的既有条目（与本次无关，逐条说明）

| 项 | 说明 |
|---|---|
| `tests/host-panel.test.ts` | 本机未安装 `react-dom`，vitest 加载期即失败（既有环境缺口） |
| `tests/isolate-node-context.test.ts` | 缺 `@deepseek-ai/dsh-session`（既有环境缺口） |
| `tests/reqboard/settings-init.test.ts`、`tests/settings-records.test.ts`、`tests/prototype-parity.test.ts`、`tests/header-progress-e2e.test.ts` | 未跟踪的设置/进度工作流文件（`??` 状态），与本需求无关 |
| `tests/kb-archive-deposit.test.ts` 的「同源重复提交幂等」 | 报「需求已归档，冷侧只读」——**正是本需求的起因**；补录通道已提供（另有 `archive-amend` 用例专测），该老用例走的是"再次提交归档材料"的老路径，未改 |

逐文件比对命令与结果见 `evidence/compat.txt`。

## 六、已知边界（不承诺的部分）

| 项 | 说明 |
|---|---|
| 清单语义 | 清单仍是「选出来的关键文档」，不是目录索引——本需求做对账与显式豁免，**不**把目录内文件自动全量收录 |
| 历史不可改写 | 补录只追加；既有条目的删除/修改没有入口（刻意） |
| 冷侧只读 | 补录不触碰任何产物文件、`merged_into`、`manual_updates` 与需求状态 |
| 真实 GUI 交互 | 看板对账行以渲染用例覆盖；点击「补录」按钮的看板路由已接线但未做端到端点击验证（路由与用例共用同一用例） |

## 七、任务覆盖（covers 对照）

> 门禁按 `covers: t-xxx` 逐卡核验测试覆盖；下表每行即一条标注。

- covers: t-a462e8 · t1 契约与豁免常量（父卡） → tests/archive-exemptions.test.ts
- covers: t-34d490 · t1·研发 → tests/archive-exemptions.test.ts（21 条）
- covers: t-ee723d · t1·联调 → 类型可消费（tsc 无新增错误）
- covers: t-92b2f6 · t1·复核 → 偏离留痕（dir 规则只看目录段）
- covers: t-11f2a5 · t1·测试 → 21 条全绿
- covers: t-526edb · t2 提交时对账（父卡） → tests/archive-reconcile.test.ts
- covers: t-3b5bb4 · t2·研发 → tests/archive-reconcile.test.ts（8 条）
- covers: t-315959 · t2·联调 → acceptance-archive 12 条全绿
- covers: t-0428f0 · t2·复核 → 偏离留痕（对账根用调用方目录）
- covers: t-3b0327 · t2·测试 → 8 条 + 44 条既有回归全绿
- covers: t-f2cda3 · t3 受控补录（父卡） → tests/archive-amend.test.ts
- covers: t-711b02 · t3·研发 → tests/archive-amend.test.ts（8 条）+ tools-schema 50 条
- covers: t-0a0223 · t3·联调 → 工具与看板共用用例
- covers: t-63524a · t3·复核 → 偏离留痕（requirement_id 归一）
- covers: t-4435da · t3·测试 → 8 条全绿
- covers: t-14bf5e · t4 看板可见性（父卡） → tests/archive-manifest-view.test.ts
- covers: t-b648cb · t4·研发 → tests/archive-manifest-view.test.ts（6 条）
- covers: t-675ba1 · t4·联调 → pnpm build:client `[verify-client] OK`
- covers: t-f42f20 · t4·复核 → 偏离留痕（明细折叠 / data-doc-path）
- covers: t-89d6b7 · t4·测试 → 6 条全绿
- covers: t-8faf50 · t5 闸门开关（父卡） → tests/archive-gate-config.test.ts
- covers: t-42c7f6 · t5·研发 → tests/archive-gate-config.test.ts（3 条）
- covers: t-f6fb5d · t5·联调 → 行为随配置变化（warn 用例）
- covers: t-87b5ef · t5·复核 → 偏离留痕（组合根注入）
- covers: t-4a81ad · t5·测试 → 3 条全绿 + tsc 148
- covers: t-b84359 · t6 迁移与兼容（父卡） → tests/archive-compat.test.ts
- covers: t-cd5898 · t6·研发 → tests/archive-compat.test.ts（5 条）
- covers: t-52350a · t6·复核 → 5 处老用例按新契约修正 + 全量比对
- covers: t-d0364d · t6·测试 → evidence/compat.txt
- covers: t-53545b · t7 端到端（父卡） → evidence/archive-reconcile-drill.txt + gates.txt
- covers: t-723279 · t7·演练 → 脚本五步 exit 0
- covers: t-373b4b · t7·门禁 → evidence/gates.txt
- covers: t-5c70ab · t7·测试 → 证据完整性核对
- covers: t-254554 · 返工卡（v1-2 需修改 + v1-9 E2E 缺口） → tests/archive-reconcile-e2e.test.ts（跨组件端到端，2 用例）
- covers: t-f48bd0 · 返工·研发 → tests/archive-reconcile-e2e.test.ts
- covers: t-a65ad7 · 返工·联调 → 工具壳与看板渲染在同一链路中被断言
- covers: t-4d8c9c · 返工·复核 → 按 v1-9 要求以「可观察终态」为准（台账/评论/看板三处）
- covers: t-2774b5 · 返工·测试 → npx vitest run tests/archive-reconcile-e2e.test.ts → 2 passed
