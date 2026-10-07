# t-d2d7d2 覆盖层按组件归位（拆 :is() 组并补回特异性）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
覆盖层按组件归位（拆 :is() 组并补回特异性）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx tsx scripts/report-style-snapshot.mts --check 退出码 0（逐组件不同键数全 0）；npx tsx scripts/report-style-ownership.mts 退出码 0；npx tsx scripts/req-report-probe.mts 退出码 0（4/4 组合 + A13 六面板全过）。

## 实施方案（implementation）
把片尾跨组件覆盖层（⑰ 收敛 / ⑲ 契约 / ㉑ 卡片语汇 / 头部连带修正 / FR-2 / FR-4 / FR-8 尾块）按实际服务的组件归位：口径处处相同的整组原样进 src/client/styles/report/shared.ts；组件专属的按组件拆开并逐字保留声明，用同义重复属性选择器（[data-report-shell][data-report-shell]，恒真）补回原组最大特异性；同步 src/client/styles/report/manifest.ts 的 prefixes。

## 上游产出摘要（dependsSummary）
- 样式物理分片 + 拼接出口（导出名与顺序不变）
- 组件归属清单 + 分片归属门禁

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T09:37:02.750Z，窗口 session-45c3638c-3cf2-4082-9e19-82253fec80eb）

覆盖层按组件归位完成：198 条组件专属规则从公共层片尾搬进各自分片（新建 verify 分片、拆开跨组件组、条件组连外壳搬），判据二达「组件越界 0 处 / 公共层含具体组件取值 0 处」，判据一逐组件逐键全等（外观零变更），探针 4/4 + A13 全过。

### 完成项

- 片尾覆盖层（⑰/⑫–⑱/⑲/㉑）里只服务一个组件的规则逐条归位到各自分片：从 shared.ts 搬走 194 条、从 docs.ts 搬走 4 条（验收面板）
- 新建 src/client/styles/report/panels/verify.ts（验收面板自己的分片），报表出口接上 VERIFY_CSS（插在 ⑦docs 之后）
- 跨 ≥2 组件的成组规则留公共层；token 的小标题组按组件拆开（token 侧留 token.ts，提示词侧进 prompts.ts）
- 条件组（@media）里只服务一个组件的三条（band 窄档 / head 窄档隐藏 / trunk 网格）连外壳搬进各自分片
- 判据二输出：组件越界 0 处 / 公共层含具体组件取值 0 处（待归位基线 221 条全部清零、收紧为空）
- 判据一输出：28 个采样条件、10 个组件逐键全等（不同键数全 0）——外观零变更
- 回归：req-report-probe 4/4 组合 + A13 六面板全过；pnpm typecheck 0；pnpm build:client 0（766662 bytes、样式归属章在场、CSS 分片完整）
- 两条搬走的规则补了一个恒真同义属性选择器（[data-report-shell] 再写一遍）买回「原来靠位置赢」的那一局：head 的长日志标、token 的按节点表折叠条；补之前先确认该元素上所有竞争规则的特异性都 ≤ 原值（浏览器实测），不是猜的
- 无损校验：旧基线 221 条的选择器在现 CSS 里逐条可查；规则数 634 = 归位前 631 + 拆组多出的 3，账对得上
- 过程里踩过并记录：偏移量剪贴会因区间重叠把文本接错（吞规则进注释）——改成不重叠分段重建后才干净；中途两版把树改坏，已逐次退回并重新用校验过的基座重跑

### 改动文件

- `src/client/styles/report/panels/verify.ts`
- `src/client/styles/report.ts`
- `src/client/styles/report/manifest.ts`
- `src/client/styles/report/head.ts`
- `src/client/styles/report/band.ts`
- `src/client/styles/report/tabs.ts`
- `src/client/styles/report/shared.ts`
- `src/client/styles/report/panels/docs.ts`
- `src/client/styles/report/panels/trunk.ts`
- `src/client/styles/report/panels/dialogue.ts`
- `src/client/styles/report/panels/token.ts`
- `src/client/styles/report/panels/prompts.ts`
- `src/client/styles/report/panels/dag.ts`
- `docs/requirements/REQ-261007133149-0716/evidence/ownership-baseline.json`

### 下一步

交复核段（t-a4d8d0）：核对归位后的分片边界与两条补特异性是否只影响该元素；再交测试段跑三查与反向演练。之后接 t6（门禁反向验证 + 维护指南）。

---
