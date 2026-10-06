# t-66cca7 统一键盘焦点环（两档偏移）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
统一键盘焦点环（两档偏移）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① `grep -c 'focus-visible' src/client/styles/report.ts` ≥ 1，且 grep -n 输出逐类命中 FR-2 清单（缺一类即红）；② 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-2（1280 档 · 在途，--window-size=1280,800）用键盘聚焦一个 .dsh-pm-tab，计算样式 outline-width:2px、outline-offset:-2px、outline-color:rgb(0,113,227)；原型上 data-proto-focus=1 的方框是演示，不得当默认外观；③ 探针读数（t14 的 A7 组）：清单控件 el.focus() 后 outlineWidth ≥ 2px、outlineColor 与背景对比 ≥ 3:1、outlineOffset = -2px（面状）/2px（小控件），浅深两套宿主主题各跑一次；④ 鼠标路径无环：page.mouse.click() 后 outline 为 none/0；⑤ `pnpm build:client` 含 [verify-client] OK。

## 实施方案（implementation）
改 src/client/styles/report.ts：新增 --pm-focus-ring-w:2px、--pm-focus-offset-face:-2px、--pm-focus-offset-ctl:2px、--pm-focus-halo:0 0 0 3px rgba(0,113,227,.25)；新增 :focus-visible 规则覆盖 .dsh-pm-btn、.dsh-pm-tab、.dsh-pm-window、.dsh-pm-input、.dsh-pm-trunk-open、details.dsh-pm-fold > summary 以及面板内行内可点元素（实施时逐类点清并写进汇报）；面状控件用 outline-offset: var(--pm-focus-offset-face)，小控件用 var(--pm-focus-offset-ctl)；outline: <w> solid var(--pm-accent-text) 叠加 box-shadow: var(--pm-focus-halo)；不引宿主 --dsw-alias-state-business-primary；不新增 DOM 节点或属性；焦点环不得被 overflow 裁切、不得被粘性元素遮挡。

## 上游产出摘要（dependsSummary）
- 落地浅色岛令牌块并移除宿主深色覆盖

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T13:15:09.042Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

t4 完成：详情页可聚焦元素统一成 2px 强调色焦点环（含苹果式 halo 与两档偏移），覆盖 8 类控件、不引宿主令牌、不被裁切；探针四组合与构建全过。

### 完成项

- 焦点环令牌 + 16 条 focus-visible 规则（面状 -2px / 小控件 +2px 两档偏移 + 苹果式 halo）
- 覆盖 8 类控件：按钮/胶囊/输入框/行内链接式按钮/折叠条/提示词条/注入体/Tab 条
- 不引宿主焦点令牌；规则体里 0 命中（2 处命中均为注释）
- 折叠块补 overflow: visible 破裁（作用域限 report shell）
- 三段子卡（研发/复核/测试）全部收口
- 转 t14：A7 的两档成员清单 + 过渡中间值假红陷阱（须先 finish animations）

### 改动文件

- `src/client/styles/report.ts`

### 下一步

t5（目标尺寸）与 t6（动效令牌）同属外观层、无依赖阻塞；t14 的 A7 需按本卡转交的两条口径实现

---
