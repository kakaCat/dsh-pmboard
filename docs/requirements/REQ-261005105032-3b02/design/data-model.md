---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-8, FR-9, FR-11]
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-8, FR-9, FR-11]
---

# 数据模型设计（REQ-261005105032-3b02 原型与裁定进契约）（serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-8, FR-9, FR-11）

> 唯一契约源：`notes/design-brief.md`（第 1 / 3 / 4 / 5 节）。字段名、取值、错误码与 brief 逐字一致。
> 本份只定义**数据结构、字段与字段级不变量**；门禁行为（何时拒 / 错误码落点）见门禁设计文档。
> 原「待定（需补充 brief）」已按 brief §10 **待定项决议**逐条回填，行内引用 `#N` 指向该表条目。
> 本份残留的标记只剩两类：`#N`（决议编号）与「（推理，非 brief 明文）」；无未决项。

## 0. 模型总览（serves: FR-1, FR-2, FR-3, FR-4, FR-8, FR-9, FR-11）

| # | 结构 | 载体（事实源） | 写入方 | 读取方 | 契约来源 |
|---|---|---|---|---|---|
| 1 | 产物 kind 扩展 `prototype` | `src/domain/artifact/ArtifactSpec.ts` | 研发 | 产物发现、登记、门禁 | brief §1 / 决议 `#1` `#3` `#33` |
| 2 | `prototypes/INDEX.md` 权威清单 | 需求目录 `prototypes/INDEX.md` | agent 手写（`#9`） | 权威版本门、文档面板 | brief §1 / 决议 `#2` `#9` `#32` |
| 3 | `proto-geometry` 观测块 | 原型 HTML 内单块注释 | agent（画原型时） | 锚点门、探针、RTM | brief §1 / 决议 `#4` `#5` `#8` |
| 4 | D-x 裁定条目 | `requirement.md`「讨论与裁定记录」表 | agent | 裁定门、RTM、提示词 | brief §3 / 决议 `#16` `#20` `#23` |
| 5 | `prototype_exempt` 豁免键 | `requirement.md` front-matter | 人（随 G1 确认） | 原型存在门 | brief §1 / 决议 `#7` `#10` `#13` |
| 6 | RTM `Prototype` / `Decision` | `vendor/reqboard/src/rtm/types.ts` | RTM 生成器 | 校验器、覆盖度、面板 | brief §5 / 决议 `#18` `#19` `#42` |
| 7 | `ID_PATTERN` / `protoRefs` | `src/application/internal/content-gates.ts` | 研发 | 覆盖度、编号链 | brief §4 / 决议 `#6` `#36` |

## 1. 产物 kind 扩展：`ArtifactKind += 'prototype'`（serves: FR-1, FR-2）

### 1.1 联合类型与运行时清单（serves: FR-2）

| 项 | 类型 / 值 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `ArtifactKind` 联合 | 既有 9 种 + `'prototype'` = 10 种 | 是 | 联合与运行时清单**必须同时**加项 | `'prototype'` |
| `ALL_ARTIFACT_KINDS` | `readonly ArtifactKind[]` | 是 | 与联合逐项相等（顺序无关） | `['…', 'prototype']` |
| 入参白名单 | `ALL_ARTIFACT_KINDS.includes(kind)` | 是 | 漏加即 `reqboard_submit` / 看板确认 / 弹框确认拒收该 kind | `kind=prototype` |

> 依据（明文）：brief §1 第 1 行「`ArtifactKind` 增加 `'prototype'`；`ALL_ARTIFACT_KINDS` 同步」。
> 落点实测：`asArtifactKind` / `AskConfirm.ts` / `ConfirmArtifact.ts` 三处都读 `ALL_ARTIFACT_KINDS` 做白名单。

### 1.2 路径识别：`NAME_TO_KIND` 三条正则（serves: FR-2）

| 序 | 正则 | 命中 kind | 备注 |
|---|---|---|---|
| 1 | `/^prototypes\/.+\.html$/` | `prototype` | 权威路径 |
| 2 | `/^prototype\/.+\.html$/` | `prototype` | 旧路径（REQ-292a 形态）；门禁消息提示迁移 |
| 3 | `/^prototypes\/INDEX\.md$/` | `prototype` | 权威清单（决议 `#1`：不落 `notes`） |

| 不变量 | 说明 |
|---|---|
| 输入口径 | 正则吃的是**需求目录相对路径**（`kindForRelPath(rel)`，`rel` 由 `reqDirRel(reqId) + '/'` 前缀切出）；口径见决议 `#2` |
| 插入位置 | 追加到既有 7 条之后；既有 7 条与相对顺序**不动**（避免旧需求分类漂移） |
| 未命中回落 | 仍为 `notes`（既有行为不变） |
| `INDEX.md` | 命中第 3 条 → `prototype`（决议 `#1`）；不能再落 `notes` |

### 1.3 路径约定（serves: FR-2）

| 路径 | 用途 | kind | 状态 |
|---|---|---|---|
| `docs/requirements/<REQ>/prototypes/<name>.html` | 原型正文（唯一权威版本所在目录） | `prototype` | 权威 |
| `docs/requirements/<REQ>/prototypes/INDEX.md` | 权威清单（§2） | `prototype` | 决议 `#1` |
| `docs/requirements/<REQ>/prototype/*.html` | 旧目录，仅识别 + 提示迁移 | `prototype` | 兼容 |

> 路径书写口径（决议 `#2`）：**需求目录相对**（`prototypes/x.html`），与 requirement / design 文档引用一致；
> 比对前一律先经 `normalizeArtifactPath` 归一化（避免两种写法被判不一致）。

### 1.4 产物元数据：`StageArtifact.prototypeMeta`（serves: FR-2, FR-4）

登记原型产物时抽取锚点与观测清单写进产物元数据。**字段名与形状以决议 `#41` 为唯一事实源**（本份不重复定义、不另立字段名）。

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `prototypeMeta` | 对象（形状见决议 `#41`） | 否（仅原型产物注入） | 缺省不注入；旧产物记录缺该键 = 未采集，不判坏 | `{…}` |
| `prototypeMeta.anchors` | 数组（**元素形状与键名见决议 `#41`**） | 注入时必填 | 每项指一条 FR 锚点，且须命中真实 FR | 见 `#41` |
| `prototypeMeta.geometry` | 数组（**元素形状见决议 `#41`**，与 §3 同源同校） | 注入时必填 | **不含阈值**（D-10）；`unit` / `at.state` 闭值域见 §3.2 | 见 `#41` |
| `prototypeMeta.geometry[].source` | `enum` | 否 | `prototype`（缺省） \| `human`（人给的量化值） | `human` |

| 关联决议 | 约束 |
|---|---|
| `#41` | **唯一字段名事实源**：`anchors` 元素与 `geometry` 元素的键名一律以它为准 |
| `#49` | 原内联的 `anchors: {fr, selector}[]` 形状已改为**指向 `#41`**（语义相同，避免两套字段名） |
| `#8` | `source` 缺省 `"prototype"`；人给的量化值标 `"human"` |
| `#48` | `submit:prototype` 载荷携带 `paths: string[]`（本次登记的原型路径）；生成器仍以**台账**为事实源 |

### 1.5 新增 kind / 枚举的连带必改（serves: FR-2）

| 决议 | 位置 | 必改 | 漏改后果 |
|---|---|---|---|
| `#33` | `src/shared/artifact-labels.ts` | 配中文名「原型」 | `tests/artifact-labels.test.ts` 中文名护栏拦 |
| `#33` | `Record<ArtifactKind, DocPanelKind>` | 穷尽性同步 | 映射缺失 / 类型不穷尽 |
| `#30` | `DocPanelKind` | 增 `'prototype'`（确定文档块内单列） | 原型退化成"其它发现" |
| `#30` | 原型面板行 | **必须保留 `data-doc-row="1"`** | 文档 Tab 恒等式断言破 |
| `#41` | `StageArtifact.prototypeMeta` | 见 §1.4 | 锚点/几何量无处落，下游只能重解析 HTML |

### 1.6 示例与断言（serves: FR-2）

```typescript
kindForRelPath('prototypes/detail.html') === 'prototype'   // 权威路径
kindForRelPath('prototype/detail.html')  === 'prototype'   // 旧路径
kindForRelPath('prototypes/INDEX.md')    === 'prototype'   // 决议 #1（不再落 notes）
kindForRelPath('prototypes/detail.html.bak') === 'notes'   // .bak 不命中
stageForKind('prototype', 'accepting')   === 'brainstorming' // 决议 #3：显式 case
```

## 2. `prototypes/INDEX.md` 模型（serves: FR-3）

### 2.1 表格模型（serves: FR-3）

唯一载体：`prototypes/INDEX.md` 内**一张 Markdown 表格**（既有 `parseDocument` 能解析表格；不引前端解析库）。

| 列名（逐字） | 类型 | 必填 | 值域 / 不变量 | 示例 |
|---|---|---|---|---|
| `路径` | `string` | 是 | **需求目录相对**（决议 `#2`）；行内唯一 | `prototypes/detail.html` |
| `状态` | `enum` | 是 | `authoritative` \| `superseded` | `authoritative` |
| `服务条款` | `string` | authoritative 行必填 | FR 编号列表，每个编号必须命中真实 FR（FR-1~FR-11） | `FR-3, FR-4` |
| `被取代于` | `string` | superseded 行必填 | 指向取代它的权威路径；须在本表内存在 | `prototypes/detail-v2.html` |

| 维护纪律 | 内容（决议 `#9`） |
|---|---|
| 谁写 | **agent 手写**清单内容 |
| 登记侧 | 只**校验**不改写——保持"登记不改产物内容"的既有纪律 |
| 归一化 | 与文档引用比对前先 `normalizeArtifactPath`（决议 `#2`） |

### 2.2 状态值域（serves: FR-3）

| 值 | 含义 | 允许条数 | 必须配的列 |
|---|---|---|---|
| `authoritative` | 唯一权威版本（下游只能引用它） | **恰好 1 条** | `服务条款` 非空 |
| `superseded` | 已作废版本 | 0..N | `被取代于` 非空 |

### 2.3 不变量（serves: FR-3）

| 编号 | 不变量 | 违规处置 |
|---|---|---|
| I1 | `authoritative` 恰好一条（0 条 → 拒；≥2 条 → 拒并点名两份路径） | `prototype_version_conflict` |
| I2 | 每条 `superseded` 的 `被取代于` 非空且指向本表存在的行 | `prototype_version_conflict` |
| I3 | `服务条款` 的每个编号命中真实 FR（FR-1~FR-11）；不存在 → 拒 | `prototype_version_conflict` |
| I4 | 权威原型必须含 `id="FR-N"` 区块，覆盖其 `服务条款` 声明的每个 FR | `prototype_anchor_missing` |
| I5 | `requirement.md` / `design/frontend.md` 中出现的原型路径必须**等于**权威行路径；指向 `superseded` → 拒 | `prototype_version_conflict` |
| I6 | INDEX 文件缺失 → 拒（等价 0 条 `authoritative`） | `prototype_version_conflict` |

> 书写口径（决议 `#2`，原待定项）：`路径` 与文档引用统一用**需求目录相对**（`prototypes/x.html`），
> 与 `requirement.md` / `design/frontend.md` 的写法一致；比对前经 `normalizeArtifactPath` 归一化。

### 2.4 示例（serves: FR-3）

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/detail-v2.html | authoritative | FR-3, FR-4 | |
| prototypes/detail.html | superseded | FR-3 | prototypes/detail-v2.html |

> 上例即 REQ-292a 事故形态的正解：两版并存不拒，但**只有一条权威**，且文档引用必须指向 v2。

### 2.5 服务端投影：INDEX → 文档面板（serves: FR-3）

`QueryDocs` 读 INDEX 后投影到面板条目（决议 `#32`）：只**加可选字段**，旧形状不变。

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `DocPanelEntry.prototypeRole` | `enum` | 否 | `authoritative` \| `superseded`；缺省不注入 | `authoritative` |
| `DocPanelEntry.supersededBy` | `string` | 否 | 与 INDEX 的 `被取代于` 同值；缺省不注入 | `prototypes/detail-v2.html` |

| 关联决议 | 约束 |
|---|---|
| `#32` | 读 INDEX 失败 / 无 INDEX → 两字段都不注入（不伪造角色） |
| `#30` | 原型行仍须保留 `data-doc-row="1"`（§1.5） |
| `#34` | 恒等式：`documents` 中来自台账的行数 + Σ`discovered.count` == `artifacts.length` |

## 3. `proto-geometry` JSON 形状（serves: FR-4）

### 3.1 形状（serves: FR-4）

载体：原型 HTML 内**单块**注释 `<!-- proto-geometry {json} -->`（正则抽取，与既有 doc 解析同风格，不引 HTML 解析库）。
本块字段名与决议 `#41` 的 `prototypeMeta.geometry[]` 元素**逐字一致**（同一形状、同一事实源，决议 `#49`）。

```typescript
type GeometryUnit = 'px' | 'count' | 'ratio'          // 决议 #5：闭值域
type GeometryState = 'inflight' | 'terminal'          // 决议 #5：闭值域

interface ProtoGeometry { observations: Observation[] }
interface Observation {
  name: string                                        // 观测量名，如 tabsTop（块内唯一，#5）
  value: number                                       // 实测值（不是阈值）
  unit: GeometryUnit                                  // 单位
  at: { width: number; state: GeometryState }         // 测量条件：窗口宽 + 页面态
  source?: 'prototype' | 'human'                      // 缺省 'prototype'（决议 #8）
}
```

| 来源纪律 | 内容（决议 `#8`） |
|---|---|
| 缺省 | 观测量由 **agent 量原型稿自身渲染**得到，必须显式传窗口宽与状态 |
| 例外 | 无法量化者由**人给**值，并标 `source: "human"`（缺省 `"prototype"`） |
| 为什么 | 避免 REQ-292a「漏传窗口宽导致量错」重演 |

### 3.2 字段表（serves: FR-4）

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `observations` | `Observation[]` | 是 | 非空数组；元素为对象 | `[{…}]` |
| `observations[].name` | `string` | 是 | 非空；**块内唯一**（决议 `#5`） | `tabsTop` |
| `observations[].value` | `number` | 是 | 有限数（非 NaN）；**实测值** | `576` |
| `observations[].unit` | `enum` | 是 | `px` \| `count` \| `ratio`（决议 `#5`） | `px` |
| `observations[].at` | `object` | 是 | 对象，含 `width` 与 `state` 两个键 | `{…}` |
| `observations[].at.width` | `number` | 是 | 正数（测量时的窗口宽，**显式传入**） | `1280` |
| `observations[].at.state` | `enum` | 是 | `inflight` \| `terminal`（决议 `#5`） | `inflight` |
| `observations[].source` | `enum` | 否 | `prototype`（缺省） \| `human`（决议 `#8`） | `human` |

### 3.3 硬不变量：禁止阈值字段（D-10）（serves: FR-4）

| 项 | 规则 |
|---|---|
| 原则 | 原型只放**观测量名 + 实测值**；阈值由设计阶段按真实页面数据定死，再由 UI 卡 acceptance 与探针引用 |
| 判定 | 递归遍历 JSON 全部键（含嵌套）；键名命中禁用词表即违规 |
| 禁用词表 | `threshold` / `max` / `min` / `limit` / `expected` / `tolerance` / `upper` / `lower` / `range` / `budget` / `target` / `pass` / `fail` |
| 违规错误码 | `prototype_anchor_missing`（brief §2 明文：geometry 里出现阈值字段） |
| 理由 | 避免"原型自己声明阈值、自己判自己过"的自证 |

### 3.4 示例与反例（serves: FR-4）

```html
<!-- 正例：只有观测量名与实测值 -->
<!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->

<!-- 反例（拒）：tabsTopMax 是阈值字段；thresholds 整块都是阈值 -->
<!-- proto-geometry {"observations":[{"name":"tabsTopMax","value":700,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->
```

| 编号 | 不变量 | 依据 |
|---|---|---|
| G1 | 注释块**恰好一块** | brief §1 明文「单块注释」 |
| G2 | 块内 JSON 可解析；解析失败 = 缺块处理 | 推理（brief 只给形状） |
| G3 | 阈值键出现即拒 | D-10 明文 |
| G4 | 出现**多块** → **拒**，报 `prototype_anchor_missing` 并点名块数（决议 `#4`） | brief §10 #4 |

## 4. D-x 裁定条目模型（serves: FR-8, FR-9）

### 4.1 节与载体（serves: FR-8）

| 项 | 决定 |
|---|---|
| 节名 | `## 讨论与裁定记录（D-x）`（**仅 feature 需求模板**，D-12） |
| 载体 | 该节内一张 Markdown 表格（一处表格 = 全部裁定条目） |
| 列（逐字，五列） | `编号` / `原话来源` / `裁定` / `影响 FR` / `判据` |
| 裁定门模块 | `src/application/internal/decision-gates.ts`（决议 `#16`） |
| 结构裁定 | 不新增聚合函数 `assertPrototypeGates`，内联到既有单点 `assertArtifactGates`（决议 `#22`） |

### 4.2 五列字段表（serves: FR-8）

| 列 | 类型 | 必填 | 值域 / 不变量 | 示例 |
|---|---|---|---|---|
| `编号` | `string` | 是 | `D-\d+`；连续、唯一（见 §4.3） | `D-1` |
| `原话来源` | `string` | 是 | 非空；可指回具体会话消息 id 或时间戳 + 引用原话（禁止只写概括） | 用户：「改成 X」 |
| `裁定` | `string` | 是 | 非空；结论句 | 阈值由设计阶段定死 |
| `影响 FR` | `string` | 是 | 非空；每个编号命中真实 FR-1~FR-11 | `FR-4` |
| `判据` | `string` | 是 | 非空；可核验判据（指向验收标准/断言） | 验收标准 4 |

> 有效性判定：**每行五列齐**（任一列为空即无效条目），错误码 `decision_entry_invalid`，`gaps` 列条目编号。

### 4.3 编号规则（serves: FR-8）

| 规则 | 内容 | 违规 |
|---|---|---|
| 形态 | `D-1`、`D-2`、…（单段数字，不是 `D-<域>-<n>`） | `decision_entry_invalid` |
| 连续 | 从 1 开始无跳号（复用 `checkClauseSequence` 思路） | `decision_entry_invalid`（gaps 列编号） |
| 唯一 | 同号不重复 | `decision_entry_invalid` |
| 命名空间 | 与设计编号 `D-ARCH-2` **互不干扰**：`checkClauseSequence` 按前缀分组，`D` 自成一组；`D-ARCH-2` 不匹配 `^([A-Z]+)-(\d+)$`，不入组 | — |
| 根/下游口径 | `D` 已在 `CHILD_PREFIXES`（下游编号），故 `isRootId('D-1') === false`：既有 orphan 统计**不覆盖** D-x | — |

> 影响：FR-9 的「每条 D-x 必须被引用」不能靠既有 orphan 口径实现，须按 §7/§6 的独立核查（覆盖度点名）。

### 4.4 真空态（serves: FR-8）

| 项 | 规则 |
|---|---|
| 形态 | 节内**唯一内容**为「本节无裁定」 |
| 语义 | 不视为空节 → 放行（禁止为过门禁硬凑条目） |
| 冲突 | 若会话侧存在裁定留痕（§4.5 启发式命中），即使写了真空态仍**视为空节**（留痕判据优先） |
| 错误码 | 缺节 / 空节 → `decision_log_missing` |

### 4.5 裁定边界（D-11）与留痕判据（serves: FR-8）

| 类别 | 算不算裁定 | 例子 |
|---|---|---|
| 祈使句 | 算 | 「改成 X」 |
| 纠正 | 算 | 「不对，应该是 Z」 |
| 补充要求 | 算 | 「还要考虑 W」 |
| 疑问句 | **不算** | 「这个能不能优化一下」 |
| 事实确认 | **不算** | 「对，就是这样」 |

| 留痕判据（只用于"要求非空"） | 内容 |
|---|---|
| 数据源 | 既有会话读取能力（`SessionProbeAdapter`，不新增数据源） |
| 接入方法 | `hasDecisionTrace(sessionProbe, req, opts)`（决议 `#20`）：复用两条读法（快照优先 / 冷读回落） |
| 取数范围 | 只取 `source.kind === 'user'`；**只扫最近 N 条（默认 200）**（决议 `#20`） |
| 启发式 | 人类消息含祈使标记（`改成/不要/必须/加上/应该是/记得/注意/别/要`）→ 视为「存在裁定留痕」 |
| 用法边界 | **只判"该节是否必须非空"，不判内容对错**（抽取仍由 agent 做） |
| 召回率 | **不承诺可测**：只锁"启发式命中即要求非空"，召回率由 G2 人评审承担（决议 `#23`，如实写明） |
| 测试口径 | 单测只覆盖**快照路径**；冷读路径标 `@integration`（决议 `#24`） |

### 4.6 被引用与呈现（serves: FR-9）

| 项 | 规则 |
|---|---|
| 被引用要求 | 每条 D-x 至少被一条 FR 明细或一张卡的 `requirementRefs` 引用 |
| 未被引用的呈现 | **覆盖度点名该 D-x**（不拒阶段转移；依据 requirement.md 验收标准 13 的措辞） |

## 5. `requirement.md` front-matter 新键：`prototype_exempt`（serves: FR-1）

### 5.1 键模型（serves: FR-1）

| 项 | 值 / 规则 |
|---|---|
| 键名 | `prototype_exempt` |
| 位置 | `requirement.md` 的 front-matter |
| 类型 | `string`（理由文本） |
| 必填性 | **可选**（仅 UI 需求要豁免时写；不写即无豁免） |
| 缺省语义 | 键不存在 = 无豁免，按原型存在门要求原型 |
| 示例 | `prototype_exempt: 纯文案微调，页面由设计系统组件库直接替代（人已确认）` |

### 5.2 生效条件（D-13）（serves: FR-1）

| 条件 | 要求 | 缺一即 |
|---|---|---|
| ① 理由 | `trim()` 后非空 | 豁免无效 → 仍按未豁免拒（`prototype_missing`） |
| ② 人确认 | requirement 产物**已落章**（G1 已确认，`confirmedAt` 有值） | 仍拒——**agent 不能自己豁免自己** |
| ③ D-x 留档 | requirement 的 D-x 里必须有**一条裁定记录**该豁免（人确认文档时必然看到，决议 `#10`） | 视为无豁免 |
| 适用范围 | `sides` 含 `frontend` 且类型为 feature / refactor 的需求 | 非 UI 需求写不写均无效果（不报错） |
| 不新增弹框 | 搭 G1 既有确认门的车（brief §1 / §10） | — |

### 5.3 留痕位置（serves: FR-1）

| 留痕点 | 内容 |
|---|---|
| ① | `requirement.md` front-matter 里 `prototype_exempt` 的原文（理由可核验） |
| ② | 台账 `StageArtifact`（kind=requirement）的 `confirmedAt` / `confirmedBy` / `confirmedSource`（人确认的证据） |
| ③ | 门禁放行/拒绝消息回显理由原文（人能看到自己写了什么） |
| ④ | **需求评论一条 `[豁免] <理由>`**（决议 `#7`，与 `design_exempt` 同款；登记/推进时写入） |
| ⑤ | 豁免理由的 D-x 条目（§5.2 条件③，决议 `#10`） |
| ⑥ | `prototype_exempt` 必须进 `GATE_HOW_ANCHOR` 正则（决议 `#40`），门禁 how 文案须含可执行锚点 |

| 关联决议 | 约束 |
|---|---|
| `#13` | 原型产物门禁**只要求已登记**；确认章为可选加强；G1 确认需求文档时一并展示原型路径 |

## 6. RTM 新类型：`Prototype` / `Decision`（serves: FR-5, FR-9）

### 6.1 `Prototype`（serves: FR-5）

```typescript
interface Prototype {
  path: string                                       // 原型路径
  authoritative: boolean                             // 是否权威版本
  superseded_by?: string                             // 被取代于（authoritative=true 时省略）
  serves: string[]                                   // 服务的 FR（编号引用）
  anchors: Array<PrototypeMetaAnchors[number]>        // FR 锚点：元素形状见决议 #41（不进 serves）
  geometry: Array<PrototypeMetaGeometry[number]>      // 观测：元素形状见决议 #41（与 §3 同源）
}
```

> 上两行的元素类型名只是"指向 `#41`"的写法；**字段名与形状一律以决议 `#41` 为准**（决议 `#49`），本份不另立。

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `path` | `string` | 是 | 与 §1.3 路径口径一致（需求目录相对，决议 `#2`） | `prototypes/detail.html` |
| `authoritative` | `boolean` | 是 | 同一 `prototypes` 节内**恰好一条** `true` | `true` |
| `superseded_by` | `string` | superseded 时必填 | 指向权威路径 | `prototypes/detail-v2.html` |
| `serves` | `string[]` | 是 | 只放 FR 编号；**不得混入锚点**（§7.3） | `["FR-3","FR-4"]` |
| `anchors` | 数组（**元素形状见决议 `#41`**） | 是 | 每项指一条 FR 锚点；锚点引用不进 `serves` | 见 `#41` |
| `geometry` | 数组（**元素形状见决议 `#41`**） | 是 | 与 §3 同形状同校（`unit` / `state` 闭值域、`source` 可选）；**不含阈值**（D-10） | 见 `#41` |

### 6.2 `Decision`（serves: FR-9）

```typescript
interface Decision {
  id: string          // D-1
  source: string      // 原话来源
  verdict: string     // 裁定
  serves: string[]    // 影响 FR
  criterion: string   // 判据
}
```

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `id` | `string` | 是 | `D-\d+`；节内唯一 | `D-1` |
| `source` | `string` | 是 | 非空 | 用户：「改成 X」 |
| `verdict` | `string` | 是 | 非空 | 阈值由设计阶段定死 |
| `serves` | `string[]` | 是 | 命中真实 FR | `["FR-4"]` |
| `criterion` | `string` | 是 | 非空 | 验收标准 4 |

### 6.3 `rtm_version` 升位（serves: FR-11）

| 项 | 值 | 依据 |
|---|---|---|
| 字段 | `metadata.rtm_version`（`RTMMetadata.rtm_version?: string`，lifecycle 用） | 实测 `rtm-lifecycle.yml` |
| 现基线 | `"1.0"` | 本需求 `rtm-lifecycle.yml` 实测 |
| 目标值 | **`"2.0"`** | 决议 `#18` / `#42`（新增两节 + 新引用前缀属 schema 变更） |
| 不变 | `metadata.version`（每次写入 +1 的计数）语义不变 | 实测 `rtm-brainstorming.yml` 的 `version: 5` |
| 不冲突 | `rtm_version` 是 schema 版本，`version` 是写入计数，两者不同键 | 实测 `types.ts:73/75` |

### 6.4 新节与宽容度（serves: FR-5, FR-9, FR-11）

| 节 / 字段 | 归属文件 | 内容 | 缺节处置 |
|---|---|---|---|
| `outputs.prototypes` | `rtm-brainstorming.yml` | 每条 = 一个 `Prototype` | **`pending`（未采集），不判损坏** |
| `outputs.decisions` | `rtm-brainstorming.yml` | 每条 = 一个 `Decision` | `pending`，不判损坏 |
| `task_coverage[].covers_prototypes` | `rtm-decomposing.yml` | 该卡承接的原型锚点（来源 `prototypeRefs`） | `pending`，不判损坏 |
| `task_coverage[].covers_decisions` | `rtm-decomposing.yml` | 该卡承接的 D-x | `pending`，不判损坏 |
| 未知 key | 全部 7 份 | 校验器**忽略不报错**（前向兼容） | — |

| 覆盖度新维度 | 判据 | 呈现 |
|---|---|---|
| UI 卡原型锚点 | UI 卡必须有原型锚点；缺 → 覆盖度 < 100% | 点名卡 |
| D-x 被引用 | 每条 D-x 必须被引用 | 点名 D-x（§4.6） |

### 6.5 健康检查与触发点（serves: FR-5）

| 项 | 规则 |
|---|---|
| `expectedRTMFiles()` | **不变**（仍 7 份） |
| 健康检查新增 | UI 需求的 `rtm-brainstorming.yml` 缺 `prototypes` 节 = **不健康并点名**（文件在但内容空属静默降级） |
| **适用性判据** | 只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince`（插件配置常量，默认规则上线日）的需求才判；存量一律 `exempted: legacy` 并如实报告（决议 `#19`，化解"缺节=不健康"与"存量不判坏"的冲突） |
| 触发点 | `rtm-yaml.ts` 增加 `submit:prototype`（登记原型即刷新 brainstorming RTM），与既有 6 个触发点同构 |
| 验收项 | `accepting-generator.ts` 的验收项含「原型对照」证据条目 |
| 校验器 | `validator.ts` 认新前缀；缺节 = `pending`；未知 key 忽略 |

## 7. 编号白名单与 `protoRefs`（serves: FR-9, FR-11）

### 7.1 `ID_PATTERN` 增 `D-\d+`（serves: FR-11）

| 项 | 内容 |
|---|---|
| 现基线（实测） | `(?:FR\|BUG\|RF\|SP\|DOC\|CH)-\d+\|D-[A-Z]+-\d+\|(?:T\|BE\|FE\|TC\|E)-\d+\|t-[0-9a-f]{6}` |
| 现缺陷（实测） | `collectIds('D-1')` === `[]`（白名单只认 `D-ARCH-2` 形态） |
| 改后 | 在同一交替里新增一支 `D-\d+` |
| 容器不变量 | 仍是**单一事实源** `ID_PATTERN`；`collectIds` / `extractServes` 等全部经它，不得各写一份 |

### 7.2 与 `D-[A-Z]+-\d+` 不冲突（serves: FR-11）

| 断言 | 期望 | 依据 |
|---|---|---|
| `collectIds('D-1')` | `['D-1']` | brief §3 实测目标 |
| `collectIds('D-ARCH-2')` | `['D-ARCH-2']` | brief §3 明文「不冲突」 |
| `collectIds('D-1 D-ARCH-2')` | `['D-1','D-ARCH-2']` | 推理（交替左到右 + `\b` 包裹） |
| `collectIds('D-1abc')` | `[]`（不误伤） | 推理（`\b` 兜底：`1` 与 `a` 之间无边界） |

> 冲突分析：`D-\d+` 在 `D-ARCH-2` 上于 `-` 后遇 `A`（非数字）即失败，再由 `D-[A-Z]+-\d+` 命中；两者可共存，但**必须有上面四条断言锁死**。

### 7.3 锚点不计 `serves`：`stripPrototypeAnchors` + `protoRefs`（serves: FR-9, FR-11）

| 项 | 决定 |
|---|---|
| 实测缺陷 | `collectIds('prototypes/x.html#FR-4')` → `['FR-4']`：**假引用**，会让覆盖度虚高 |
| 规则 | **锚点不计入 serves**；serves 抽取前先调用纯函数 `stripPrototypeAnchors(text)`，把 `\S+#FR-\d+` 形态替换为固定 token **`<proto-anchor>`**（决议 `#6`） |
| 新字段 | `protoRefs`（任务卡 / 设计章节）：`string[]`，取值 = 锚点引用原文 |
| 登记字段名 | `TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（决议 `#36`，与既有 `requirementRefs` 命名对齐） |
| 统计 | `protoRefs` **单独统计**，不与 FR 编号引用混算（覆盖度分列） |
| 回归 | 贴锚点不写实现 → 覆盖度**不上升**；strip 后 `collectIds` 不再产出该 FR |

| 字段 | 类型 | 必填 | 不变量 | 示例 |
|---|---|---|---|---|
| `protoRefs` | `string[]` | 否（无锚点为空数组） | 元素含 `#FR-\d+`；**不得写进 serves** | `["prototypes/detail.html#FR-4"]` |

## 8. 迁移与兼容（serves: FR-2, FR-11）

### 8.1 旧路径识别与迁移提示（serves: FR-2）

| 项 | 规则 |
|---|---|
| 识别 | `prototype/*.html` 仍判 `prototype`（§1.2 第 2 条） |
| 迁移提示 | 门禁/登记消息提示迁移到 `prototypes/`（brief §1 明文） |
| 自动化程度 | **只做提示，不自动搬文件**（不自动改写人写的目录） |
| 已登记条目回填 | 分类规则升级后，`autoDiscovered` 且 kind 已过期的旧条目会被 `staleAutoKind` 回填（原型条目 → `prototype`；`prototypes/INDEX.md` 条目 → `prototype`）——口径按决议 `#1` / `#2`（回填机制本身为推理，非 brief 明文） |

### 8.2 存量 66 条 RTM 读取（serves: FR-11）

| 场景 | 期望 |
|---|---|
| 旧文件缺 `prototypes` / `decisions` 节 | 读出 `pending`（未采集），**不判损坏**、不报错 |
| 旧文件含未知 key | 忽略，不报错 |
| 存量 66 条需求 | 读取不报错、不被判不健康（兼容基线） |
| 存量 vs 新健康判据 | 适用性判据见 §6.5（决议 `#19`）：存量一律 `exempted: legacy`，**不判不健康**但如实报告 |
| 已归档 8 条 + REQ-292a | 不被新门禁追溯拒绝（不追溯存量） |
| 本需求自身 | 不交原型、不写 exempt（决议 `#29`：规则生效前不追溯，`frontend.md` 如实写明） |

### 8.3 台账 JSON 分片：加性变更、零迁移（serves: FR-2）

| 项 | 事实 |
|---|---|
| kind 扩项 | **不产生 schema 变更**：产物种类落在既有字符串字段 `StageArtifact.kind` 上，扩联合 = 拓宽既有取值域 |
| 但有两处**加性**字段 | 决议 `#41` 的 `StageArtifact.prototypeMeta?` 与决议 `#36` 的 `TaskRecord.prototypeRefs?` / `decisionRefs?`——均为**可选新键** |
| 加性的含义（如实写明） | 旧记录缺该键 = 未采集（`undefined`），**不补齐、不改写、不做数据迁移**；读取路径与旧形状不变 |
| 需同步 | 运行时白名单 `ALL_ARTIFACT_KINDS`（输入侧校验；不改存量分片的读取路径） |
| 存量影响 | 存量分片里不存在 `prototype` 取值与上述新键 → 读写双向兼容；新值/新键只在写侧出现 |
| 结论 | 加性（additive）而非破坏性；**无迁移脚本** |

### 8.4 边界（本文档的适用范围）（serves: FR-2）

| 边界 | 说明 |
|---|---|
| 不改既有必填节名与产物语义 | 只在 `sides` 特征维度上新增原型维度 |
| 不追溯存量 | 历史需求不补录 D-x、不回填原型 |
| 不新增运行时依赖 | 原型元数据靠正则抽取，不引 HTML 解析库 |
| 不新增弹框 | 豁免搭 G1 既有确认门 |

## 9. 关键决策与取舍（serves: FR-2, FR-3, FR-4, FR-8, FR-11）

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 原型元数据放哪 | 引 HTML 解析库读 DOM | **单块注释 + 正则抽取** | 与既有 doc 解析同风格；不新增依赖 |
| 权威版本怎么标 | 只靠页内标记 | **`prototypes/INDEX.md` 表格** | 表格能被既有 `parseDocument` 解析；一处可数、可点名 |
| 几何量放阈值 | 原型里写阈值自证 | **只放观测量名与实测值**（D-10） | 自证不可信；阈值属设计决策 |
| 观测值来源 | 只信 agent 量 | **量原型稿渲染 + `source: "human"` 兜底**（决议 `#8`） | 无法量化者不硬编，但来源必须可追 |
| 裁定怎么进机器链 | 复用 `D-[A-Z]+-\d+` 域段编号 | **`D-\d+` 独立命名空间** | 与设计编号语义不同（裁定 vs 设计章节），且实测现白名单不认 `D-1` |
| 锚点怎么算 | 锚点即 FR 引用 | **锚点单列 `protoRefs`** | 实测 `collectIds('…#FR-4')` 返回 `['FR-4']`，混算会刷出假覆盖度 |
| RTM 兼容策略 | 升位即视为不兼容、旧文件判坏 | **缺节 = `pending`**（+ `#19` 适用性判据） | 存量 66 条不能被判坏；新判据只对新需求生效 |
| INDEX 谁维护 | 登记时自动改写清单 | **agent 手写 + 登记只校验**（决议 `#9`） | 保持"登记不改产物内容"纪律 |

## 10. 技术方案与亮点（serves: FR-2, FR-4, FR-5, FR-11）

- **单一事实源**：产物分类只在 `ArtifactSpec.NAME_TO_KIND`；编号白名单只在 `content-gates.ID_PATTERN`；RTM 结构只在 `rtm/types.ts`——新增维度都在既有单一源上扩项，不另立第二份真相。
- **纯函数优先**：`kindForRelPath` / `collectIds` / `stripPrototypeAnchors`（占位符固定 `<proto-anchor>`，决议 `#6`）/ proto-geometry 抽取均为纯函数，判定可单测、可逆验证（人为改坏必红）。
- **正向扩项、零迁移**：新增 kind、新增 RTM 节与两处**可选**台账字段（`#41` `#36`）都是加性变更；兼容靠 `pending` / `exempted: legacy` 语义而非数据回填。
- **数据可数**：INDEX 的 `authoritative` 恰一条、几何量逐条可数（`name` 块内唯一）、D-x 编号连续——三项都便于机械断言与点名。
- **与常规做法的差异**：常规把"原型"当附件与截图；本模型让它成为**有 kind、有唯一权威版本、有机器可读判据**的结构化产物（可核验指向：§1~§3 的断言与 §7.2 的编号用例）。
