# t-3b3b5e 客户端文档面板原型单列与权威/被取代投影

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
客户端文档面板原型单列与权威/被取代投影

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
npx vitest run tests/docs-panel.test.ts tests/query-docs.test.ts 全绿：prototypes/detail.html 与 prototypes/INDEX.md 出现在 documents 且 kind 为 prototype、不再出现在任何 discovered 分组；documents 中台账行数 + Σ discovered.count == artifacts.length；data-doc-row 条数 == documents.length；INDEX 有一条 authoritative + 一条 superseded 时两行分别带 prototypeRole 与 supersededBy，读不到 INDEX 时两字段都不注入；原型行可点开（存在 data-open-doc）且无新增弹窗与路由。pnpm typecheck 退出码 0。

## 实施方案（implementation）
① 改 src/application/query/QueryDocs.ts：交付物白名单增 prototypes/*.html 与 prototypes/INDEX.md（kind 均为 prototype），原型不再落 discovered；读 INDEX 后投影 DocPanelEntry.prototypeRole?: 'authoritative'|'superseded' 与 supersededBy?: string（缺省不注入，旧形状不变，读 INDEX 失败也不伪造角色）；恒等式保持『documents 中来自台账的行数 + Σ discovered.count == artifacts.length』。② 改 src/client/views/panels/docs.ts：原型作为确定交付物在确定文档块内单列（新增 data-doc-group="prototype" 与原型计数），原型行必须保留 data-doc-row="1"（既有 data-doc-row 条数 == documents.length 的断言不许破），可点击打开走既有 [data-open-doc] 委派、不新增弹窗；对本次改动前已登记为 notes 的旧原型行用 prototypeGroupOf(path)（认 prototypes/ 与 prototype/ 两个前缀）在展示侧兜底归组，台账 kind 不回填。③ 改 src/client/styles/report.ts：新增 ≤3 条规则（原型徽标 / 计数 / superseded 弱化），只复用既有令牌并写在 [data-report-shell] 作用域内。依据 design-brief §9 与 §10 #30/#32/#34。

## 上游产出摘要（dependsSummary）
- 定义 prototype 产物与枚举契约（kind/路径识别/标签/面板与提交枚举）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T05:21:30.411Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，人打开文档页就能一眼看到「有没有原型、哪一版是权威、有没有判据」，而不是自己去一堆 html 里翻。

### 完成项

- 文档页上原型第一次有了自己的分组、权威标记与计数，不再混在「其它发现」里
- 按裁决补了旧路径的白名单：按新 kind 登记的老目录原型也能在页面上被看见（消灭一处两份真相）
- 按裁决补了锚点判据呈现：有锚点 N 条 / 缺锚点；未采集则不显示（可分辨），且绝不显示阈值
- 恒等式与既有行标记断言未破；未新增列、表、弹窗与路由
- 48 例全绿、相关面 141 例全绿、typecheck 0、client 构建 verify-client OK

### 改动文件

- `src/shared/protocol.ts`
- `src/application/query/QueryDocs.ts`
- `src/client/views/panels/docs.ts`
- `src/client/styles/report.ts`
- `tests/docs-panel.test.ts`
- `tests/query-docs.test.ts`

### 下一步

t18 在文档行上加验收对照项属性；t4 的门禁决定「能不能交」，本卡决定「交了看不看得见」。

---
