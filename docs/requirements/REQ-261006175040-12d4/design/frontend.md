<!-- serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-7 -->

# 前端设计（REQ-261006175040-12d4 看板卡面门读数修复）

> 视觉契约只有一个：**卡面拿到真实门读数后长什么样**。本次**不重新设计卡面**——布局、配色、字阶、
> 圆角、间距一律逐字沿用既有实现（`src/client/styles/board.ts` 等），改动只发生在**读数来源**与
> 「产物 N/M → 门 c/总数」这一行文案上。

## 1. 权威原型与锚点 `serves: FR-1, FR-3, FR-4, FR-5, FR-6`

- 权威路径：`prototypes/card-gates.html`（`prototypes/INDEX.md` 唯一 authoritative；同目录的占位骨架
  已在 INDEX 标 `superseded`，**不得作为视觉依据**）。
- 需求侧裁定（原话见 `requirement.md` 的 D-x 表）：D-1（确认缺陷）、D-2（服务端算、客户端只渲染）、
  D-3（派生行改「门 已确认/总数」）、D-4（交原型）、D-5（修复范围含卡面确认入口）、D-6（读不到 ≠ 缺失）。

| 锚点（走 protoRefs 单独记账，**不计入 serves**） | 覆盖内容 |
|---|---|
| `prototypes/card-gates.html#FR-1` | B 区三态卡面（需求分析期 / 设计期成组确认 / 实施期）的 chips 三态与排布 |
| `prototypes/card-gates.html#FR-3` | 派生行 `门 c/总数`（含 `门 0/4`、`门 1/4`、`门 3/4` 三档） |
| `prototypes/card-gates.html#FR-4` | 「确认产物」按钮在场（含 `确认产物（全部 6 份）`）与刻意缺席 |
| `prototypes/card-gates.html#FR-5` | C 区计划 / 验收 chip 四枚（计划待批 · 计划已批 · 待验收材料 · 待人工审核） |
| `prototypes/card-gates.html#FR-6` | D 区读数不可得降级态（整块不渲染） |

原型分区与用途：A 区＝缺陷现状对照（四门全红 + `产物 0/6` + 无按钮）；B 区＝修复后三态；
C 区＝计划/验收 chip 演示；D 区＝降级态；E 区＝页脚声明（只表达门读数区域，未做重新设计）。

## 2. 门读数区域的渲染规格 `serves: FR-1, FR-3`

DOM 顺序沿用 `renderReqCard` 既有顺序：id 行 → 标题 → 进度行 → 子卡进度行 → **chips 行** → **派生行** →
时间行 → 窗口/会话 chip → 确认按钮 → 自动链控件 → 操作行。本次不改顺序、不加新容器。

| 读数 | 类名（逐字沿用） | 文案 | 交互 |
|---|---|---|---|
| `confirmed` | `dsh-pm-artifact-chip confirmed` | `✓ <中文名>`（如 `✓ 需求文档`） | 无（已完成，不做假入口） |
| `pending` | `dsh-pm-artifact-chip pending` | `⏳ <中文名>` | **`<button>`**，带 `data-action="confirm-artifact"` / `data-id` / `data-kind`，点击落章 |
| `missing` | `dsh-pm-artifact-chip missing` | `✗ <中文名>` | 无 |

- 中文名唯一来源：`src/shared/artifact-labels.ts` 的 `artifactKindLabel`（**不新建本地映射表**）。
- chips 的顺序与条数**完全照 `gates` 数组**（顺序 = 分类生效门顺序），客户端不排序、不筛选、不补默认值。
- 派生行（`dsh-pm-artifact-derived`）只输出一处读数：`门 <confirmed 数>/<gates.length>`。
  既有第二段「N 门待确认」**删除**（与 ⏳ chips 重复；实际同时最多一个门待确认）。
  旧文案 `产物 N/M` 在卡面渲染输出与客户端源码中**必须消失**（文档里作为缺陷描述提及不计）。

## 3. 「确认产物」按钮 `serves: FR-4`

| 条件（只读读数） | 渲染 |
|---|---|
| 当前门读数 `status === 'pending'` 且 `kind !== 'design'` | `<button class="dsh-pm-btn sm primary dsh-pm-confirm-artifact" data-action="confirm-artifact" data-id=… data-kind=…>确认产物</button>` |
| 当前门读数 `status === 'pending'` 且 `kind === 'design'` | 同上，文案 `确认产物（全部 <count> 份）`（`count` 来自读数，不再数 `req.artifacts`） |
| 读数 `missing` / `confirmed`，或 `gates` 缺省 | **不渲染**（不给点了必被代码级拒绝的假按钮） |

当前门仍是既有的纯函数 `currentGateKind(req)`（只用 `category` + `status`，两个字段摘要里都有）——
本次**不改**它的算法，只把「门里有没有产物」的判据从 `req.artifacts` 换成读数。

## 4. 计划 / 验收 / 归档 chip `serves: FR-5`

| chip | 触发条件 | 文案（类名沿用） |
|---|---|---|
| 计划 | `planState === 'pending'` / `'approved'` / `'rejected'` | `计划待批`（`plan-pending`）/ `计划已批`（`plan-ok`）/ `计划被退`（`plan-rejected`） |
| 验收 | `status === 'accepting'` 且 verification 门读数 `missing` | `待验收材料`（`verify-pending`） |
| 验收 | `status === 'accepting'` 且该门 `pending` / `confirmed` | `待人工审核`（`verify-pending`） |
| 归档 | `status === 'done'` 且 `archivePrepared === true` | `待归档`（`archive-pending`） |
| 归档 | `status === 'done'` 且 `archivePrepared === false` | `待归档材料`（`archive-pending`） |
| 列表行 | `archivePrepared === false` | `归档材料待补`（`dsh-pm-chip is-warn`），判据由 `closingGapOf` 换成读数 |

所有 `title` 提示文案沿用既有措辞（描述该状态的含义），不新增术语。

## 5. 降级渲染（读数不可得） `serves: FR-6`

| 缺失的键 | 卡面表现 |
|---|---|
| `gates` 缺省 | chips 行、派生行、确认按钮**都不渲染**；其余卡面（标题/进度/时间/窗口/操作行）照旧 |
| `planState` 缺省 | 不渲染计划 chip（该 chip 本就无「缺失」态） |
| `archivePrepared` 缺省 | 不渲染归档 chip / 列表行标记 |

**硬约束**：`gates` 缺省时输出里**不得**出现 `✗`、`产物 0/6`、`门 0/N`——「读不到」与「真缺失」在视觉上必须可区分
（这是本次事故的教训，D-6）。跨缝用例对这两种形态分别断言。

## 6. 不动的视觉与延后项 `serves: FR-6`

- 三态 chip 的颜色、字号（10px）、圆角、间距、行距**零变化**：本次只让它们**说真话**。
- 实测（WCAG 相对亮度公式，10px 正文）：绿 2.76:1 / 橙 3.39:1 / 红 3.81:1，**均低于 4.5:1**。
  三态另有 ✓ / ⏳ / ✗ 字形与中文标签，**不靠颜色单独传达信息**（可达性未失效）。
  配色调整属新的视觉语言决策，**另立项**——本次改它会让「数据来源修复」同时承担两件事且无法分别回滚。
- 卡片布局、泳道宽度、甘特/DAG/详情 Tab 一律不动。

## 7. 原型观测量与阈值边界 `serves: FR-7`

- 权威原型内嵌**恰好一块** `proto-geometry` 观测注释（15 条观测量：卡片宽度/内边距/圆角/行距、
  chips 行间距与字号、派生行字号与上间距、确认按钮数量、三态对比度）。口径已在原型注释里声明：
  `count` 类 = 对 markup 计数；`px` 类 = 所抄 CSS 的声明值；`ratio` 类 = 按 WCAG 公式算出的对比度。
  **本机未跑浏览器渲染**，故 `px` 无 `getBoundingClientRect` 实测值——这是如实声明，不是省略。
- 阈值（例如「对比度必须 ≥ 4.5:1」）属**设计决策**，不写进原型；本设计的阈值立场是：
  **本次不改配色，故不设对比度阈值**；若将来立配色需求，阈值写在那份需求的设计里。

## 8. 实现对照与防漂移 `serves: FR-1, FR-7`

| 原型区块 | 实现落点 | 锁它的测试 |
|---|---|---|
| A（缺陷现状） | 改动前行为（`git stash` 可复现） | `tests/card-face-summary-shape.test.ts` 改动前必红 |
| B（三态 + 派生行 + 确认按钮） | `renderArtifactChips` / `renderArtifactDerived` / `renderConfirmButton` | `tests/card-face.test.ts` + 跨缝用例 |
| C（计划 / 验收 chip） | `planChip` / `verifyChip`（`views/verification.ts`） | `tests/card-face.test.ts` |
| D（降级态） | `gates` 缺省 ⇒ 三块都不渲染 | 跨缝用例第二组断言 |
| 列表行标记 | `renderListCard`（`archivePrepared`） | `tests/card-face.test.ts`（列表视图分支） |
| 出图对照 | — | `npx tsx scripts/card-gates-ui-shot.mts`（E2E 行，PNG 落 `docs/requirements/REQ-261006175040-12d4/evidence/`） |
