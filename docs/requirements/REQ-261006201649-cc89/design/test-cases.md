---
req_id: REQ-261006201649-cc89
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7
---

# 测试设计（REQ-261006201649-cc89）

> **验收口径可执行**：跑什么命令、看到什么算过。空话验收打回。
> 本文件只写**判据与断言**；任务 DAG / 批次归拆分阶段（W7 边界）。

## 用例清单（拆分阶段的覆盖对照按此编号引用） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7`

| 编号 | 用例组 | 落点 | 服务条款 |
|---|---|---|---|
| TC-1 | 非骨架判据纯函数（10 例：骨架/真稿/只删占位符/阈值边界/空文件/基线空/缩进/正向样本/半成品） | 新建 `tests/prototype-placeholder.test.ts` | FR-1 |
| TC-2 | 门级用例（11 例：骨架必红且码唯一、真稿缺锚点仍报旧码、geometry 块数/阈值、早退三态、存量豁免）；**含反向演练 A** | 新建 `tests/prototype-placeholder-gate.test.ts` | FR-1, FR-2 |
| TC-3 | 验收组装（7 例：对照项必出、豁免不变、无原型仍拒、存量逐字一致、非 UI 不组装、INDEX 降级、逐项 ref 同构）；**含反向演练 B** | 新建 `tests/verification-prototype-compare-required.test.ts` | FR-3 |
| TC-4 | 几何量证据（9 例）+ `needsHuman` 事实性（5 例） | 新建 `tests/prototype-geometry-evidence.test.ts` | FR-4 |
| TC-5 | 参数化对齐判据（8 例：class / data-* / 顺序 / 锚点必带 / 断言只增不减 / 真实正向样本） | `src/domain/prototype/ParityContracts.ts` 的用例，落在 `tests/prototype-parity.test.ts`（改造为调用方+通用断言两段） | FR-5 |
| TC-6 | 零回归与边界（11 例：既有三门用例一字不改、门签名三参、非 UI 不落骨架、登记才算数、落盘幂等、两个新码 HTTP 400、中文名、传输码成对、how 锚点、台账零迁移） | 既有 `tests/prototype-*.test.ts` / `tests/plan-prototype-anchor-gate.test.ts` + 新建 `tests/prototype-new-codes.test.ts` | FR-2, FR-6, FR-7 |

**覆盖口径**：TC-1～TC-6 是**用例组**（每组内含上表各节的逐条断言）；下面各节是每组的明细。

## 总口径 `serves: FR-7`

```bash
# 主判据（本需求每一步都要跑）
npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts

# 构建（改 src 必跑；改 client 另跑 build:client 并确认打印 [verify-client] OK）
pnpm build
pnpm build:client
```

**通过标准**：上述命令全绿，且**本需求新增用例全绿**、**既有用例零改动**。

## 反向演练 A：骨架占权威位必红，还原必绿 `serves: FR-1, FR-2, FR-7`

这是本需求**最重要**的一条——它证明判据真的在量东西。

```
① 把 REQ-261006164732-6503 的真实三份文件（requirement.md + prototypes/INDEX.md
   + prototypes/detail.html）喂给 checkPrototypeAnchorsGate
   → 期望：code === 'prototype_placeholder'
   → 期望：gaps 里点名 'prototypes/detail.html'，且含命中判据（占位标记原文 **或** 重合率读数）
   （实测：改动前这里是 PASS(放行)——即"骨架全绿"的现场证据）

② 把同一份文件换成一份填过的原型（用本需求自己的 prototypes/gate-feedback.html 顶替）
   → 期望：gate === undefined（放行）

③ 基线不可得：同样的骨架 + 空模板基线
   → 期望：gate === undefined（**不判**，不假红）
```

**只跑①不跑②等于没跑**（只证明会红，不证明不会误红）；只跑②不跑①同样无意义。

## 反向演练 B：对照项生成分支删掉必红 `serves: FR-3, FR-7`

证明"对照项由可选改硬判据"这条**真的被测试看守**：

```
① 正常态：权威原型存在 → 组装的验收单里必含 source.kind === 'prototype-compare' 的项
   → 期望：项存在，且其 prototypePath === INDEX 唯一 authoritative 行的路径

② 人为改坏：临时把「有权威原型 ⇒ 组装对照项」的分支退回条件化（只有已登记 .html 产物才组装），
   且该需求没有已登记产物
   → 期望：有测试**变红**（点名缺 prototype-compare 项）

③ 还原：恢复分支 → 全绿
```

**判据**：若②不变红，说明这条纪律没有判据在看守——**视为未完成**。

## 纯函数用例（免 IO、可逆验证） `serves: FR-1, FR-4`

`prototypePlaceholderOf(html, template)`：

| 用例 | 输入 | 期望 |
|---|---|---|
| TC-1 骨架原文 | `PROTOTYPE_HTML_SKELETON` 渲染后（占位符已替换）对**它自己** | 命中，`hits` 含 `marker`（占位标记原文） |
| TC-2 真稿 | 本需求 `prototypes/gate-feedback.html` | 未命中（`undefined`），且 `lineRatio < 0.90` |
| TC-3 只删占位符 | 骨架 + 把「（功能点名）」替换成「详情页说明」 | 仍命中（`similarity`，重合率 > 0.90）——**证明两条判据独立** |
| TC-4 只加内容不改结构 | 骨架 + 在每个 FR 区块内追加 20 行真实内容 | `lineRatio` 下降；结果取决于是否仍 > 0.90（用例冻结具体数值，防阈值漂移） |
| TC-5 阈值边界 | 构造 `lineRatio === 0.90` 的输入 | **不命中**（严格大于） |
| TC-6 空文件 | `''` | 不命中、不抛错、`lineRatio === 0` |
| TC-7 基线空 | `(html, '')` | 返回 `undefined`（不判） |
| TC-8 缩进差异 | 骨架整体重新缩进 | 仍命中（行比较先 `trim()`） |
| TC-9 真稿+反向样例 | REQ-261006175040-12d4 的权威原型 `card-gates.html` | 不命中（正向样本不得被打成骨架） |
| TC-10 半成品不得误伤 | REQ-261006092213-4f5b 的 `verification-result.html` | 不命中（实测 0.20） |

**⚠️ 夹具纪律**：TC-2 / TC-9 / TC-10 用**磁盘上真实存在**的原型文件（读文件内容进纯函数），
**不新建**"看起来像真稿"的假 HTML——真稿的价值恰恰是它由人写、形状不可预测。

`observationEvidenceOf(o, deps)`：

| 用例 | 输入 | 期望 |
|---|---|---|
| EC-1 两键齐且对 | `shot` 存在 + sha 匹配 | `collected` |
| EC-2 两键都缺 | 旧原型 | `unverified` |
| EC-3 缺 sha | 只有 `shot` | `invalid`，理由含「缺 sha256」 |
| EC-4 缺路径 | 只有 `shotSha256` | `invalid`，理由含「缺截图路径」 |
| EC-5 路径不存在 | `shot` 指向不存在的文件 | `invalid`，理由**点名路径** |
| EC-6 摘要不符 | 真实文件 + 错 sha | `invalid`，理由含期望与实际（前 12 位足够定位） |
| EC-7 形态非法 | sha 不是 64 位小写十六进制 | `invalid`，理由含「形态不合法」 |
| EC-8 绝对路径 | `shot: '/Users/…/x.png'` | `invalid`，理由含「路径口径」 |
| EC-9 端口缺失 | `deps.sha256Of` 抛错/返回 `undefined` | `unverified`（**不抛错**） |

`humanReasonHasFact(reason)`：

| 用例 | 输入 | 期望 |
|---|---|---|
| HR-1 含截图路径 | `见 evidence/gate-1280.png 的边框颜色` | `true` |
| HR-2 含命令 | `跑 npx vitest run tests/x.test.ts 看不到该项` | `true` |
| HR-3 含界面位置 | `详情页 #FR-4 的第三个格子` | `true` |
| HR-4 纯态度词 | `不好看` / `不一致` / `视觉上不对` | `false` |
| HR-5 空串 / 纯标点 | `''` / `——` | `false` |

## 门级用例（含早退与顺序） `serves: FR-1, FR-2`

| 用例 | 场景 | 期望 |
|---|---|---|
| G-1 | 骨架占权威位 | `prototype_placeholder`（**不是** `prototype_anchor_missing`） |
| G-2 | 权威原型缺 `id="FR-4"`（真稿） | `prototype_anchor_missing`（既有码语义不变） |
| G-3 | geometry 块 ×2（真稿） | `prototype_anchor_missing` |
| G-4 | geometry 含 `threshold` 字段 | `prototype_anchor_missing`（D-10 阈值禁令不变） |
| G-5 | 观测量的 sha 不符 | `prototype_geometry_unverified` |
| G-6 | 观测量缺两键 | **放行**（`unverified`） |
| G-7 | INDEX 缺「服务条款」列 | `prototype_version_conflict`（早退：非骨架判据不抢答） |
| G-8 | INDEX 有两条 authoritative | `prototype_version_conflict`（同上） |
| G-9 | INDEX 缺失 + 无已登记产物 | `prototype_missing`（存在门职责，顺序不变） |
| G-10 | 骨架 + superseded 的另一份 | 只判 authoritative 那一份（骨架若不在权威位则不判） |
| G-11 | 存量需求（`createdAt` 早于规则生效日）+ 骨架 | **放行**（不追溯） |

**码的唯一性断言**：G-1 与 G-2 的 `code` 必须**不同**（同一份文件、两种坏、两个码）。

## 验收组装用例 `serves: FR-3`

| 用例 | 场景 | 期望 |
|---|---|---|
| V-1 | UI 需求 + INDEX 唯一 authoritative + 无豁免 | 验收单含 `prototype-compare`，`prototypePath` === 权威路径 |
| V-2 | UI 需求 + `prototype_exempt` 生效 | 渲染豁免说明行，**不阻塞**提交（`needsPrototype === false`） |
| V-3 | UI 需求 + 无原型 + 无豁免 | `needsPrototype === true`，提交被拒（既有码 `verification_prototype_compare_missing`） |
| V-4 | 存量需求（旧 `createdAt`） | `compareInputsOf` 早退，产出与改动前**逐字一致** |
| V-5 | 非 UI 需求（`sides` 只含 backend） | 不组装对照项（既有出现条件不变） |
| V-6 | INDEX 读不出但台账有原型产物 | 降级为排序首项 + 材料注明降级（**不新增码**） |
| V-7 | `results` 逐项交代 | 对照项的 ref key 与验收单同构（`prototype:<path>`），漏项仍被点名 |

## 参数化对齐判据用例 `serves: FR-5`

| 用例 | 场景 | 期望 |
|---|---|---|
| P-1 | class 契约全命中 | 无违规 |
| P-2 | 少一个 `dsh-pm-*` 类 | 1 条违规，`contract === 'classes'`，`expected` 含该类名 |
| P-3 | `data-*` 属性名不符（复现真实事故） | 违规 `contract === 'dataAttrs'`，`expected` 含 `data-result-src`、`actual` 含 `data-result-source` |
| P-4 | `data-*` 取值域不符 | 违规，`actual` 给出实际取值 |
| P-5 | DOM 顺序颠倒 | 违规 `contract === 'order'`，两条名字都在 |
| P-6 | 违规必带锚点 | 每条违规的 `anchor` 非空且形态 `prototypes/<name>.html#FR-N` |
| P-7 | 既有断言只增不减 | 改造后 `tests/prototype-parity.test.ts` 的 `it(...)` 条数 ≥ 改动前 |
| P-8 | 真实正向样本 | REQ-261006175040-12d4 的 `card-gates.html` 配实现渲染 → 违规为空（证明判据不误伤） |

## 零回归与边界用例 `serves: FR-2, FR-7`

| 用例 | 场景 | 期望 |
|---|---|---|
| R-1 | 既有三门用例（`tests/prototype-gates.test.ts` 等） | **一字不改**，全绿 |
| R-2 | `tests/plan-prototype-anchor-gate.test.ts` | 全绿（含 `.length === 3` 的门签名断言） |
| R-3 | `assertClauseCoverageGate` 签名 | 仍是三参 |
| R-4 | `landPrototypeSkeleton` 非 UI 需求 | `reason === 'not-ui'`，不落文件 |
| R-5 | 落盘骨架 + **未登记** | 存在门仍报 `prototype_missing`（"登记才算数"不得被放宽） |
| R-6 | 骨架落盘幂等 | 已存在 ⇒ 一个字节都不写 |
| R-7 | 新码 HTTP 状态 | `statusForCode('prototype_placeholder') === 400`；`('prototype_geometry_unverified') === 400` |
| R-8 | 新码中文名 | `ERROR_CATEGORY` 两键都在（值非空） |
| R-9 | 会话侧传输码 | `MoveRequirement` 映射表两键都在（内部码 ↔ 传输码成对） |
| R-10 | `how` 锚点 | 两个新码的 `message` 命中 `GATE_HOW_ANCHOR` 正则 |
| R-11 | 台账零迁移 | 旧分片（缺新键）读出后**字节不变**（跑一次读路径，比对文件哈希） |

## 端到端验收演练（人可复核） `serves: FR-7`

```bash
# ① 主判据
npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts

# ② 反向演练 A（骨架必红）
#    夹具已固化在用例内；若要手工复核，用本文档「反向演练 A」的三步走

# ③ 反向演练 B（对照项分支删掉必红）
#    用例内以"注入 degraded 分支"的方式复现；改坏 → 跑 → 必红 → 还原

# ④ 我们的自洽性
#    本需求自己的原型必须过它要立的判据：
node -e "…读 prototypes/gate-feedback.html 与骨架模板，打印 lineRatio 与占位标记命中数…"
#    期望：lineRatio < 0.90 且占位标记命中 0

# ⑤ 构建
pnpm build && pnpm build:client   # 后者必须打印 [verify-client] OK
```

**⑤ 的 `[verify-client] OK` 是硬判据**：client 改动（`ERROR_CATEGORY` 两行）
若没进包，面板上两个新码就没有中文类别名——那是"改了但人看不到"的假绿。

## 验收判据的成熟度声明 `serves: FR-7`

- 本文件的每条用例都写成**可失败的断言**（不是"看着对"）；
- 反向演练 A / B 是**元判据**：它们验的不是功能，而是"判据有没有在量东西"；
- **未做**的部分如实声明：跨浏览器视觉一致性、原型的美观度、`needsHuman` 理由是否
  真的成立——这三项是**人的判断**，本需求不假装机器能判。
