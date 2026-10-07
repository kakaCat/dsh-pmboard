# 前端设计（REQ-261006211623-9dc1）· 看板 DAG 卡「链未生成」红标 <!-- serves: FR-6 -->

> **为什么交这份**：`docs/requirements/REQ-261006211623-9dc1/requirement.md:10` 的 front-matter
> `sides: [frontend, backend]` 命中条件必交设计文档 `frontend.md`
> （`src/application/internal/category-doc-sets.ts:245`）。
> **范围**：本需求**唯一** UI 落点是 FR-6（看板 DAG 卡的 `[链未生成]` 红标判据）；本文件即该落点的 UI 契约。
> **不发明第二份判据**：判据本体与函数签名见 `design/interfaces.md:95-108`，层级与模块地图见
> `design/architecture.md:78-113`；本文件只回答「界面上哪几处出标、出成什么样、怎么不漂移」。
> 本文**不含任务批次与依赖顺序**（那属拆分阶段产物，不进设计文档）。

## 一、范围：这次前端只动三个判据出口 <!-- serves: FR-6 -->

改动面**只有**下面这些，且全部落在既有渲染路径内：

| 改动类型 | 具体内容 | 出处 |
|---|---|---|
| 渲染（判据出口） | 三处既有 span 的出标条件复用同一份 `chainMissing` | `src/client/node-panel.ts:281`、`src/client/views/stage-detail.ts:390`、`src/client/views/panels/dag.ts:195` |
| 标记（落点① 补圆点） | 主视图角标内补一个 `aria-hidden` 圆点，与原型一致（文字本来就有） | `prototypes/dag-chain-missing.html:108`、`:218` |
| 样式（对比度合规） | 两条既有规则改定稿色值（见第六节），第三处汇总条文字色补同源规则 | `src/client/styles/node-panel.ts:276`、`src/client/styles/subtask.ts:29`、`src/client/styles/report.ts:1158` |

**前端不算判据**：`chainMissing` 只在 `src/client/dag/progress-bar.ts:200` 被判一次，前端不自己算第二份；
服务端读数由 `src/application/query/QueryDag.ts:67` 出（数据面字段 `chainMissing`，缺省**不带键**，
`src/application/query/QueryDag.ts:98`），读侧一律只认 `t.chainMissing === true`。

## 二、原型权威锚点与锚点记账（protoRefs） <!-- serves: FR-6 -->

**唯一权威原型**：`prototypes/dag-chain-missing.html#FR-6`
（`docs/requirements/REQ-261006211623-9dc1/prototypes/INDEX.md:8` 是「状态 = authoritative」的**唯一**一行，
被取代时把该行改成 `superseded` 并在「被取代于」列写权威路径）。

| 记账项 | 值 | 出处 |
|---|---|---|
| 权威原型（需求目录相对口径） | `prototypes/dag-chain-missing.html#FR-6` | `prototypes/INDEX.md:8`；锚点区块在页面第 184 行 |
| INDEX 服务条款 | FR-6 | 同上一行 |
| **protoRefs**（锚点单独通道） | `prototypes/dag-chain-missing.html#FR-6` | 本文件；后续 UI 卡的 `prototypeRefs` 与本行**同值** |
| 本文件 serves | FR-6（**不含** `#FR-6`） | H1 与各级标题的 serves 标注 |

**为什么锚点必须单独记账、不能塞进 serves**：`stripPrototypeAnchors`
（`src/application/internal/content-gates.ts:105-107`）会把 `\S+#FR-\d+` 整段抹成 `<proto-anchor>` 再抽编号——
把 `#FR-6` 写进 serves 等于**什么都没声明**，同时又是「贴个锚点就算覆盖」那类假引用的反面教材
（同一处注释 `:99-103` 记了这条实测）。所以：**serves 只写条款号，锚点只走 protoRefs**。

原型页形态：`prototypes/dag-chain-missing.html:185` 的 `#FR-6` 节是「同一张 DAG 卡 × 四种状态 + 一张 solo 小样」，
共 5 张对照卡，页内自检要求标红 3 张 / 不标 2 张（`prototypes/dag-chain-missing.html:432`）。

## 三、状态矩阵：同一张 DAG 卡 × 五种输入 <!-- serves: FR-6 -->

判据输入只差 `status` 与 `stages` 两个字段（图形不变：每个情形都是 1 节点 / 0 边）；
`stages` = 计划里声明的**子卡段**清单，子卡 = `parentId` 指向本卡的卡。

| # | 输入（`status` × `stages` × 子卡） | 是否标红 | 依据（`chainMissing` 判据分支） | 出处（判据行 / 原型情形） |
|---|---|---|---|---|
| 1 | `in_progress` + **未声明** `stages` + 子卡 0 张 | **标红** | ① 有子卡不成立 → ② 显式 solo 不成立（`stages === undefined`）→ ③ `status === 'in_progress'` → `true` | `src/client/dag/progress-bar.ts:204`、`src/application/query/QueryDag.ts:71`；原型情形 1 |
| 2 | `in_progress` + `stages:["dev","review"]` + 子卡 0 张 | **标红** | 走同一支：`in_progress` 那一半**不看** `stages` 写没写 | 同上；原型情形 2 |
| 3 | `done` + **显式非空** `stages` + 子卡 0 张 | **标红** | ④ `status === 'done'` → `Array.isArray(stages) && stages.length > 0` → `true`（本次**新增**的一半） | `src/client/dag/progress-bar.ts:205`、`src/application/query/QueryDag.ts:72`；原型情形 3 |
| 4 | `done` + **未声明** `stages` + 子卡 0 张 | 不标 | ④ 的 `Array.isArray(stages)` 为假 → `false`（存量 done 卡不噪声，D-5） | 同上；原型情形 4 |
| 5 | 任意状态（含 `in_progress`）+ `stages: []`（显式 solo）+ 子卡 0 张 | **永不标** | ② 早退，**排在状态分支之前** → `false` | `src/client/dag/progress-bar.ts:203`、`src/application/query/QueryDag.ts:70`；原型小样 5 |
| 附 | 有子卡（`kids.length > 0`）/ `todo` / `canceled` | 永不标 | ① 有子卡即 `false`；⑤ 其余状态 `false`（`todo` 还没到懒展开，没链是正常态） | `src/client/dag/progress-bar.ts:201`、`:206` |

**判据原文（照抄原型 `prototypes/dag-chain-missing.html:168-176`）**：

```text
chainMissing(card, kids):
  kids.length > 0                → false   有子卡，链在，不标
  stages 是数组且 length === 0    → false   显式 solo（唯一表示「本卡不要子卡」）→ 永不标
  card.status === 'in_progress'  → true    未声明 stages 也算期望有链（默认链按卡 phase / side 推出）
                                          ── 与旧行为逐字一致，不许放松
  card.status === 'done'         → stages 是非空数组 ? true : false
                                          ── 本次新增的一半：计划写了链、卡却走完且链从未生成
                                          ── 未声明 stages 的存量 done 卡不打标（不噪声）
  其它状态（todo / canceled …）    → false   todo 还没到懒展开，没链是正常态
```

**为什么 `done` 只在显式声明非空 `stages` 时才标**（照抄原型 `prototypes/dag-chain-missing.html:178-181`）：
`autoRun=false` 时手动开工**从不展开子卡链**，而 `expandSubtasks`
（`src/application/internal/lazy-expand.ts:123`）是幂等的「只一次机会」——卡走完整个流程到达 `done`、
名下 0 子卡，而计划里白纸黑字写着「这张卡要 dev,review」；那一刻没有任何红灯：人看到「卡做完了」，
真相是「链从没生成过」。反过来，没有「声明过要链」证据的存量 done 卡一律打标会**大面积变噪声**，
噪声一多真问题就看不见了——这条非对称（`in_progress` 防漏报、`done` 防误报）就是 D-6 裁定的内容。
`in_progress` 的默认链由 `resolveSubtaskStages`（`src/application/internal/lazy-expand.ts:39`）按卡 phase / side 推出，
故「没写 `stages`」绝不等于「不要链」。

## 四、三处渲染落点（同一条判据的三个出口） <!-- serves: FR-6 -->

| 落点 | 选择器（实现事实） | 实现出处 | 标红时（原型口径） | 不标时 |
|---|---|---|---|---|
| ① 卡片角标（**主视图**，泳道卡） | `span.dsh-pm-np-chain-missing` | `src/client/node-panel.ts:281-282`（卡容器 `button.dsh-pm-np-card`）；样式 `src/client/styles/node-panel.ts:276` | 卡内追加**圆点 + 文案「链未生成」**，`title` 写原因：「该卡应落子卡链，链尚未生成——待再生成补链」 | 该 `span` 不渲染（不留空壳）：卡片只剩 id + 标题，与 solo / 存量卡外观一致 |
| ② 节点面板任务卡 chip（拆分 / 实施节点） | `span.dsh-pm-chain-missing` | `src/client/views/stage-detail.ts:390-391`；样式 `src/client/styles/subtask.ts:29` | 任务标题后挂 chip「链未生成」；**缺链标优先于**灰色 手动 chip（`src/client/views/stage-detail.ts:392` 三元分支的顺序即该优先级） | 回落既有 手动 chip（仅 0 子卡的存量卡），并显示「子卡 0/0」 |
| ③ 阶段明细 DAG 汇总条 | `[data-dag-chain-missing]` | 计数 `src/client/views/panels/dag.ts:192-195`、出格 `:211-212`；数据面 `src/application/query/QueryDag.ts:98`；样式作用域 `src/client/styles/report.ts:1158` | 汇总条多一格「子卡链未生成 N 张」（N = 本页命中该判据的卡数） | 该格整体不渲染；汇总条只剩 层级 / 卡片 / 依赖边 / 最大并行度 / 分层 / 状态 |

**主视图为什么是角标**：卡底**不再**画子卡链进度（4 段色条 + n/N，2026-09-29 用户裁定 E，
`src/client/node-panel.ts:279-280`），所以角标是「标 vs 不标」在一屏内唯一一眼可辨的差；
另两处是同一条判据的另外两个出口。

**三处必须同进同退**：判据在两份实现里逐字同源（见第五节）。漂移的症状是
「看板标了链未生成、详情页没标」——一处标、一处不标是**最费人的不一致**，比两处都不标更坏。

## 五、判据同源与漂移防线 <!-- serves: FR-6 -->

| 同源项 | 实现 | 为什么不能合成一处 | 机械检查 |
|---|---|---|---|
| `chainMissing` | `src/client/dag/progress-bar.ts:200-207` | 判据本来在 client；服务端要做同一读数，唯一路径是重写一份 | 三份测试分别覆盖：`tests/card-layer.test.ts:135`（主视图四态）、`tests/query-report.test.ts:893`（服务端读数四态）、`tests/dag-panel.test.ts:129`（汇总条计数） |
| `chainMissingOf` | `src/application/query/QueryDag.ts:67-74` | application 层**禁止** import client（含 `dag/progress-bar.ts`），`tests/layer-boundary.test.ts:54-59` 的 `LAYER_RULES.application.forbidden` 机械检查；故只能逐字重写 | 同上 |

**改一处必须改两处**：两份实现各自在注释里点名对方与漂移症状
（`src/client/dag/progress-bar.ts:196-198`、`src/application/query/QueryDag.ts:62-65`），
新的状态轴出现时（例如将来加 `blocked` 之类）必须回来同时改这两处——这是本次唯一可接受的兜底形式。

**根治方案本次不做**：把判据搬进 domain 纯函数、两处 import 同一份，才能真正消灭「两份真相」；
但那是跨层改动，会与并发窗口在制的 workspace-root 重构冲突，`design/architecture.md` 已记「本次不做」。

## 六、无障碍与视觉纪律 <!-- serves: FR-6 -->

原型已把这些落到页内（`prototypes/dag-chain-missing.html:417-427`），实现侧照抄：

| # | 纪律 | 具体要求 | 出处 |
|---|---|---|---|
| 1 | **红标不能只靠颜色** | 三处都必须带文字「链未生成」；颜色只是加强，不是唯一载体 | `src/client/node-panel.ts:282`、`src/client/views/stage-detail.ts:391`、`src/client/views/panels/dag.ts:212`；原型 `:423-425` |
| 2 | 落点① 圆点 + 文字 | 角标 = 圆点（`aria-hidden="true"`）+ 文字；圆点不参与可访问名 | 原型 `:108`、`:218` |
| 3 | 对比度 ≥ 4.5:1 | **定稿色值**：文字 `#991b1b` on `rgba(220,38,38,.10)` ≈ 6:1（原型 `:426` 已给该读数）。**现状不达标**：`#a86a00` on `rgba(240,160,32,.16)`（`src/client/styles/node-panel.ts:276`、`src/client/styles/subtask.ts:29`）按 WCAG 2.x 相对亮度公式计算 ≈ 3.9:1 < 4.5:1 —— 本次按定稿色值改，三处（含汇总条 `src/client/styles/report.ts:1158` 作用域下的一格）用同一个色值 | 原型 `:418-420`（把定稿权交给本文件） |
| 4 | 可访问名含状态与原因 | 卡本身是 `button`；可访问名里要含状态与原因（原型 `aria-label` 写「标注：链未生成」，`:215`）；刷新后要播报就**更新按钮的可访问名**，**不要**在按钮里再塞 live region（按钮内容对辅助技术是展平的） | 原型 `:424-425` |
| 5 | 色值唯一出处 | 本文件是这三处色值的唯一出处；不新增色令牌、不改其它面板的配色 | 原型 `:418-420` |
| 6 | 动效 | 红标不引入动画；`prefers-reduced-motion` 下与现状一致（原型 `:136`） | 原型 `:136` |

## 七、裁定依据（D-x） <!-- serves: FR-6 -->

| 裁定 | 内容（原话摘要） | 对本文件的约束 |
|---|---|---|
| **D-6** | 打回 `chainMissing` 的一处静默放松：`in_progress` 且未声明 `stages` 的卡原本会标红，新写法会放过 → 改回**分状态不对称**判据 | 状态矩阵第 1 行**必须标红**；防腐烂回归凭据 = `tests/card-layer.test.ts:135` 的用例；实现期不许把第 1 行并进第 3 行的窄口径 |
| **D-5** | 存量需求不追溯、不改写 | 第 4 行（存量 `done` 未声明）**必须不标**；本次不改任何存量卡与存量文档，只改三处判据出口 |
| D-2 | 立项并落 `docs/requirements/REQ-261006211623-9dc1/` | 本文件落 `design/frontend.md`（需求目录相对口径） |
| D-1 | 按底稿开工，四面缺口一次做完 | 三处出口**一次改齐**，不允许只改主视图 |

裁定原文见 `docs/requirements/REQ-261006211623-9dc1/requirement.md:283-288`（D-1 … D-6 表）。

## 八、不做的事（边界） <!-- serves: FR-6 -->

- **不加新面板 / 新路由 / 新 tab / 新开关**：只改既有三处判据出口（`requirement.md:269-270`）。
- **不改卡底子卡链进度条**（2026-09-29 裁定 E 维持，`src/client/node-panel.ts:279-280`）。
- **不把判据搬进 domain**（根治漂移的正解，见第五节；与并发窗口在制重构冲突）。
- **不为红标加 toast / 通知 / 声音 / 角标计数**：它是卡面读数，不是告警系统。
- **不给 `todo` / `canceled` 打标**（判据本身就没这一支，加了就是第二份判据）。
- **不改 `chainMissing` 字段形状**：缺省**不带键**，读侧只认 `=== true`（`design/interfaces.md:95-108`）。
- **不做逐字实现比对**：本文件与原型只判「哪个状态出标、出在哪三处」，不判实现与设计逐字一致。
