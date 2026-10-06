# t-e804cb 头部三层 + 闸门提示条

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
头部三层 + 闸门提示条

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run（report-head 相关套件）全绿（T-12）；标本截图：三层分明、操作按钮右置、有缺口时琥珀提示条在且锚链可点、无缺口时整条不渲染；对照原型 #FR-1

## 实施方案（implementation）
① report-head.ts：标识行（返回+REQ-id 等宽+状态药丸+分类/难度 chip+内联时间；席位 chips 右置，已归档置灰）；标题行（19px 标题+操作按钮聚合右置——按钮集合=renderActionBar 现行输出，不增不减）；闸门提示条（waitingHuman>0 才渲染：⚠ 需人工确认 · N 件缺口 + 锚链「查看缺口 ↓」滚动到缺口格）。② styles/report.ts 三层样式。③ 同步 head 断言（T-12）。验证：npx vitest run（head 套件）+ 标本截图对照原型 #FR-1。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:29:37.515Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t4 头部三层完成：标识/标题/闸门提示条三段落地，复核抓出的同信道风险与测试切片缺陷均已修复。

### 完成项

- 头部三层：标识行/标题行/闸门提示条（琥珀条+查看缺口锚链）
- 复核 P1×2 修复：锚链改 scroll-gap-focus 委派（避开宿主 hash 信道）、t2 测试切片边界收窄
- P2 修复：终态豁免+断言、裸 px 豁免注记
- 测试：T-12 六用例 + 范围回归 196/196 绿、tsc 零错、client 重建 OK

### 改动文件

- `src/client/views/report-head.ts`
- `src/client/views/report-band.ts`
- `src/client/styles/report.ts`
- `src/client/board-mount.ts`
- `tests/report-shell.test.ts`
- `tests/report-tabs.test.ts`

### 下一步

t6 研发在途；t3 验收面板待 t8 完工

---
