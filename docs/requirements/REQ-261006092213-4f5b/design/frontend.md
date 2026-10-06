# 前端设计 · REQ-261006092213-4f5b <!-- serves: FR-3, FR-4, FR-5 -->

> 两屏：看板逐项验收行、详情页核验表。会话弹框是**宿主原生**通道，不在本仓 HTML 内，
> 本仓只能决定"问几问、题干写什么"（口径见 interfaces.md）。

## 原型页面 <!-- serves: FR-3, FR-4, FR-5 -->

- **唯一权威原型**：`prototypes/verification-result.html`（`prototypes/INDEX.md` 里唯一一条
  `authoritative`；骨架样板已标 `superseded`）。
- 锚点对照：`prototypes/verification-result.html#FR-3`（弹框问数对照）、
  `prototypes/verification-result.html#FR-4`（看板逐项行 + 详情页核验表）、
  `prototypes/verification-result.html#FR-5`（needsHuman 显式单列）。
- 锚点是**定位符**，不计入 serves（走 `protoRefs` 记账）。
- 关联裁定：D-5（零输入通过）、D-6（含前端两屏 + 原型必交）、D-7（硬门，界面要显示"待交代"状态）。

## 看板逐项验收行 <!-- serves: FR-4, FR-5 -->

改 `src/client/stage-panel.ts` 的 `renderVerificationSheet`（现状只取
`id / source / criterion / status / opinion`，`result` 与 `needsHuman` **完全没用上**）。

每行结构（沿用既有类名，不新增视觉体系）：

| 区域 | 内容 | 数据来源 |
|---|---|---|
| 徽标 | 既有 `ITEM_STATUS_BADGE`（新增 `unverified` 文案已在 `PANEL` 侧存在） | `item.status` |
| 来源标签 | 既有 `verificationSourceOf`（需求级 / 任务 id / 原型对照 / 裁定对照） | `item.source` |
| 判据文本 | `truncate(item.criterion, 200)` | `item.criterion` |
| **实际结果行（新）** | `实际结果（agent 实测）：<result>` 或 `人工填写：<result>`；无结果时显示 `尚无实测结果` | `item.result` + `item.resultSource` |
| **需人工旗标（新）** | `需人工确认：<humanReason>`（复用 `.dsh-pm-flag.verify-pending`） | `item.needsHuman` + `humanReason` |
| 裁决控件 | 既有 radio 通过/不通过 + 输入框；**输入框预填 `item.result`** | 见下节状态规则 |

## 详情页核验表 <!-- serves: FR-4 -->

`src/client/views/verification.ts` 的 `renderSheetItems` 与 `src/client/views/panels/docs.ts`
的 `verifyRow` **已能显示** `result` 与来源（`agent 实测（agent）` / `人工填写（human）`，
无来源标 `未标注来源`）。本次只需保证：

- 来源三态与后端写入规则一致（`agent` / `human` / `undefined`）。
- `unverified` 的文案在核验表里可读（现状 `未裁决`，保持）。
- 不再出现"实际结果列显示 opinion 而非 result"的错位（与 backend.md 的 FR-7 改动对齐）。

## 会话弹框（宿主原生） <!-- serves: FR-3 -->

- 有结果的项：只问 1 问（通过 / 改进 / 其他），**不再出现"实际结果"第 2 问**。
- `needsHuman` 项：保留第 2 问，题干含理由与已有证据。
- 这一屏**不能由本仓样式控制**，故原型里只画"问数对照"（`#FR-3`），实现落在
  `AcceptSheet.ts` 的 `needsResultInput` 分支（既有机制，本需求只让它生效）。

## 交互与状态规则 <!-- serves: FR-4 -->

1. **预填**：输入框 `value = item.result ?? ''`；placeholder 写清
   「已预填 agent 实测结果；改动即记为人工填写」。
2. **零输入通过**：勾「通过」+ 留空 → 前端**不再拦截**（现状 `board-mount.ts` 的
   `missingOpinion` 分支删除），服务端用 `item.result` 兜底。
3. **改动即 human**：提交时若输入值 ≠ `item.result` → 服务端写
   `result = opinion`、`resultSource = 'human'`。
4. **加载中/失败**：裁决提交失败时**保留用户的输入与勾选**（不清空表单），并把服务端错误原文显示出来——
   现状"把 400 甩给用户"不可接受；错误文案由服务端三段式给出。

## 样式与令牌 <!-- serves: FR-4 -->

- 复用 `src/client/styles/board.ts` 既有类：`.dsh-pm-vitem` / `-badge` / `-src` / `-actions` / `-opinion`、
  `.dsh-pm-flag.verify-pending`、`.dsh-pm-src[data-source]`。
- 新增少量样式只允许**扩展**（结果行、旗标排版），不得另起一套配色；状态色取 `base.ts` 既有令牌。
- 列宽沿用核验表既有比例（19/12/8/8/30/17/6%），不因新增列而重排。

## 关键决策与取舍 <!-- serves: FR-4, FR-5 -->

| 决策 | 取舍 |
|---|---|
| 预填而非只读 | 预填让人能就地修正；只读会让人"想改也没地方改"，反而退回手抄 |
| 前端不判必填 | 判定权归服务端（一处口径）；前端只表达"必填与否"的提示，不再自行 400 |
| 旗标与结果分行 | 不把 `needsHuman` 塞进结果行：两者是不同性质的信息（"有结果" vs "只能人看"） |
| 不新增面板 | 沿用验收面板与核验表；不新造页面（边界：不扩范围） |

## 判据（可失败） <!-- serves: FR-4, FR-5 -->

- **结构断言**：逐项行存在 `data-result-src="agent|human|none"` 与预填值等于台账 `result`
  （用字符串断言，不靠肉眼）。
- **行为断言**：留空点通过 → 请求里 `opinion` 为空且服务端返回 success（不 400）。
- **几何量**：`prefilledOpinionRatio = 1`（有结果的项，预填值非空比例）与
  `verifyTableColumnCount = 7`（列数不因改动漂移）——观测量已随原型登记（`proto-geometry`）。
- **令牌断言**：`needsHuman` 旗标必须使用 `.dsh-pm-flag.verify-pending` 类（不新造类名）。
