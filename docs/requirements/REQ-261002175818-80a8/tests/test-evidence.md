# 测试证据（REQ-261002175818-80a8）

> 所有数字均为实跑输出。命令原样可复跑；口径与基线并列，便于人工复核。

## 一、回归基线

| 时点 | 命令 | 结果 |
|---|---|---|
| 开工基线（t1 收尾时） | `npx vitest run` | 97 failed / 3794 passed |
| t3 之后 | 同上 | 97 failed / 3815 passed |
| t5 之后 | 同上 | 97 failed / 3850 passed |
| t7 之后 | 同上 | 96 failed / 3889 passed |
| t8 之后 | 同上 | 96 failed / 3902 passed |
| **收口（t10）** | 同上 | **96 failed / 3910 passed / 20 skipped（4026）** |

判据：**失败数自开工以来零新增**（末值为 96，比基线 97 还少 1）。通过数增量为各卡新增用例
（含其他窗口并发改动，故按卡分别留档，不作单一归因）。

## 二、本需求新增用例（九份文件，联跑 106/106 全绿）

| 文件 | 条数 | 钉住的纪律 |
|---|---|---|
| `tests/round-capacity.test.ts` | 41 | 三量合成、声明下限、建议批数、摘要预算（含多卡分支 ≤ maxChars） |
| `tests/plan-overcapacity-notice.test.ts` | 18 | 提交侧结构化报出（FR-4）、批准前可见（FR-6）、非默认路径不许静默放行 |
| `tests/capacity-reference.test.ts` | 13 | 适配器三级降级、不可得**不补 0**、任务树与输入包上屏 |
| `tests/session-probe-wiring.test.ts` | 6 | 生产装配可达性（整链真 H1–H5 驱动；三处接线各自回退会红） |
| `tests/plan-smoke.test.ts` | 8 | 收口三条真实冒烟 + 兼容两态 + 配置两态 |
| `tests/plan-footprint-compat.test.ts` | 7 | 老数据不补键、空数组 ≠ 缺键、schemaVersion 不升 |
| `tests/plan-footprint-propagation.test.ts` | 7 | 声明活着走到任务卡（四条路径） |
| `tests/plan-footprint.test.ts` | 4 | 缩水被拒、形状非法、未声明不判定 |
| `tests/plan-footprint-tool-schema.test.ts` | 4 | 工具入参收下 footprint（修前必红） |

## 三、收口三条冒烟（t10 卡面要求）

| 冒烟 | 实测 |
|---|---|
| `{files:100, anchors:20, chars:6000}` | `detailUnits=113`、`capacity=16`、`suggestedBatches=8`、被标红；写 `⚠️超容量(建议8批)` 通过；写 `建议1批` → `plan_overcapacity_marker_missing` 且台账零变更 |
| `{files:1, anchors:2, chars:800}` | 2.4 DU 不误报：`overCapacity` 为**在场空数组**，无标记也放行 |
| 删掉 `footprint` | 照旧通过：`success=true`、`overCapacity=[]`、`hasOwnProperty(footprint)=false` |

命令：`npx vitest run tests/plan-smoke.test.ts tests/plan-footprint-compat.test.ts tests/plan-overcapacity-notice.test.ts`
→ **33/33 全绿**。

## 四、其他门禁

| 门禁 | 结果 | 备注 |
|---|---|---|
| `npx tsc --noEmit` | 146 条 | 拆分时点文档基线 223；本需求触及文件 **0 错**；比 145 多的那 1 条来自其他窗口并发改动 |
| `node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs` | 退出码 0 | 生成物与片段逐字节一致、可复现 |
| `npx vitest run tests/prompt-gates.test.ts` | 13/13 | 注入文本里的 reqboard_* ⊆ 注册集合、链声明与 STAGE_CHAIN 一致 |
| `npx vitest run tests/size-budget.test.ts` | 存量红 | 本需求**未把任何文件新推过 400 行**（新建 `Footprint.ts` 217、`node-input-package.ts` 395） |
| `tests/output-contract.test.ts` 的 `defineSubmitTool` 专项 | 通过 | 整份另有 3 条存量红（其他窗口新增工具缺 `RESPONSE_SOURCES`），与本需求无关 |

## 五、证据强度声明（如实）

1. **全量只比计数、未留失败用例名清单** ⇒ 无法排除「修好一条旧失败 + 引入一条新失败」的同数替换。
   反向证据：新增文件全部结构隔离（自有 mkdtemp 根与合成 id、不 import 他人状态），且各卡均做过变异验证。
2. **`tests/isolate-node-context.test.ts` 在本机整份加载失败**（缺 `@deepseek-ai/dsh-session` 包），
   故「节点结算路径」的证明落在 `tests/session-probe-wiring.test.ts` 的同款装配形状上（组合根形状逐字照抄）。
3. **`plan-mode.test.ts:281` 一条存量红**（`requirement_status` 收到 `undefined`）在收口时被点名，
   自开工以来一直在基线失败集合内，归属待认领。

## 六、逐卡覆盖映射（covers）

> 每张卡（含父卡与 dev/integrate/review/test 子卡）由其证据文件覆盖；命令见上文各节。

### t1 体量算术落地（证据：tests/round-capacity.test.ts 41 条）
covers: t-5302c3 — 三量合成 / 声明下限 / 建议批数 / 摘要硬预算
covers: t-7e0fba — 研发：Footprint.ts 与 limits 常量落地
covers: t-8c6989 — 联调：判定与容量口径一致
covers: t-08067b — 复核：变异验证（删白名单行即红）
covers: t-0f0ea6 — 测试：本文件 41/41 全绿

### t2 体量声明进台账、活到任务卡上（证据：tests/plan-footprint-propagation.test.ts 7 条）
covers: t-ab73f4 — 四处映射贯通 + 计划权威语义
covers: t-59c331 — 研发：protocol / plan-landing / approved-plan-landing / Decompose
covers: t-acaea7 — 联调：队列卡三字段与计划逐字相同
covers: t-bf4b64 — 复核：反向证伪（删白名单行即红，校验和一致还原）
covers: t-1bd4c9 — 测试：7/7 + 全量零新增

### t3 工具门面（证据：tests/plan-footprint-tool-schema.test.ts 4 条）
covers: t-7b805f — 入参收下 footprint + 出参声明超容量两项
covers: t-83d478 — 研发：schema 声明（修前必红）
covers: t-7781e5 — 联调：壳层契约形状 6/6
covers: t-720709 — 复核：变异验证会红 + 覆盖缺口如实记录
covers: t-85f2d7 — 测试：4/4 + 全量通过数 +4

### t4 余量读数接进来（证据：tests/capacity-reference.test.ts 13 条）
covers: t-18958f — 端口 + 适配器三级降级 + 不冒充 0
covers: t-8038bf — 研发：contextPressure 落地
covers: t-072fd6 — 联调：三种状态形状 4/4
covers: t-e4742c — 复核：不可得改冒充 0 → 5 条红
covers: t-360f3a — 测试：9/9 + 全量零新增

### t5 提交侧判定与返回体（证据：tests/plan-footprint.test.ts 4 条 + tests/plan-overcapacity-notice.test.ts）
covers: t-2c4300 — 判定 + 返回体 + FR-5 标记门禁 + 配置生效
covers: t-b4094c — 研发：overCapacity / capacityNote / marker 门禁
covers: t-033b53 — 联调：配置→判定→返回体→门禁四段一致
covers: t-aa47c9 — 复核：换来路径静默放行面已修并变异验证
covers: t-db1c64 — 测试：18/18 + 全量零新增

### t6 批准前摆在人眼前（证据：tests/plan-overcapacity-notice.test.ts T8a–T8d）
covers: t-5fa118 — 弹框题干与看板评论接上同一份摘要
covers: t-5e35d5 — 研发：两条批准路径 + 空串逐字节不变
covers: t-ff6555 — 联调：两处说同一句话（不漂移）
covers: t-273614 — 复核：字节级 A/B 证据（cmp 无输出，两份 162 字节）
covers: t-a902cb — 测试：18/18 + 联跑 61/61

### t7 余量参考上屏（证据：tests/capacity-reference.test.ts T9a–T9d + tests/session-probe-wiring.test.ts 6 条）
covers: t-bdda9c — 节点输入包与任务树都上屏并标「非判据」
covers: t-c72fe4 — 研发：余量节 + footprintState
covers: t-5f2d3d — 联调：生产可达性（整链真 H1–H5）
covers: t-766b8f — 复核：三处接线各自回退会红
covers: t-dd87f8 — 测试：19/19 + 全量零新增

### t8 老数据兼容（证据：tests/plan-footprint-compat.test.ts 7 条）
covers: t-90d8b9 — 不补键 / 空数组≠缺键 / schemaVersion 不升
covers: t-9b334d — 研发：兼容用例（5 处变异全被抓）
covers: t-c525dc — 复核：形状断言选择正确
covers: t-b68da6 — 测试：7/7 + 既有失败逐条点名

### t9 拆分节点纪律（证据：tests/prompt-gates.test.ts 13 条 + scripts/check-prompt-fragments.mjs）
covers: t-38b004 — 两个难度档分片加入容量纪律（生成物可复现）
covers: t-8f7af4 — 研发：分片文本 + 重生成
covers: t-9b120a — 复核：零新增工具名 / 交棒行未动 / 复述漂移风险留痕

### t10 收口（证据：tests/plan-smoke.test.ts 8 条）
covers: t-f24820 — 三条真实冒烟 + 兼容两态 + 回归基线与类型检查
