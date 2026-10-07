# 原型产物门禁与裁定落账（contract）

> 来源：REQ-261005105032-3b02（2026-10-05 立项 / 2026-10-05 验收归档）。
> 追认事故：**REQ-261004222448-292a**（纯 UI 需求）交付后被人眼判「与原型差距巨大」。
> 本文只写**会被别的需求引用**的契约与口径；执行期的裁决与偏差记录留在该需求的 `notes/execution-decisions.md`。

## 1. 原型是「一等产物」，不是附件

| 维度 | 契约 |
|---|---|
| 种类 | `ArtifactKind` 含 `prototype`；中文名「原型」；阶段归属 `brainstorming` |
| 路径 | 权威路径 `prototypes/<name>.html` 与 `prototypes/INDEX.md`；旧路径 `prototype/*.html` **兼容期仍识别**（不回落 `notes`） |
| 面板 | `DocPanelKind` 含 `prototype`；文档页把原型**单列成组**（保留既有 `data-doc-row` 计数口径），并投影权威/被取代角色 |
| 台账 | `StageArtifact.prototypeMeta`（锚点 + 几何量）、`TaskRecord.prototypeRefs` / `decisionRefs`（**加性可选键，零迁移**） |

**「交原型」的定义**：`reqboard_submit(kind='prototype')` 登记成功才算交。这是关键口径——见 §3。

## 2. 三道原型门（只在 UI 需求生效）

| 门 | 码 | 判据 |
|---|---|---|
| 存在门 | `prototype_missing` | 声明了 `frontend` 端侧且无**显式登记**的原型、也无生效豁免 |
| 版本门 | `prototype_version_conflict` | `prototypes/INDEX.md` 的 `authoritative` 不是**恰好一条**，或需求/设计文档引用了 `superseded` 版 |
| 锚点门 | `prototype_anchor_missing` | 权威原型缺 `id="FR-N"` 覆盖、几何量块**不是恰好一块**、或出现阈值类字段 |

几何量契约（决议 #8 的红线）：只放**观测量名与实测值**，`unit ∈ {px,count,ratio}`、`at.state ∈ {inflight,terminal}`；**阈值由设计阶段定死，原型不自证**——出现 `threshold/max/min/limit/...` 即拒。渲染面上也不得显示阈值。

## 3. 「登记才算数」：自动发现 ≠ 已交（两处都踩过）

1. **门自己绿了**：产物自动发现（「落进需求目录即产物」）会把落盘骨架补登为 `kind=prototype`。存在门若只按 `kind` 过滤，则**只落骨架、人一个字没填也会全绿**。
   → 判据收紧为**只认显式登记**（`autoDiscovered !== true`），与门自己的 how 文案一致。
2. **登记升不了级**（配套死结）：`registerArtifact` 对「同 path 已存在」原本一律跳过 ⇒ 自动发现条目**永远升不成显式登记** ⇒ 门一严，照 how 文案登记也永判未登记。
   → 自动发现条目被显式登记时**就地升级**（清标记 + 用本次字段覆盖）。
3. **判据单点**：以上口径收敛在 `application/internal/prototype-registration.ts`，**存在门 / 登记回执 / 升级判定 / 登记编排四处共用**。

## 4. 豁免（`prototype_exempt`）的判据与边界

- 生效条件：需求 front-matter 里 `prototype_exempt: <理由>`，**理由非空**且**需求产物已落章**（人确认过）——agent 不能自豁免。
- 生效后：存在门放行、验收单改出一行豁免说明且**不阻塞**提交。
- **豁免必须在每个相关判定点都算数**（REQ-261006091755-1c9e，2026-10-06）：拆分覆盖门的「UI 卡原型锚点维」
  也要消费它——**豁免生效 ∧ 该需求没有已登记原型产物** ⇒ 锚点维**整维跳过**（不再要求前端卡写
  `prototypes/<name>.html#FR-N`）。此前只有存在门消费豁免，于是「人已裁定不要原型」与「前端卡必须给锚点」
  互相矛盾，唯一出路是把端侧谎报成 `fullstack`（`REQ-261005213603-eaed` 就是这么绕的）。
- **跳过条件是「豁免 ∧ 无已登记原型」，不是「豁免即跳过」**：豁免的语义是「**不强制**交原型」，
  不是「交付物免检」——真登记了原型时，卡仍须指向 INDEX 的权威路径（交了就要合格）。
- **判据必须复用既有单点**：豁免只问 `prototypeExemptOf`、有没有原型只问 `registeredPrototypesOf`
  （**登记才算数**，`autoDiscovered` 的补登不算）。**不得**拿 INDEX 解析失败当「没有原型」——
  那是一条静默放行面（本仓最忌的形态）。
- 存量不追溯：`createdAt < prototypeRulesSince`（缺省 `2026-10-06`）的需求一律标 `exempted: legacy`，不判不健康、不被追溯补交。

## 5. 裁定落账门（D-x）

- 节名逐字 `## 讨论与裁定记录（D-x）`，**仅 feature 需求**要求（模板也只加在 feature）。
- 五列：编号 / 原话来源 / 裁定 / 影响 FR / 判据；**影响 FR 必须命中真实条款编号**（写「全 FR」会被点名）。
- 编号 `D-\d+` 连续且唯一；整节只写「本节无裁定」= 真空态，可放行；但**有留痕却只写真空态**仍拒。
- 适用范围：**所有 feature 需求**（需求文档 FR-8）——注意与「原型三门只限 UI」区分，这是两份设计文档打架后按需求文档裁定的口径。
- 留痕启发式（只用于「要求本节非空」）：只取 `source.kind === 'user'` 的消息、只扫最近 200 条、命中祈使词表即算有留痕；**不判条目内容、不承诺召回率**。

## 6. 门禁的唯一入口与接线纪律

- 唯一 async 入口：`contentGatesForMove(docs, req, from, to, opts?)`，内部按 `(from,to)` 分派、**短路返回首个失败**。
- **必须接线的地方是 5 处，不是 4 处**（卡面曾漏写两处真实落点，漏一处就等于开后门）：
  1. `use-cases/MoveRequirement.ts`（会话语义移动）
  2. `internal/confirm-settle.ts`（**弹框首次确认 → 自动推进的唯一实现**）
  3. `use-cases/AskConfirm.ts`（已确认但阶段未推进的早退块）
  4. `http/routers/requirements.ts::handleReqMove`（看板移动）
  5. `http/routers/requirements.ts::handleArtifactConfirm`（**看板确认产物即推进的真实落点**）
- 纪律：不动同步单点 `assertArtifactGates` 的签名与职责；**不合并**既有 G2 设计文档集门（分层而非替换）。
- 零回归的证明方式：全库 A/B 对照（A=带改动 / B=把调用点改成 no-op），`comm -23 A B` 必须为空。

## 7. 阶段门时序（stage_gate_overdue）

三个时点必须在位：**设计交完**（必填节/格式门/serves/无 dangling）、**拆分落库**（覆盖对照 + UI 卡原型锚点）、**实施收尾**（E2E 覆盖 + 三级追溯）。
两条防假红口径：

- **未到期不判**：阶段产物不在位（如 `design/` 还没文档）视为未到期；「**没交**」由既有门报（如 G2 `design_doc_incomplete`），时序门只管「**交了却没转绿**」——一处坏不出两种码。
- **读数未知不判**：`undefined` 一律不判（门自身契约）。`e2eCoverageOf` 曾经把「没有测试策略表」压成 `false`，导致**存量需求全被追溯拦住**；现口径为「**无层级表 = 读数未知**，有表但缺 E2E 行才是 `false`」。

## 8. 模板 / 注入 / 探针三面必须同源

- **模板**：`templates/brainstorming/feature.md` 带 D-x 节骨架 + 逐字 `本节无裁定`（否则新需求会被自己的裁定门拦死）；`templates/brainstorming/prototype.html` 是骨架来源；拆分/实施/验收模板带锚点列与两个对照项；**8 份设计模板全部补齐 serves**（照模板写出来的文档必须能过线上门禁）。
- **注入面**：`iron-rules` 两条铁律（裁定必落账、UI 需求必交原型）+ 各阶段档纪律；**轻档字符上限**是硬约束（压缩正文而不是放宽上限，否则默认档拿不到纪律）。
- **探针（一条命令即可复核）**：
  | 探针 | 命令 | 作用 |
  |---|---|---|
  | R1 模板过门禁 + 文档自检 | `pnpm templates:check` | 模板产物必过门禁；9 项文档判据 |
  | R2 门禁节名 ↔ 模板节名 | （同上组合） | 双向一致，防分叉 |
  | R3 提示词路径可达 | `npx tsx scripts/prompt-path-probe.mts` | 片段里的路径必须真实存在或登记在白名单 |
  | R4 内联产物新鲜度 | `pnpm prompts:verify` | **只校验不重生成**（若命令含重生成，永远抓不到「改了源却没重生成」） |
  | 文档自检 9 项 | `npx tsx scripts/req-doc-validate.mts --req <REQ>` | 必填节/格式门/编号链/追溯/RTM 健康/E2E/serves/dangling |
  | dogfood | `npx tsx scripts/self-gate-dogfood.mts` | 三道门在真实需求上的正反演练 |
  | 逆向演练 | `npx tsx scripts/reverse-drill-matrix.mts` | 六条「改坏必红」 |

## 9. 兼容与迁移口径（零迁移）

- 三个新键一律**加性可选**：旧分片缺键 = 未采集（`undefined`），**不补齐、不改写、无迁移脚本**。
- 旧追溯 YAML：缺 `prototypes`/`decisions` 节读出 **pending（未采集）**，不判损坏；未知 key 忽略。
- 已归档需求不被追溯拒绝、不回填原型或 `frontend.md`。

## 10. 本次实施暴露的平台观察（供后续改进，非本需求判定项）

| 观察 | 影响 | 建议 |
|---|---|---|
| 测试覆盖度门禁把**已取消卡**计入分母 | 本需求 132 张里 26 张已取消 ⇒ 覆盖度上限只有 80.3%，再多取消几张就交不上验收 | 分母剔除 `canceled` |
| 子卡链在「子卡执行引擎不可达」的 profile 下不可自证 | 每张父卡 14 次账务调用 ≈ 320 次；agent 无权取消子卡 | 计划应能用 `stages: []`（solo 卡）声明「本窗口自证、不展开链」 |
| 非子卡收尾 60 秒节流 | 23 张父卡依次收尾 ≈ 23 分钟纯等待 | 设计内防线，保留；批量场景可考虑按批放行 |
| 回退 + 产物已落章 = 推进死结 | 回退后状态位退回、产物确认章不撤 ⇒ 确认门拒绝再弹、状态位只能人工 move 推回 | 回退到拆分态时同步撤销计划批准，或提供 agent 可用的重进入口 |

## 11. 续篇：非骨架判据与实现对照纪律（2026-10-06）

本文 §2 的三门只回答「**原型有没有交 / 哪一版算数 / 锚点齐不齐**」，**不回答**
「交的内容是不是空的」与「实现像不像原型」——§3 记下的那个警告（"只落骨架、人一个字没填也会全绿"）
当时只补了登记口径，没补内容口径。2026-10-06 的实测确认了这个洞：
**9 条需求的权威原型是与模板行重合率 0.957 的空骨架，且 100% 通过锚点门**。

补洞的两问（非骨架判据 `prototype_placeholder`、几何量证据 `prototype_geometry_unverified`）
与其口径、阈值依据、反向演练命令、存量豁免边界，见续篇
**[原型「非骨架」判据与实现对照纪律](prototype-non-skeleton-and-parity-contract.md)**。

**读本文的 §2 三门表时请注意**：锚点门现在多两问（第一问与最后一问），
分布在上表那一行的两端；存在门与版本门**一字未改**。
