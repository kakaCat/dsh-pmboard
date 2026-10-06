# 原型清单（REQ-261006175040-12d4）· 2026-10-06

> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，
> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/card-gates.html | authoritative | FR-1 · FR-3 · FR-4 · FR-5 · FR-6 | |
| prototypes/detail.html | superseded | FR-1 | prototypes/card-gates.html |

## card-gates.html 表达什么（唯一 authoritative）

`prototypes/card-gates.html` 是本需求**唯一 authoritative** 的原型（需求说明与验收标准 7 都点名它）。
它表达看板泳道卡面（`.dsh-pm-card`）**产物门读数区域**的视觉契约，五块内容：

- **A · 修复前对照**：四门全红 `✗` + `产物 0/6` + 无「确认产物」按钮 + 计划 chip 沉默 —— 线上现状（数据来源被切断）；
- **B · 修复后三态**：需求分析期（`⏳需求文档` + `门 0/4` + 「确认产物」）/
  设计期成组确认（`✓需求文档 ⏳设计文档` + `门 1/4` + 「确认产物（全部 6 份）」）/
  实施期（`✓✓✓✗` + `门 3/4` + 无按钮）；
- **C · 计划 / 验收 chip 演示**：计划待批 / 计划已批 / 待验收材料 / 待人工审核；
- **D · 读数不可得时的降级态**：chips 行、派生行、确认按钮整块不渲染（读不到 ≠ 缺失）；
- **E · 页脚**：声明本原型只表达门读数区域，未做任何重新设计。

纪律：chip / 按钮的类名与文案与 `src/client/views/artifacts.ts`、`src/client/views/verification.ts`
**逐字一致**，DOM 顺序与 `renderReqCard` 一致，CSS 逐字抄自仓库现有样式分片（来源与行号见文件头注释），
**未引入任何新视觉语言**（无新配色 / 字阶 / 圆角 / 间距）。文件内含 5 个 `id="FR-N"` 锚点与恰好一块
几何观测量注释，满足原型锚点门（`src/application/internal/prototype-gates.ts`）。

## 其它文件不得作为视觉依据

本目录下除 `card-gates.html` 之外的**任何**文件（含 `detail.html`）均为草稿 / 占位或已被取代，
一律**不得**作为视觉裁决、实现对照或防漂移基准的依据。视觉对照以 `card-gates.html` 为准。
`detail.html` 是本需求需求阶段早期落盘的**占位骨架**（区块内容仍是模板示例文字），
其服务内容已被 `card-gates.html` 取代，故标 `superseded`。
