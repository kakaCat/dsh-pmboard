# t-8afc8a Panel 契约类型钉住 + Tab 键与取数端点单点推导

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
Panel 契约类型钉住 + Tab 键与取数端点单点推导

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
pnpm typecheck 退出码 0；反向验证：临时删掉某面板的 badge 实现 → typecheck 必须失败；npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts 全绿。

## 实施方案（implementation）
src/client/views/report-tabs.ts 定义显式 Panel 接口并让 7 个面板 satisfies 校验；REPORT_TABS 作为唯一清单，ReportTabKey 由它推导（删除手写联合）；src/client/api.ts 的 endpoint 名从注册表同源推导（请求 URL/参数/响应形状零改动）；新增 tests/report-contract.test.ts（键唯一 / 注册顺序即展示顺序 / 七个面板都实现全接口 / 未知键不静默回落），保留 isReportTabKey 守卫与 defOf 回落语义。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T10:41:38.571Z，窗口 session-45c3638c-3cf2-4082-9e19-82253fec80eb）

面板契约类型钉住完成：显式 Panel 契约 + 注册表单点推导（手写键联合删除）+ 端点名同源；新增契约用例 8 例（含 R-3/R-4/R-5 的自动化自检），typecheck 0、三件套 86 例全绿、R-3 删除 badge 的编译期演练通过。

### 完成项

- 新增显式面板契约 Panel（key / label / badge / render / degraded?）与注册前形状 PanelShape；REPORT_TABS 对外类型是 readonly Panel[]，注册即编译期校验
- 删掉手写的 ReportTabKey 联合：改成 (typeof PANEL_TUPLES)[number][‘key’] 从唯一注册表推导（IF-3）
- api.ts 的端点名同源化：PanelEndpoint = ReportTabKey（只收敛类型，URL / 参数 / 响应形状零改动）
- 新增 tests/report-contract.test.ts（8 例）：键唯一 / 顺序即展示顺序（与原型 #FR-4 同序 + 渲染顺序一致）/ 七面板全接口 / 未知键不静默回落 / 端点名与 Tab 键同源（逐键断言取数 URL 以 /<key> 结尾）
- R-3 反向验证已落地：删掉 trunkPanel 的 badge → pnpm typecheck 报 TS2322 并点名该面板；还原后退出码 0
- R-4 / R-5 反向验证已落地：体检函数 + 篡改样本（重复键 / 交换顺序）必须被点出来（用例内自检，不靠临时改文件）
- 验收三件：pnpm typecheck 0；tests/report-tabs + report-shell + report-contract 三件 86 例全绿
- 回归：面板/探针判据 236 例全绿；归属门禁 0 处 / 0 处；外观快照逐组件全等；探针 4/4 + A13 全过；build:client 0
- 踩坑留痕：面板对象若用 x: PanelShape 标注，上下文类型会把 key: 'trunk' 拓宽成 string，推导出的键联合随之退化成 string（switch 不穷尽、typecheck 红）——改成 PanelShape & { key: 'trunk' } 把键钉成字面量
- 连带修掉 t4 归位遗留的两处：tests/report-tabs.test.ts 的 FR-4 断言原本按「CSS 文本位置」切片（归位后不成立）→ 改成「全场查收敛项 + FR-4 段查裸值」；FR-4 的令牌块（自成一体的岛级规则）仍留在 shared → 搬进 tabs.ts（FR-2 的归属）

### 改动文件

- `src/client/views/report-tabs.ts`
- `src/client/api.ts`
- `src/client/views/panels/trunk.ts`
- `src/client/views/panels/docs.ts`
- `src/client/views/panels/dag.ts`
- `src/client/views/panels/dialogue.ts`
- `src/client/views/panels/verify.ts`
- `src/client/views/panels/token.ts`
- `src/client/views/panels/prompts.ts`
- `tests/report-contract.test.ts`
- `tests/report-tabs.test.ts`
- `src/client/styles/report/tabs.ts`
- `src/client/styles/report/shared.ts`

### 下一步

接 t-b79a34（门禁反向验证 R-1~R-5 + 维护指南）：R-3/R-4/R-5 的落点已在本卡交付，那边补 R-1（快照门禁的自检）与两份文档。

---
