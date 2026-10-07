# 原型清单（REQ-261006201920-2adc）· 2026-10-06

> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，
> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/verify-disposition.html | authoritative | FR-3, FR-4 | |
| prototypes/detail.html | superseded | FR-1 | prototypes/verify-disposition.html |

## 本页为什么是唯一权威（verify-disposition.html）

- 画的是**验收单裁决控件（verify panel）**的交互原型，覆盖本需求有界面表现的两件事：
  ③ 裁决结果必须可复核（未复核落成 / needsHuman 无事实文本拒收 / 覆盖 agent 原文必填变更理由 + 原实测结果保留）、
  ④ 系统缺口项通过必须写处置（`补了 X` / `确认无需，因为 Y` 模板校验、处置为空 → 归档被拦可见）。
- 页内 `<!-- proto-geometry … -->` 恰一块，只放**结构性计数**（`verifyItems` / `legalDispositionSamples` /
  `presetRejectionSites`）；本页 **未启动 server、未开浏览器**，因此**没有 px 观测量**，`at.width=1280`
  仅作口径必填字段（这三个计数与窗口宽无关）。若设计或门禁确需像素观测量，须由能起真实渲染器的一方补测后替换。
- 预置态六种在无 JS 时也完整可见；内联 JS 只在交互后接管该行（徽标重算 + 字段旁实时拒收/提示 + 归档门重算）。
  执行校验：以最小 DOM shim 真正跑过页内脚本，27 条断言全绿（预置态 9 行、首屏计票 [9,2,3,1,3,0]、
  归档门 5 项拦住，以及「补了 X / 确认无需，因为 Y → 通过」「无锚点 → 未复核」「needsHuman「通过」两字 → 拒收」
  「覆盖原文无理由 → 拒收、补理由 → 通过」「处置清空 → 归档被拦」等路径）。

## 待办 / 口径提醒（交给后续维护者）

1. **服务条款的 FR 号是暂定映射**：本需求的功能点清单在 requirement.md 里，落笔时按
   「③ 裁决结果必须可复核 → FR-3、④ 系统缺口项通过必须写处置 → FR-4」对应。
   requirement.md 定稿后若 FR 编号不同，请同步改本表「服务条款」列与页内 `<section id="FR-N">`（两处必须一致，
   否则锚点门报 `prototype_anchor_missing`）。
2. **别把文档引用指回旧稿**：`prototypes/detail.html` 已标 superseded（原为骨架样例，FR-1 是占位符、无真实内容）。
   requirement.md / design/frontend.md 里若出现 `prototypes/detail.html`，版本门会拒（引用不得指向被取代版本），
   请改为 `prototypes/verify-disposition.html`。本目录内 `detail.html` 文件**保留不删**（旧稿留档纪律）。
3. detail.html 自身也留有一处「缺 proto-geometry / 缺 FR 锚点」的骨架注释；它是 superseded 稿，不参与锚点门
   （锚点门只看唯一权威那一份）。
