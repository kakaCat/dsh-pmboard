# t-ce6b19 Panel 契约类型钉住 + Tab 键与取数端点单点推导·复核

> 需求：REQ-261007133149-0716 详情页组件化改造：单文件单组件 + 契约显式化（面向 agent 可维护性）

## 在做什么
Panel 契约类型钉住 + Tab 键与取数端点单点推导·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007133149-0716/design/` 逐条核对；`npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T10:41:55.936Z，窗口 session-45c3638c-3cf2-4082-9e19-82253fec80eb）

复核段：IF-1~IF-4 逐条核对无偏离（icon 的偏离是有意的且已写明理由）；运行时零改动；另记一条门禁盲点（令牌族看不见）。

### 完成项

- IF-1 面板契约：实现为 Panel（key / label / badge / render / degraded?）——与 design 的示意图差一个 icon：图标按既有纪律留在壳的 TAB_ICONS / TAB_ICON_SVG（面板卡不该记得带图标，漏带没人测得到），这是**有意偏离**，已在源码里写明理由
- IF-2 注册表单点真相：REPORT_TABS 现在是 readonly Panel[]，注册即校验（漏成员在注册那一处编译期红）
- IF-3 键推导：手写联合已删，ReportTabKey = (typeof PANEL_TUPLES)[number]['key']；实测键联合没有被拓宽成 string（api.ts 与 report-degrade 的 switch 仍穷尽）
- IF-4 端点同源：PanelEndpoint = ReportTabKey；请求语义零改动（只删类型别名，URL/参数/响应形状未动），并用逐键断言取数 URL 以 /<key> 结尾钉住
- 既有行为逐字保留：isReportTabKey 守卫未动，契约用例把它与「不静默回落」钉住（含大小写 / 空串 / 非字符串脏值）
- 运行时零改动核对：本轮只动类型与清单（面板声明仍是同一批对象、同一份数组），行为回归 236 例全绿
- 发现一处门禁盲点（留给 t6 记录）：归属门禁按**类名**判归属，看不见「岛级规则里为某一个组件定义的令牌族」（如 FR-4 的 --pm-tab-* 原先住在共享层）——这次是顺手搬对了，但门禁本身判不到

### 改动文件

- `src/client/views/report-tabs.ts`

### 下一步

交测试段：跑三件套 + R-3 编译期演练 + 行为回归。

---
