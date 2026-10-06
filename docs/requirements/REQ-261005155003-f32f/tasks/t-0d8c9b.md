# t-0d8c9b 把交互目标加高到 ≥24×24（窗口胶囊/行内链接）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把交互目标加高到 ≥24×24（窗口胶囊/行内链接）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① 探针读数（t14 的 A8 组，可失败）：遍历 button/[role=tab]/a[href]/summary/input，getBoundingClientRect() 宽高均 ≥ 24、相邻间隙 ≥ 8px，例外清单显式写在断言里逐条给理由；② 静态：grep -n -e 'dsh-pm-window' -e 'dsh-pm-trunk-open' src/client/styles/report.ts 命中处带 min-height:24px 或 ::after 命中区规则；③ `npx tsx scripts/req-report-probe.mts` 退出码 0（A1 的 tabsTop ≤ 713、A2 无横向溢出、A3 无内层滚动、A5 不重叠、A6 整块 ≤ 72px）；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-5（1280 档 · 在途，--window-size=1280,800）实测最矮目标 .dsh-pm-window = 203.1×24.0、.dsh-pm-trunk-open ≥ 24 高，对照截图与差异说明落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK。

## 实施方案（implementation）
改 src/client/styles/report.ts：.dsh-pm-window（基线 216.2×20.5）与 .dsh-pm-trunk-open（基线 71.2×19.3）改为命中区 ≥24 高——优先用 ::after 扩命中区（不改视觉框、不撑高行），必要时加内边距；窗口胶囊组内相邻目标间距 ≥8px；不得新增可聚焦元素、不得新增 data-*；正文内联链接按 WCAG inline 例外写进例外清单并逐条给理由；加高后须复测首屏预算（余量最紧 110px，不许用光）。

## 上游产出摘要（dependsSummary）
- 落地浅色岛令牌块并移除宿主深色覆盖

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T13:26:38.387Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

t5 完成：详情页两个「够不到 24」的目标（窗口胶囊、点开看原文）命中区加高到 24px，四组合实测与探针全过，首屏预算几乎无代价。

### 完成项

- 两个小目标命中区加高到 24px（令牌 --pm-target 单点）
- 四组合实测无 <24 目标、窗口组内间隙 8.0px、首屏代价 +0.2px
- 三段子卡（研发/复核/测试）全部收口
- 裁定：Tab 栏 4px 间隙进例外（原型该层本就是 2px），不改 gap
- 转 t14：A8 的范围与例外清单以本卡片内注释为准

### 改动文件

- `src/client/styles/report.ts`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-t5-targets-1280-inflight.png`

### 下一步

t7/t8 继续改 report.ts，须保留本卡新增的 --pm-target 与 ⑭ 节

---
