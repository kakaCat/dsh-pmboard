# 自评审报告（REQ-261006175040-12d4）

> 评审人：实施窗口本人（agent）· 评审对象：本次 12 个源文件改动 + 7 个测试文件 + 1 个出图脚本。
> 纪律：本报告**不复述"应该没问题"**，只写"查了什么、看到什么、哪里不达标"。

## 1. 改动面与设计的一致性

| 设计条款 | 落地情况 | 证据 |
|---|---|---|
| 门判定下沉 domain 纯函数（`domain/artifact/GateReadings.ts`） | ✅ 三个纯函数、**零 import**（分层纪律：domain 不 import shared） | `grep -n "^import" src/domain/artifact/GateReadings.ts` 为空；14 条单测 |
| 装配收成单点（`shared/board-summary.ts` 的 `boardSummaryOf`） | ✅ 另有写侧入口 `boardSummaryOfAuthoritative`（写侧记录即权威，补 `artifacts: []`）——设计里未点名，属实施期发现的必要补充 | `board-summary.ts` 头注写明两种入口的差别与后果 |
| 摘要补三个有界键 + `SUMMARY_KEYS` 同步 | ✅ `gates`（≤5 项 × 3 标量）/ `planState` / `archivePrepared` | `domain-summary.test.ts` 键集断言 |
| 客户端只渲染、删除 `computeGateStatuses` | ✅ 删除；新增读侧 helper `client/render/gate-view.ts` | `grep -c computeGateStatuses src/client` = 0 |
| 派生行只留 `门 c/总数` | ✅ 旧两段（`产物 N/M`、`N 门待确认`）删除 | `card-face.test.ts` 断言 `门 3/4` 且未出现旧口径 |
| 读数不可得 ⇒ 不下发键、不渲染 | ✅ 三处缺省语义写死并有断言 | 跨缝用例 + 逆验证② |

## 2. 对抗式自查（不是"再跑一遍测试"）

| 反例 | 结果 |
|---|---|
| 把读侧改回"就地读 `req.artifacts`"（旧实现形态） | 跨缝用例 **4/4 红**（逆验证①） |
| 把"读数缺省"当成 `missing`（渲染成红 ✗） | 跨缝用例 **2/4 红**（逆验证②） |
| 让一条实现漏装配读数 | 同形断言 **2 条红**（逆验证③） |
| `archivePreparedOf` 与 `closingGapOf` 是否真同源 | 48 组穷举对照**零不一致** |
| 旧服务端形态（摘要无读数）会不会谎报 | 真实 60 条载荷渲染：✗ / 产物 0/6 / 门 0/4 均 **0 处** |

## 3. 施工期事故（如实记录，均已修正并复验）

1. **t6 一次区间替换误删三个函数**（`renderReqCard` / `cardActions` / `renderCardTime`）——
   测试立刻报 `renderReqCard is not a function`；按原文完整恢复，21 条用例复绿。
   教训：对"从 A 标记替换到 B 标记"的批量替换，必须先打印区间端点确认范围。
2. **t7 内容断言打在整页 HTML 上**（把 `<style>` 里的选择器名当成"渲染了该块"），
   degraded 态假红一次 → 收紧为只断言卡片 markup。
3. **t4 漏扫一处实现**：`tests/reqboard/store-contract.test.ts` 内自带的假 SQL 替身仍在直调 `summarize`
   ——被 t5 的同形断言当场抓出（这正是"四实现必须同形"的价值）。
4. **t6 改契约后漏改一处旧用例**：`tests/stage-panel.test.ts` 的 `renderConfirmButton` 用例仍用全量记录夹具
   ——被 `pnpm baseline:check`（C-14）抓出，已按新契约重写（61 passed）。

## 4. 不达标项与遗留（必须显式列出）

| 项 | 状态 | 说明 |
|---|---|---|
| `pnpm typecheck` 退出码 0 | ❌ 未达标 | 剩 1 条 `src/client/views/panels/verify.ts(36,41) TS2307`——引 vendor 的相对深度少一层（应 4 层 `../`），属 **REQ-261006130057-7a43 在飞改动**，本窗口不越界修改 |
| `pnpm baseline:check` 失败集合差为空 | ❌ 未达标 | 新增失败清单里**不含本需求任何测试文件**（已逐条归属：report-tabs / typecheck / tools-dispatch / kb-generate / live-tasks-single-source / prompt-tiers / settings-init 顺序相关），全部指向其他需求在飞的改动；按纪律**不 refresh 基线**（refresh 会把别人的红一起吞掉） |
| 三态 chip 配色对比度（绿 2.76 / 橙 3.39 / 红 3.81 : 1，低于 4.5:1） | 未做（**已裁定另立项**） | 本次只保证"颜色含义与台账一致"；三态另有 ✓/⏳/✗ 字形与中文标签，不靠颜色单独传达信息 |
| SQLite 的 parts 解析失败语义 | 已知差异 | SQLite 侧 parts 损坏会被忽略并按"缺失"处理（与分片实现的"不可得"语义不同）；已在 `design/backend.md` §3 与代码注释写明，未改（改它要动 SQLite 读侧容错，属另一件事） |

## 5. 结论

本次改动的**验收面（FR-1~FR-7）均有可跑证据**；不达标项**全部为外部原因**且已定位到具体文件与需求。
无"以降低标准换绿"的处置（未 refresh 基线、未放宽断言、未删除任何对本次改动不利的用例）。
