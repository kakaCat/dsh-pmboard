# 原型对照与差异清单 · REQ-261006092213-4f5b（t5 · #FR-3 / #FR-4 / #FR-5）

> 权威原型：`prototypes/verification-result.html`（`prototypes/INDEX.md` 里唯一 `authoritative`）。
> 本文是 t5 卡验收项「与原型逐屏对照并写明差异」的落盘件（复核 S4 指出此前只有"已记录"的自述、没有清单）。
> 实测图：`evidence/verification-sheet-1280.png`（1280 宽 × 2 倍，看板逐项行四种形态一屏）。

## 一、逐屏对照

| 锚点 | 原型要求 | 实现落点 | 结论 |
|---|---|---|---|
| `#FR-3` 会话弹框问数 | 有 `result` 的项只问 1 问；`needsHuman` 项保留第 2 问（题干含理由） | `AcceptSheet.ts` 用例层：`needsResultInput(it)` 决定问数，`resultOf` 供零输入通过 | 一致（弹框由**宿主原生**渲染，本仓只能决定问数与题干；问数由 `tests/accept-sheet-zero-input.test.ts` 断言：`asked` 里没有 `<id>#result`） |
| `#FR-4` 看板逐项行 | 多一行「实际结果（agent 实测 / 人工填写）」+ 输入框预填 + 通过不强制手打 + 三态来源 | `stage-panel.ts` `renderVerificationSheet`：`.dsh-pm-vitem-result` + `data-result-src="agent\|human\|none"` + `is-prefilled` | 一致（差异见 §二 1/3/4/5） |
| `#FR-4` 详情页核验表 | 七列表格：标准 / 实际结果 / 来源 / 需人工 / 证据 / 意见 / 裁决 | `views/panels/docs.ts` `verifyRow`（列宽 19/12/8/8/30/17/6%），`sourceCell` 三态 | 一致（本次**未改列**，只对齐来源文案） |
| `#FR-5` needsHuman 显式单列 | 旗标 + 理由；**不预填、通过必填** | `stage-panel.ts`：`.dsh-pm-flag.verify-pending` 旗标带理由 + `data-needs-human="1"` + 专用 placeholder；`AcceptanceSheetSpec.applyVerdicts` 对 needsHuman 项不吃 `result` 兜底 | 一致（差异见 §二 2） |

## 二、差异清单（原型 ↔ 实现，逐条写明理由）

1. **属性名：`data-result-src`（实现，遵 `design/frontend.md` 判据）vs `data-result-source`（原型 :189/208/242）。**
   两者语义相同。以**设计判据**为准（本卡验收项逐字要求 `data-result-src`），原型未同步；
   记录在此，供后续按原型 grep 的读者知晓。
2. **需人工旗标的位置：实现把旗标独立成 `.dsh-pm-vitem-human` 行（排在结果行之后）；原型把它放在 `.dsh-pm-vitem-head` 内紧挨来源标签。**
   依据 `design/frontend.md`「旗标与结果分行」的取舍：两者性质不同（"只能人看" vs "有实测结果"）。
   旗标本体**复用既有类名** `.dsh-pm-flag.verify-pending`（base.ts 已有），未新造视觉体系；
   外层 `div` 只是排版容器。
3. **预填口径：`value` 用台账 `item.result` **原文**（≤500 字全量）；展示行截断到 200 字。**
   独立复核（B1）实测过反例：`value` 也截断时，人一个字不改地提交会把 500 字原文改成 201 字、
   并把来源误标成 `human`。故 `value` 必须逐字节等于台账值，展示行才可以截断。
4. **两屏截断口径暂不统一**：看板结果行截 200 字、需人工理由截 120 字；详情页核验表全文铺开。
   记录为已知差异（截断属展示纪律，非契约字段）；后续若要求一致，需在 `design/frontend.md` 写死。
   ⚠️ **读 `design/frontend.md` 的 `prefilledOpinionRatio = 1` 时注意分母**：本卡按 FR-5 明确让
   「`needsHuman` 且 `result` 非空」的项**故意不预填**，故该几何量的分母应读作
   「**有结果且非 `needsHuman`** 的项」；否则自动量几何会把这条刻意修复误判成回归。
   （未改设计文档——它是已确认产物，改它要走重确认门；此处登记口径读法。）
5. **令牌：结果行状态色用字面值 `#17a2b8` / `#0f6674`（与原型同款），未引 `--pm-c-accepting`。**
   原型的 `.dsh-pm-vitem-result` 同样硬编码；看板页不在 `[data-report-shell]` 作用域内，
   `report.ts` 里的 `--pm-agent` / `--pm-mono` 取不到，故用同值字面色 + 既有令牌（`--pm-line` /
   `--dsw-text-secondary` / `--dsw-accent`）拼装；**未另起配色体系**（`client-styles-ownership` 用例在册）。
6. **`views/verification.ts` 的核验块**多补了「未标注来源」三态文案（原实现缺省时留空，与
   `design/frontend.md`「来源三态」不符）——本次按设计补齐。

## 三、本次由复核发现并已修的点（可复核）

| 编号 | 问题 | 修法 | 用例 |
|---|---|---|---|
| B1 | 预填值被截到 200 字 → 原样提交静默篡改 `result` 并误标 `human` | `value` 用原文（展示行仍截断） | `tests/stage-panel.test.ts`「超长 result：展示行可截断，但预填 value 必须与台账 result 逐字节相同」 |
| M1 | `needsHuman` 行被预填 → "唯一要人填"的项可零输入通过，且与弹框通道口径相反 | 前端不预填 + 专用 placeholder；域层 `applyVerdicts` 对该类项不吃 `result` 兜底（两通道同口径） | `tests/stage-panel.test.ts`「needsHuman 行不预填 + 带 data-needs-human」；`tests/domain/req-b918-gates.test.ts`「needsHuman 项不吃 result 兜底」 |
| S1 | 少 `data-needs-human="1"` 结构锚点 | 行上补该属性（与详情页 `verifyRow` 同名） | 同上 |
| S2 | needsHuman 行 placeholder 教人留空，与原型逐字不符 | 改用原型逐字：「未自动验证：请写你看到的界面事实（通过必填）」 | 同上 |
| S3 | 只勾「不通过」不动预填框 → 把 agent 通过原文当不通过理由 | 前端把「与预填值相同」判为没写意见 | `src/client/board-mount.ts` 的 `untouched` 判定（源码级断言在 `tests/stage-panel.test.ts`） |
| S5 | 出图脚本白图判据失效（纯白页 15568 B ≥ 阈值） | 落图前先断言渲染串含四种形态 + 字节下限提到 60 KB | `scripts/req-verification-sheet-shot.mts`（白图实测 15568 B，交付图 235 KB） |
