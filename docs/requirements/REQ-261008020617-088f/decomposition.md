# 拆分计划（REQ-261008020617-088f）

> **目标**：把 application/ 的 15 处 I/O 越界按四族收敛到端口 / 纯函数 / 适配层，给层门补显式豁免面，
> 使 `tests/layer-boundary.test.ts` 的 application/ 用例转绿而规则一条不放宽。
> **做法**：按「一次只改一类东西」切 9 张卡，卡间用 depends_on 串成三列并行（族①/族②/族③/族④ 各自独立，
> 文档卡收尾）。批间读数 = 越界条数 15 → 9 → 9 → 9 → 7 → 5 → 1 → 0（卡级读数见下表「验收标准」列）。
> 本计划须**人批准**后才能落任务卡（reqboard_decompose）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| RF-1..RF-8 | requirement.md 功能条款 | 需求条款（本需求 8 条，全部有卡接） |
| D-1..D-3 | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（范围 / 日志半边取端口门面 / 门取合并而非删码） |
| D-4, D-5 | design/architecture.md「现状修正」节 | **设计阶段**勘察修正（diag-log 实为 6 个 application 引用方；diag-log 不需要通用宿主态端口）——不属 requirement.md 的 D 表，列在此处避免与上面三个混号 |
| M-1..M-7 | design/migration.md 迁移步骤 | 迁移步骤（与卡对应关系：M-1=t1；M-2=t3+t4；M-3=t5；M-4=t6；M-5=t7；M-6=t8；M-7=t9） |
| t1..t9 | 本文档任务表 | 任务卡 |

## 任务表

| 计划 key | 标题 | 覆盖条款 | 落点（文件） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | footprint（files/anchors/chars → DU） | 子卡段 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | 合并三个同构 RTM 门为单点并改走文档端口 | RF-2 | `src/application/gate/rtm-gates.ts`（新增）、`src/application/gate/index.ts`、删 `src/application/gate/acceptance-gate.ts`、`src/application/gate/design-gate.ts`、`src/application/gate/task-coverage-gate.ts`、`tests/unit/gate/acceptance-gate.test.ts`、`tests/unit/gate/design-gate.test.ts`、`tests/unit/gate/task-coverage-gate.test.ts` | D-3 | implement | backend | — | M | 11 / 3 / 1400 → 13.2 | 跳联调（3 份单测是唯一消费者，生产零引用） | `npx vitest run tests/unit/gate` 全绿（断言未改）；`npx vitest run tests/layer-boundary.test.ts` 越界 15 → 9；`grep -rn 'node:' src/application/gate` 0 命中；`npx tsc --noEmit` 0 错 |
| t2 | 新增宿主文件面端口与实现并补齐五处装配 | RF-3, RF-4, RF-5 | `src/application/ports.ts`、`src/adapters/FileHostFs.ts`（新增）、`src/index.ts`、`tests/application/harness.ts`、`tests/helpers/tool-deps.ts`、`tests/queue/v9-harness.ts`、`tests/e2e-design-handoff.test.ts` | D-4, D-5 | implement | backend | — | M | 8 / 3 / 1800 → 10.4 | 默认（研发→联调→复核→测试） | `npx tsc --noEmit` 0 错（hostFs 必填 ⇒ 五处装配漏一处即报错）；`grep -n 'interface HostFsPort' src/application/ports.ts` 与同法查 `DiagSinkPort` 各 1 命中；`npx vitest run tests/apply-wiring.test.ts tests/unit/gate` 全绿；层门仍为 9（本卡不消除越界，如实记录） |
| t3 | rtm-health 写路径端口化并同步生产调用方与测试 | RF-3 | `src/application/internal/rtm-health.ts`、`src/application/internal/rtm-yaml.ts`、`src/http/routers/requirements.ts`、`src/http/routers/tasks.ts`、`tests/submit-prototype.test.ts`、`tests/rtm-trigger-prototype.test.ts`、`tests/rtm-yaml-live-tasks.test.ts`、`tests/canceled-audit-holds.test.ts`、`tests/canceled-four-faces.test.ts`、`tests/canceled-coverage-gate.test.ts` | — | implement | backend | t2 | M | 11 / 4 / 2600 → 14.3 | 默认 | 上述 7 份用例 + `tests/unit/rtm-health.test.ts` 全绿；落盘形状（5 键 / 2 空格缩进 / 只留最近 100 条）断言原样在场；新增「state 目录缺失时不抛且能落盘」用例；层门仍为 9（健康检查半仍在，如实记录） |
| t4 | rtm-health 健康检查读路径端口化并收尾该文件的 I/O | RF-3 | `src/application/internal/rtm-health.ts`、`src/application/query/QueryState.ts`、`tests/unit/rtm-health.test.ts`、`tests/rtm-health-legacy.test.ts` | — | implement | backend | t3 | S | 5 / 4 / 1800 → 7.9 | 默认 | `npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/unit/query-run-status.test.ts` 全绿；`grep -n 'node:' src/application/internal/rtm-health.ts` 0 命中；层门 9 → 7；`/state` 的 rtm_health 字段形状不变 |
| t5 | diag-log 改为无 I/O 门面并把文件实现落到适配层 | RF-4 | `src/application/internal/diag-log.ts`、`src/adapters/FileDiagSink.ts`（新增）、`src/index.ts`、`tests/dive-wake-wiring.test.ts`、`tests/reqboard/degraded-startup.test.ts` | D-2, D-4 | implement | backend | t2 | M | 6 / 4 / 1800 → 8.9 | 默认 | 上述 2 份用例全绿（读日志文件断言 `[WAKE-FAIL]`、一条失败一行）；`grep -n 'node:' src/application/internal/diag-log.ts` 0 命中；application 里 `captureDiag` 调用点数不减；层门 7 → 5 |
| t6 | 两处绝对路径判定收口到纯函数与宿主端口 | RF-5 | `src/application/internal/paths.ts`（新增）、`src/application/use-cases/CaptureRequirement.ts`、`src/application/use-cases/CreateRequirement.ts`、`tests/create-doc-location.test.ts`、`tests/create-delegated-owner.test.ts`、`tests/capture.test.ts` | — | implement | backend | t2 | S | 6 / 4 / 1800 → 8.9 | 跳联调（用例签名与调用方零改动，端口已在 t2 接好） | 上述 3 份用例与改前读数一致（全绿）；`grep -n 'node:'` 两个用例文件 0 命中；行为等价断言：非绝对路径 → `REQBOARD_INVALID_WORKSPACE`（create）/ `undefined`（capture）、目录不存在同码同文案、`host` 哨兵仍解析到 `process.cwd()`；层门 5 → 1 |
| t7 | Dive Service 外壳外移到适配层 | RF-6 | `src/adapters/ReqboardDiveManager.ts`（迁移）、删 `src/application/dive/ReqboardDiveManager.ts`、`src/index.ts`、`tests/dive-wake-wiring.test.ts`、`tests/dive-manager-wiring.test.ts` | — | implement | backend | t2 | S | 6 / 4 / 1600 → 8.8 | 默认 | 上述 2 份用例全绿（Service 名 / inject / 订阅分组 / 失败留痕不变）；`grep -rn '@deepseek-ai/cordis' src/application` 0 命中；`npx tsc --noEmit` 0 错；层门 1 → 0（RF-1 达成） |
| t8 | 给层门补显式豁免面并落地空台账 | RF-1, RF-7 | `tests/layer-boundary.test.ts`、`tests/fixtures/layer-boundary-exempt.json`（新增） | D-1 | test | backend | — | S | 3 / 4 / 1800 → 5.9 | 默认（测试卡无联调段） | `npx vitest run tests/layer-boundary.test.ts -t '豁免'` 绿；合成输入用例证明 `unusedExemptions` 对「指向已修好文件」的条目判红；台账 `frozenCount=0` 且 `entries=[]`；`git diff` 中 `LAYER_RULES.forbidden` 零改动 |
| t9 | 同步说明书与知识层文档并留痕边界外读数 | RF-1, RF-8 | `docs/architecture/project-manual.md`、`docs/architecture/gate-read-root.md`、`docs/knowledge/code-map.md`、`docs/knowledge/code-map.symbols.tsv` | D-1, D-4 | doc | doc | t1, t2, t3, t4, t5, t6, t7 | S | 5 / 4 / 1800 → 7.9 | 默认（文档卡） | `npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts` 与改前读数一致；`grep -n 'HostFsPort'` / `grep -n 'DiagSinkPort' docs/architecture/project-manual.md` 各命中；`pnpm kb:check` 不新增与本次符号相关的漂移且如实申报未跑 `pnpm kb:build`；交付材料含改前/改后 layer-boundary 读数（failed 2 → 1，tools/http 那条两次都在） |

**容量自检**（容量缺省 16 DU，判据 `detailUnits = files×1 + anchors×0.5 + chars/2000`，单一源 `src/domain/limits.ts`）：
9 张卡实测 DU 依次 13.2 / 10.4 / 14.3 / 7.9 / 8.9 / 8.9 / 8.8 / 5.9 / 7.9，**全部 ≤ 16，无超容量卡**
（故本文不出现 `⚠️超容量` 标记；上述数字由仓库自带 `judgeFootprint` 实算，非估算）。

**粒度披露（软上限 `files > 5`，不拒但批准人会看到）**：t1(11) / t2(8) / t3(11) / t5(6) / t6(6) / t7(6)
超过 5 个文件。**为什么不切小**：这四族的改动都是**签名级原子变更**——只改生产侧不改测试侧，或只改
端口定义不改消费方，都会让树在两卡之间编译不过（违反「每卡可独立验收」）。切法只有按文件切，而按文件切
一定会红；故选择按**族**切并把理由显式披露，让批准人知情。

## 覆盖对照

| 需求条款 | 接口（design/interfaces.md：本需求无此份） | 页面/模块（architecture.md 落点） | 测试用例（本需求无 test-cases.md，列实际回归用例文件） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| RF-1 层门 application/ 越界清零 | —（无对外接口变更；端口为内部契约） | `src/application/ports.ts`、`src/adapters/*`、`src/application/gate/*` | `tests/layer-boundary.test.ts` | t1, t3, t4, t5, t6, t7, t8 | ✅ |
| RF-2 三门合并走端口 | —（同上） | `src/application/gate/rtm-gates.ts` | `tests/unit/gate/*.test.ts` | t1 | ✅ |
| RF-3 rtm-health 端口化 | —（同上） | `src/application/internal/rtm-health.ts`、`src/adapters/FileHostFs.ts` | `tests/unit/rtm-health.test.ts`、`tests/rtm-health-legacy.test.ts`、`tests/rtm-trigger-prototype.test.ts`、`tests/submit-prototype.test.ts` | t2, t3, t4 | ✅ |
| RF-4 日志实现移出 application/ | —（同上） | `src/application/internal/diag-log.ts`、`src/adapters/FileDiagSink.ts` | `tests/dive-wake-wiring.test.ts`、`tests/reqboard/degraded-startup.test.ts` | t2, t5 | ✅ |
| RF-5 两处路径判定收口 | —（同上） | `src/application/internal/paths.ts`、`src/application/use-cases/CaptureRequirement.ts`、`src/application/use-cases/CreateRequirement.ts` | `tests/create-doc-location.test.ts`、`tests/create-delegated-owner.test.ts`、`tests/capture.test.ts` | t2, t6 | ✅ |
| RF-6 Dive Service 外移 | —（同上） | `src/adapters/ReqboardDiveManager.ts` | `tests/dive-wake-wiring.test.ts`、`tests/dive-manager-wiring.test.ts` | t7 | ✅ |
| RF-7 层门豁免面 | —（同上） | `tests/layer-boundary.test.ts`、`tests/fixtures/layer-boundary-exempt.json` | `tests/layer-boundary.test.ts`（豁免用例） | t8 | ✅ |
| RF-8 边界外标红如实留痕 | —（同上） | `docs/architecture/project-manual.md`、`docs/architecture/gate-read-root.md` | `tests/kb-invalidation.test.ts`、`tests/kb-operations.test.ts` | t9 | ✅ |
| **合计** | 0 对外接口（refactor 无接口变更） | 12 模块落点（去重后 11 个文件 + 1 处删除组） | 14 份回归用例文件 | 9 张卡 | 8/8 条款有主 |

## 覆盖完整性规则（本计划的对照口径）

1. **三格不许空**：refactor 档无 `interfaces.md` 与 `test-cases.md`（`category-doc-sets.ts` 的 refactor
   DELTA 只要求 `architecture.md` + `migration.md`），故「接口」格逐行写 `—` 并给同一句理由
   （无对外接口变更，端口为内部契约）；「用例」格不写编号而直接写**实际回归用例文件**——比空编号可核。
2. **反向也查**：`design/architecture.md` 的模块改动地图与 `migration.md` 的 M-1..M-7 逐条都有卡接
   （M-1=t1、M-2=t3+t4、M-3=t5、M-4=t6、M-5=t7、M-6=t8、M-7=t9）；无超范围设计。
3. **每张卡都能被独立验收**：新窗口零会话历史、只凭卡面的 implementation + acceptance 即可开工
   （implementation 点名列号文件与函数名，acceptance 逐条给命令与读数）。
4. **本阶段不二次创作设计**：卡与 design 文档冲突时退回 design 改计划并重新批准，不在拆分阶段私改。

## 不落库的东西（如实申报）

- **不修 tools/ 与 http/ 的状态字面量**（`src/http/routers/*.ts`）：另一条腿，本需求边界外（RF-8），
  也**不进豁免台账**。
- **不修消息卫生棘轮**（`tests/message-hygiene.test.ts` 的 3 条红）：另一条腿，一行不碰。
- **不删三个门的死码**：本计划取「合并 + 保留同名导出」（D-3）；是否复活/删除这三个门另立项。
- **不重跑 `pnpm kb:build`**：工作树里 `docs/knowledge/code-map.*` 有他人在途生成物，只做最小手改（t9）。
