# 交付证据总表（REQ-261002175818-80a8）

> 本文件由 t10 收口卡产出，供验收单逐项复核。所有数字均为**实跑输出**，命令与口径一并列出。

## 一句话交付结论

拆分节点在写计划时**必须先算「一轮装不装得下」**：每张卡声明体量（改几个文件 / 几条验收锚点 / 多少字符），
声明不得小于证据；超容量在提交时被点名、在批准弹框里摆在人眼前、在计划文档里标红且批数必须相等；
拿不到余量读数时说「拿不到」而**绝不补 0**；老数据照旧能过、不需要升级台账结构。

## 1. 需求条款覆盖（FR-1 ~ FR-9）

| 条款 | 落点 | 钉住它的用例 |
|---|---|---|
| FR-1 体量声明三字段 | `src/domain/task/Footprint.ts`；工具入参 schema | `tests/round-capacity.test.ts`、`tests/plan-footprint-tool-schema.test.ts` |
| FR-2 声明下限（不得缩水） | `assertFootprintFloor` / `REQBOARD_BAD_FOOTPRINT` | `tests/plan-footprint.test.ts` |
| FR-3 容量单一源与配置覆盖 | `src/plugin-config.ts` `resolveRoundCapacity` | `tests/plan-smoke.test.ts`（配置 8 DU → 批数 8→15） |
| FR-4 超容量结构化报出 | 提交返回体 `overCapacity` / `capacityNote` | `tests/plan-overcapacity-notice.test.ts` |
| FR-5 计划文档标记与批数相等 | `content-gate-wiring.ts` `checkOverCapacityMarkerGate` | 同文件 T8 前段 + `tests/plan-smoke.test.ts` |
| FR-6 批准前摆在人眼前 | `AskConfirm.ts` 题干 + 看板批准评论 | `tests/plan-overcapacity-notice.test.ts` T8a–T8d |
| FR-7 声明活着走到任务卡 | 四处映射 + `PlanTask.footprint` | `tests/plan-footprint-propagation.test.ts` |
| FR-8 余量只读、可缺省、不冒充 0 | `SessionProbe.contextPressure` + 适配器降级 | `tests/capacity-reference.test.ts`、`tests/session-probe-wiring.test.ts` |
| FR-9 老数据与兼容 | 不 bump schemaVersion、不补键 | `tests/plan-footprint-compat.test.ts` |

## 2. 三条真实冒烟（t10 卡面要求）

| 冒烟 | 实测值 |
|---|---|
| `{files:100, anchors:20, chars:6000}` 的卡 | `detailUnits=113`、`capacity=16`、`suggestedBatches=8`、被标红（`overCapacity` 恰含它）；文档写 `⚠️超容量(建议8批)` → 通过；写 `建议1批` → `plan_overcapacity_marker_missing` 且**台账零变更** |
| `{files:1, anchors:2, chars:800}` 的卡 | 2.4 DU，**不误报**：`overCapacity` 为在场空数组，无标记也放行 |
| 删掉 `footprint` 再提交 | **照旧通过**：`success=true`、`overCapacity=[]`、台账里 `hasOwnProperty(footprint)=false` |

## 3. 回归基线与门禁（实跑）

| 命令 | 结果 | 判据 |
|---|---|---|
| `npx vitest run` | **96 failed / 3910 passed / 20 skipped（4026）** | 开工基线 97 failed → **零新增失败**（并少 1） |
| 本需求九份新增用例文件联跑 | **106/106 全绿** | `plan-smoke` / `round-capacity` / `plan-footprint-propagation` / `plan-footprint-tool-schema` / `capacity-reference` / `plan-footprint` / `plan-overcapacity-notice` / `session-probe-wiring` / `plan-footprint-compat` |
| 三个收口文件联跑 | **33/33 全绿** | `plan-smoke` + `plan-footprint-compat` + `plan-overcapacity-notice` |
| `npx tsc --noEmit` | **146** | 拆分时点文档基线 223；本需求触及文件 **0 错** |
| `tests/size-budget.test.ts` | 存量红 | 本需求**未把任何文件新推过 400 行**；新建 `Footprint.ts` 217、`node-input-package.ts` 395 |
| 提示词门禁 | `inline-prompt-fragments.mjs && check-prompt-fragments.mjs` 退出码 0；`tests/prompt-gates.test.ts` **13/13** | 生成物与片段逐字节一致、可复现 |

## 4. 关键证据路径

- 计划与设计：`docs/requirements/REQ-261002175818-80a8/decomposition.md`、同目录 `design/`
- 逐卡完工记录：`docs/requirements/REQ-261002175818-80a8/tasks/t-*.md`（10 张父卡 / 33 张子卡 / 收口卡）
- 引用回填报告：`docs/requirements/REQ-261002175818-80a8/evidence/backfill-refs-report.json`
- 新增用例：`tests/plan-smoke.test.ts`、`tests/plan-footprint-compat.test.ts`、`tests/plan-footprint.test.ts`、
  `tests/plan-overcapacity-notice.test.ts`、`tests/capacity-reference.test.ts`、`tests/session-probe-wiring.test.ts`、
  `tests/plan-footprint-propagation.test.ts`、`tests/plan-footprint-tool-schema.test.ts`、`tests/round-capacity.test.ts`

## 5. 未闭合项（结构化上报，未粉饰）

1. **形态不一致**：只有 `contextWindow` 时，节点输入包**整节不显示**，而任务树**键在场、`remainingTokens` 缺席**
   —— 两份设计文档口径不同，需统一或明示（人裁定）。
2. **不可达分支**：任务树 `contextPressure.source` 的 `'unavailable'` 分支当前不可达（不可得=键缺席），按设计原样声明。
3. **开放项**：`design/interfaces.md` 的「计划返回体 tasks[] 每项追加 footprint 回显」**未落地**——t3 与 t5 两张卡都没分配它，
   既未实现也未假装完成，需人裁定「实现」或「改设计文本」。
4. **两处余量告急**：`node-input-package.ts` **395/400**（余 5 行）；`decomposing/light` 片段 **2429/2500**（余 71 字符）。
5. **分片复述漂移风险**：拆分分片里写了容量公式与错误码名，它们是**字面量复述**；单一源仍在 `Footprint.ts` / `artifact-gates.ts`，
   将来改代码不会自动同步分片。
6. **卡面外既有失败**：`tests/plan-mode.test.ts:281`（`requirement_status` 收到 `undefined`），t8 收口时捞出；
   全量失败数自开工以来一直含它，**归属待认领**。
7. **验收口径修订记录**：t3/t8 卡面写的「某门禁整份全绿」不可达（存在与本需求无关的既有失败），
   已按本仓既定口径改为「本卡文件命中 0 / 与基线比」并在卡上留痕。
