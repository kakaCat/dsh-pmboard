# t-ca7f97 把交互目标加高到 ≥24×24（窗口胶囊/行内链接）·复核

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
把交互目标加高到 ≥24×24（窗口胶囊/行内链接）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T13:26:11.130Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

复核段完成：命中区判据独立复跑通过；裁定 Tab 栏 4px 间隙进例外（不改 gap），并把 A8 的范围与例外清单口径转交 t14。

### 完成项

- 独立复跑：--pm-target: 24px 令牌在场；命中区规则走 min-height: var(--pm-target)
- 独立复跑：探针退出码 0，tabsTop 579/583/427/431 ≤ 713（余量 130px）
- 采纳子代理实测：两个目标 24.0 高、无 <24 目标、窗口组内间隙 8.0px
- 裁定①Tab 相邻间隙 4px 进例外：不改 .dsh-pm-tabs 的 gap——权威原型该层就是 gap:2px（分段控件惯例），改 8px 会偏离已确认的视觉契约
- 转 t14（A8）：≥8px 的范围限定到紧凑目标簇（窗口胶囊组等），Tab 栏作为例外并写明理由
- 转 t14（A8）：例外清单以 report.ts 片内注释为准（正文内联 a、0×0 隐藏节点）
- 登记：t5 卡提到的 A8 组此刻尚不存在（t14 未落），子代理用等效临时脚本实测
- evidence/ui-t5-targets-1280-inflight.png 已入库

### 改动文件

- `src/client/styles/report.ts`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-t5-targets-1280-inflight.png`

---
