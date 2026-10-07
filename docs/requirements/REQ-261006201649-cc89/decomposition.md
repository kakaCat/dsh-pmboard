# 拆分计划（REQ-261006201649-cc89）

> **目标一句话**：让原型面每一道门都能说出它量了什么——权威原型必须是填过的（不是模板骨架），
> 实现必须有对照项，每条几何量读数必须可复核（实测值 + 截图 + 截图 sha256）。
> **做法一句话**：三类改动各自独立可验（非骨架判据 / 对照项硬判据 / 读数绑证据），
> 外加一条把「对齐判据」从某条需求专属靶子升级为可参数化通用判据的重构，最后落一份给后来人看的契约。
>
> 本计划须**人批准**后才能落任务卡（reqboard_decompose）。覆盖不齐不许批。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | `requirement.md` 功能点 | 需求条款 |
| D-x | `requirement.md`「讨论与裁定记录（D-x）」 | 需求阶段裁定 |
| I-x | `interfaces.md`「接口清单」 | 接口 / 改动点 |
| TC-x | `test-cases.md`「用例清单」 | 用例组 |
| t-x | 本文档任务表 | 计划 key |

**原型锚点**：本需求唯一权威原型 = `prototypes/gate-feedback.html`
（`prototypes/INDEX.md` 的 authoritative 行），服务 FR-1～FR-7。

## 变更盘点（新增 / 修改 / 删除）

**新增**
- `src/application/internal/prototype-gates.ts` 内三个纯函数：`prototypePlaceholderOf`、
  `observationEvidenceOf`、`humanReasonHasFact` 及配套类型与 `SKELETON_PLACEHOLDERS` 常量。
- `src/domain/prototype/ParityContracts.ts`：`prototypeParityViolations` 与 `ParityViolation` / `ParityContracts`。
- `PrototypeEvidencePort`（`src/application/ports.ts`）+ 生产实现（`src/adapters/FileDocRepository`）。
- 测试文件四份：`tests/prototype-placeholder.test.ts`、`tests/prototype-placeholder-gate.test.ts`、
  `tests/verification-prototype-compare-required.test.ts`、`tests/prototype-geometry-evidence.test.ts`、
  `tests/prototype-new-codes.test.ts`。
- 契约文档一份（`docs/architecture/`，挂进索引）。

**修改**
- `checkPrototypeAnchorsGate`：锚点门前加「非骨架」一问、后加「几何量证据」一问。
- `SubmitVerification.ts` 的 `compareInputsOf` / `prototypeHtmlPathOf`：对照项取数改读 INDEX 权威行；
  存量 `createdAt` 早退。
- `src/http/envelope.ts` 的 `STATUS_BY_CODE`：两个新码 → 400。
- `src/client/toolviews/shared.ts` 的 `ERROR_CATEGORY`：两个新码中文名。
- `src/application/use-cases/MoveRequirement.ts`：两个会话侧传输码。
- `tests/prototype-parity.test.ts`：改造为「被检需求配置 + 通用判据」的调用方（断言只增不减）。

**删除**
- **无。** 本需求不删任何符号、不删任何既有测试（`prototype-parity.test.ts` 只改造不删除）。
  零删除是刻意的：删断言可以假装变绿，本需求要防的正是那种绿。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 实现非骨架判据纯函数并锁死阈值口径 | FR-1 | I-1 + `src/application/internal/prototype-gates.ts`、`src/application/internal/prototype-skeleton-template.ts`、`tests/prototype-placeholder.test.ts` | — | D-3 | implement | backend | — | M | 跑 `npx vitest run tests/prototype-placeholder.test.ts` 全绿，且必须含这四条：① 渲染后的骨架原文对自身**命中**且 hits 含 marker；② 本需求 `prototypes/gate-feedback.html` **不命中**且 `lineRatio < 0.90`；③ 只把占位符换词、结构不动 → 仍**命中**（similarity 分支独立生效，证明两条判据不是一条）；④ 空文件与空基线不抛错（`lineRatio === 0` / 返回 `undefined`）。另跑 `npx tsx scripts/req-doc-validate.mts --req REQ-261006201649-cc89` 无新增缺口 | dev,review,test |
| t2 | （落库后回填） | 把非骨架判据接进锚点门并在它之后接几何量证据校验 | FR-1, FR-2, FR-4 | I-2, I-3, I-4, I-5 + `src/application/internal/prototype-gates.ts`、`src/application/ports.ts`、`src/adapters/FileDocRepository.ts`、`tests/prototype-placeholder-gate.test.ts`、`tests/prototype-geometry-evidence.test.ts` | — | D-3 | implement | backend | t1 | M | 跑 `npx vitest run tests/prototype-placeholder-gate.test.ts tests/prototype-geometry-evidence.test.ts` 全绿，且必须含：① **反向演练 A**——把 REQ-261006164732-6503 的真实骨架三份文件喂给 `checkPrototypeAnchorsGate` → `code === 'prototype_placeholder'` 且 gaps 点名 `prototypes/detail.html`；换成填过的原型 → `undefined`；基线为空 → `undefined`（不判不假红）；② 码唯一性——骨架报 `prototype_placeholder`、真稿缺锚点报 `prototype_anchor_missing`（两个码必须不同）；③ 早退不变——INDEX 两条 authoritative 时仍是 `prototype_version_conflict`（非骨架不抢答）；④ 存量需求（旧 `createdAt`）骨架仍放行 | dev,review,test |
| t3 | （落库后回填） | 对照项由可选改硬判据并改读 INDEX 权威行 | FR-3 | I-6 + `src/application/use-cases/SubmitVerification.ts`、`tests/verification-prototype-compare-required.test.ts` | — | D-4 | implement | backend | t1 | M | 跑 `npx vitest run tests/verification-prototype-compare-required.test.ts` 全绿，且必须含：① 有权威原型 ⇒ 验收单必含 `source.kind === 'prototype-compare'` 且 `prototypePath` 等于 INDEX 权威行；② **反向演练 B**——把「有权威原型 ⇒ 组装对照项」退化成旧的条件化分支后**必须有测试变红**（该用例在改动前后各跑一次，红→绿）；③ 豁免生效需求仍渲染豁免说明行且不阻塞；④ 存量需求（旧 `createdAt`）产出与改动前逐字一致 | dev,review,test |
| t4 | （落库后回填） | 实现可参数化的原型对齐判据并把既有靶子改造为它的调用方 | FR-5 | I-7 + `src/domain/prototype/ParityContracts.ts`、`tests/prototype-parity.test.ts` | prototypes/gate-feedback.html#FR-2 | D-3 | ui | frontend | t2 | M | 跑 `npx vitest run tests/prototype-parity.test.ts` 全绿，且必须含：① 三条契约各有正反例（少一个 class / `data-*` 属性名不符 / DOM 顺序颠倒 → 各出违规）；② 每条违规带非空 `anchor`（形态 `prototypes/<name>.html#FR-N`）；③ **断言只增不减**——`it(...)` 条数 ≥ 改造前（194 行版本每条断言都还在）；④ 正向样本 REQ-261006175040-12d4 的 `card-gates.html` 配实现渲染 → 零违规（不误伤）；⑤ `pnpm build:client` 打印 `[verify-client] OK` | dev,review |
| t5 | （落库后回填） | 登记两个新错误码的三处身份（HTTP / 中文名 / 传输码） | FR-6 | I-8, I-9, I-10 + `src/http/envelope.ts`、`src/client/toolviews/shared.ts`、`src/application/use-cases/MoveRequirement.ts`、`tests/prototype-new-codes.test.ts` | prototypes/gate-feedback.html#FR-6 | — | implement | frontend | t2 | S | 跑 `npx vitest run tests/prototype-new-codes.test.ts` 全绿，且必须含：① `statusForCode('prototype_placeholder') === 400`、`('prototype_geometry_unverified') === 400`（**不是 500**）；② `ERROR_CATEGORY` 两键都在且值非空；③ `MoveRequirement` 映射表两键成对（内部码 ↔ 传输码）；④ 两个新码的 `message` 命中 `GATE_HOW_ANCHOR` 正则；⑤ `pnpm build:client` 打印 `[verify-client] OK` | dev,review |
| t6 | （落库后回填） | 把非骨架判据与对照纪律写进项目契约文档并挂进 wiki 索引 | FR-1, FR-2 | I-1, I-4, TC-2, TC-6 + `docs/architecture/prototype-non-skeleton-and-parity-contract.md`、`docs/architecture/README.md`（或 wiki 首页） | — | D-2, D-3, D-4 | doc | doc | t2, t3, t4, t5 | S | ① 新页面有 front-matter 且被上层页链接；② 跑 `python3 agent-dh/scripts/wiki_probe.py` 无死链、无孤儿页（或如实报告读数）；③ 文档写清三件事：非骨架判据的两条命中口径与阈值依据、对照项为硬判据、几何量读数的两键与 `unverified` 口径；④ 引 `prototype-gate-and-decision-log.md` §2 的三门表并注明本次新增判据挂在哪一门 | dev,review |

**粒度说明**：六张卡都是「一件事」——t1 是纯函数与阈值、t2 是门接线与证据校验、
t3 是验收组装、t4 是判据参数化与既有靶子改造、t5 是错误码身份登记、t6 是契约落文档。
**t5 与 t4 都可与 t3 并行**（t3 只看权威路径与组装条件，不读新码）。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（backend/frontend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-4 | `src/application/internal/prototype-gates.ts`, `src/application/internal/prototype-skeleton-template.ts` | TC-1, TC-2 | t1, t2 | ✅ |
| FR-2 | I-4, I-5 | `src/application/internal/prototype-gates.ts`, `src/adapters/FileDocRepository.ts` | TC-2, TC-6 | t2 | ✅ |
| FR-3 | I-6 | `src/application/use-cases/SubmitVerification.ts` | TC-3 | t3 | ✅ |
| FR-4 | I-2, I-3, I-5 | `src/application/internal/prototype-gates.ts`, `src/application/ports.ts` | TC-4 | t2 | ✅ |
| FR-5 | I-7 | `src/domain/prototype/ParityContracts.ts`, `tests/prototype-parity.test.ts` | TC-5 | t4 | ✅ |
| FR-6 | I-8, I-9, I-10 | `src/http/envelope.ts`, `src/client/toolviews/shared.ts`, `src/application/use-cases/MoveRequirement.ts` | TC-6 | t5 | ✅ |
| FR-7 | I-1, I-4 | `tests/prototype-*.test.ts`, `tests/plan-prototype-anchor-gate.test.ts` | TC-2, TC-6 | t6 | ✅ |
| **合计** | 10 接口 | 9 模块/文件 | 6 用例组 | 6 任务 | 7/7 条款有主 |

**覆盖完整性自检**：
- 每行三格（接口 / 页面模块 / 用例）**都非空**——无纯文档条款，故没有一行写「—」。
- 反向也查过：`interfaces.md` 的 I-1～I-10 与 `test-cases.md` 的 TC-1～TC-6
  **全部有人认领**（I-1、I-4 被 t1/t2/t6 三处引用是刻意的：判据本体、门接线、契约文档各需要它一次）。
- 每个 FR-1～FR-7 都有接收任务，无孤儿条款。
- **FR-7 的接收任务是 t6 是刻意的**：FR-7 的判据（反向演练 A/B 与零回归）由 t2/t3/t4 的验收标准
  承载，t6 负责把「这条判据存在且必须跑」写进契约文档——两者合起来才算 FR-7 被接收。

## 批次与依赖安全序

```
第 1 批：t1（判据纯函数，无依赖）
              │
              ├──────────────▶ t2（门接线 + 证据校验；依赖 t1：判据先定义后接线）
              │                   │
              │                   ├──▶ t4（对齐判据参数化 + UI 侧改造；依赖 t2：原型锚点口径先定死）
              │                   │        │
              └──────────────▶ t3（对照项硬判据；依赖 t1：同一份判据口径）    │
                              │        │                                    │
                              └────────┴──────────────┬─────────────────────┘
                                                      ▼
                                              t6（契约落文档；依赖 t2/t3/t4/t5）
                                       t5（错误码身份；依赖 t2：码先由门产出）
```

**禁止前向引用**：全部 `depends_on` 都指向本批或更早的计划 key，无循环。

**顺序上的硬约束（来自设计）**：t2 必须先于 t3。若 t3 先上线，
会给「权威原型是骨架」的需求强制生成对照项——人只能对着骨架打勾，**那正是本需求要消灭的形态**。

## 容量纪律（先算，再切）

口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 = `LIMITS.roundDetailUnits`（16 DU）。

| 计划 key | files | anchors | chars | detailUnits | 判定 |
|---|---|---|---|---|---|
| t1 | 3 | 6 | 1400 | 3 + 3 + 0.7 = **6.7** | ✅ 单轮 |
| t2 | 5 | 7 | 1600 | 5 + 3.5 + 0.8 = **9.3** | ✅ 单轮 |
| t3 | 2 | 8 | 1500 | 2 + 4 + 0.75 = **6.75** | ✅ 单轮 |
| t4 | 2 | 8 | 1800 | 2 + 4 + 0.9 = **6.9** | ✅ 单轮 |
| t5 | 4 | 5 | 800 | 4 + 2.5 + 0.4 = **6.9** | ✅ 单轮 |
| t6 | 2 | 4 | 900 | 2 + 2 + 0.45 = **4.45** | ✅ 单轮 |

**无超容量卡**（全部 < 16 DU）。`files` 均 ≥ 该卡 implementation 点到的路径数
（t2 点 5 个、t4 点 2 个、t5 点 4 个——留的余量用于测试夹具，不缩水）。

## 边界校验（每卡可独立验收）

每张卡都能被一个**零会话历史**的新窗口只凭卡内容开工：卡里写死了文件路径、判据命令、
期望输出与「改不红即未完成」的元判据。**本阶段不二次创作设计**——若实施中发现与设计矛盾，
回设计阶段改设计并重新提交计划，不在拆分阶段私改。

## 与设计的对应关系（逐条可追）

| 设计文档 | 对应任务 |
|---|---|
| `design/architecture.md` 判据单点与数据流 / 三门整合 | t1, t2 |
| `design/architecture.md` 错误码注册与信封 | t5 |
| `design/architecture.md` 骨架落盘收敛 | t2（回归用例） |
| `design/architecture.md` 对齐判据分层 | t4 |
| `design/interfaces.md` I-1～I-10 | t1～t5 逐条对应 |
| `design/migration.md` 存量承诺 / 回滚 / 批间顺序 | t2, t3 的验收标准第 ④ 条；本计划「批次与依赖安全序」 |
| `design/test-cases.md` TC-1～TC-6 | t1～t6 的验收标准逐条引用 |
