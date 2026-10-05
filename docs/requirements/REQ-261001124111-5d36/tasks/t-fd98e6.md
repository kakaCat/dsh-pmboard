# t-fd98e6 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
面板新鲜度渲染：数据时间 / 失败红条 / 版本提示

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/panel-freshness-render.test.ts 全绿，覆盖 TC-I…TC-M：19 张卡真实 payload 渲染不含「暂无任务」且含 np-dag-canvas 与 data-fetched-at；陈旧态含 class 含 is-stale 且 data-stale="1"；失败态含 role="alert" 与「显示的是 … 的旧数据」；版本不等含 np-reload、相等不含；不传 freshness/buildNotice 时输出与改造前逐字节相同。npx vitest run tests/node-panel.test.ts 零改动全绿。

## 实施方案（implementation）
改 src/client/node-panel.ts：NodePanelInput 加可选 freshness / buildNotice；renderHead 内加 <span class="dsh-pm-np-fresh" data-fetched-at data-stale data-refresh-ms>（文案「数据时间 HH:MM:SS」，无数据「—」，stale 时加 is-stale）；新增 renderFreshnessBar() 渲染 dsh-pm-np-fresh-err（role=alert，「刷新失败：<原因> · 显示的是 HH:MM:SS 的旧数据」）与 dsh-pm-np-build-notice（role=status + data-action=np-reload，「插件已更新（S1 → S2），点此刷新」）。渲染顺序：head → 版本提示 → 失败红条 → 既有内容。src/client/styles/node-panel.ts 加 4 个类（复用既有变量与警示色，不新增色值）。

## 上游产出摘要（dependsSummary）
- 刷新调度器：纯逻辑 + 假计时器单测

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T04:57:41.025Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

这一步做完，什么变了：面板会自报时间与状态了——头上多一行「数据时间 HH:MM:SS」，超过 30 秒或从未成功会转警示色；刷新失败时多一条红字直说「显示的是几点几分的旧数据」；插件版本落后时多一条可点的「插件已更新」。三者只在新入参下出现，不传就一个字都不变。

### 完成项

- 渲染增量落地：src/client/node-panel.ts（NodePanelInput 加 freshness/buildNotice、renderHead 加数据时间、新增 renderFreshnessBar）+ src/client/styles/node-panel.ts 4 个类
- 单测 10 例覆盖 TC-I…TC-M（含新增顺序断言 TC-K′），npx vitest run tests/panel-freshness-render.test.ts → 10 passed
- 既有面板测试零改动全绿：tests/node-panel.test.ts 28 passed；tests/dag-view.test.ts 通过
- 变异自证：把红条条件改回「只有一无所有才显示」→ TC-K 转红；去掉陈旧判定 → 2 例转红；还原后全绿

### 改动文件

- `src/client/node-panel.ts`
- `src/client/styles/node-panel.ts`
- `tests/panel-freshness-render.test.ts`

### 下一步

既有偏差（响亮报出，非本卡引入）：tests/node-panel-styles.test.ts 有 1 例红——它期望面板宽度 min(720px, calc(100vw - 130px))，而源码第 68 行已被其它窗口改成 min(720px, calc(100% - 32px))。下一步：t3 组件接线（代码已随本轮写完：conversation-progress 接调度器 + api 加 build 命名帧 + plugin-config 加 panel 策略，12 例接线测试绿、pnpm build:client 通过）。

---
