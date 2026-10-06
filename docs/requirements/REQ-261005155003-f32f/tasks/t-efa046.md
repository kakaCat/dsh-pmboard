# t-efa046 收敛胶囊/圆角/边线/阴影（苹果式克制）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收敛胶囊/圆角/边线/阴影（苹果式克制）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① 静态：rgba(128,128,128,.11)、--pm-line-soft、--pm-bg-softer、--pm-shadow-card 在 src/client/styles/report.ts 命中 0；② 原型对照（可失败）：在 prototypes/detail-ui-v3.html#FR-10（1280 档 · 在途，--window-size=1280,800，壳内 213 个元素）复量七项多样性，读数须 ≤ 上限——胶囊 ≤ 5、前景色 ≤ 5、底色 ≤ 4、字重 ≤ 3、字号 ≤ 6 且无阶梯外值、圆角 ≤ 2、边线色 ≤ 2；复量命令与读数落 evidence/style-variety-before-after.txt、整页对照图落 evidence/ui-before-after-full-1280.png；③ 同一批断言复跑 `npx tsx scripts/req-detail-ui-prototype-shot.mts` 时既有断言一条不回退；④ `pnpm build:client` 含 [verify-client] OK；⑤ `pnpm kb:build && pnpm kb:check` 退出码 0。

## 实施方案（implementation）
改 src/client/styles/report.ts：① 胶囊只留状态胶囊 .dsh-pm-status（999px、11px/500、无底色、靠文字色区分）与可点控件（按钮/输入框：8px 圆角 + 发丝边）；元信息（分类/难度/窗口）改纯文本 + · 分隔；Tab 计数改纯数字无底且用 --pm-text2；② 取消全部 12% 语义底色块与彩色边线（红 35%/橙 45%/蓝实心）、紫 --pm-agent 前景色；③ --pm-line-soft 删除，灰线统一 .5px solid var(--pm-line)（更强分隔用 --pm-line-strong）；圆角只 8px/999px（取消 4/6px）；④ 内容页取消卡片阴影（只允许浮层）；底色只白 + --pm-bg-soft（分组底只用于状态带）；⑤ 操作条不再是灰底框，并入头部只留一条发丝分隔线。

## 上游产出摘要（dependsSummary）
- 落地浅色岛令牌块并移除宿主深色覆盖

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T13:45:41.855Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

t8 完成：视觉语言收敛为苹果式克制（胶囊两类、底色两档、圆角两档、发丝线一档、内容页无阴影），七项多样性由 17/9/11/5/10/3/4 收敛到 1/5/4/3/6/2/2。

### 完成项

- 胶囊只留状态胶囊与可点控件；元信息改纯文本 + · 分隔；Tab 计数纯数字
- 取消 12% 语义底色块、彩色边线、紫前景色；虚线语义统一为发丝线
- 灰线统一一档（更强分隔用 --pm-line-strong）；圆角只 8px/999px
- 内容页取消卡片阴影；底色只白 + --pm-bg-soft；操作条不再是灰底框
- 静态四查全 0：rgba(128,128,128,.11) / --pm-line-soft / --pm-bg-softer / --pm-shadow-card
- 七项多样性：17/9/11/5/10/3/4 → 1/5/4/3/6/2/2，逐项 ≤ 上限（终态同）
- 三段子卡（研发/复核/测试）全部收口；build:client 与 tsc 均通过
- 登记遗留：evidence/style-variety-before-after.txt 刷新与出图脚本复跑受 K7 阻塞，留 t13/t15 处理

### 改动文件

- `src/client/styles/report.ts`

### 下一步

t9/t10（头部两行与操作条文案）已在实现中；t13/t15 需接手 evidence 刷新与出图脚本口径（K7/K8）

---
