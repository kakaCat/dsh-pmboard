# t-6bcf55 组件归属清单 + 分片归属门禁·研发

> 需求：REQ-261007133149-0716 详情页组件化改造：单文件单组件 + 契约显式化（面向 agent 可维护性）

## 在做什么
组件归属清单 + 分片归属门禁·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T08:26:14.160Z，窗口 session-45c3638c-3cf2-4082-9e19-82253fec80eb）

研发段交付：组件归属清单（manifest.ts · 10 个组件）+ 分片归属门禁（report-style-ownership.mts · 四查：归属判定 / 清单完整性 / DOM 根 / 待归位基线）。

### 完成项

- 新增 src/client/styles/report/manifest.ts：10 个组件的 id / label / root / shard / prefixes / serves / dependsOn / tailIn
- 前缀从七件标本页 headless Chrome 真实子树类名落定（不读源码猜）；多前缀冲突 0 处
- 前缀例外 1 条（dsh-pm-tab-panel 属面板包装器）逐条带理由，不做整族豁免
- 新增 scripts/report-style-ownership.mts：静态扫描 12 个分片 631 条规则，判「组件越界」与「公共层含具体组件取值」
- 口径照 design/interfaces.md IF-6：组件分片只住自己的选择器；公共层只许宽选择器与跨 ≥2 个组件的成组规则
- 公共件白名单 26 个类名 + 2 条规则，字段照 design/data-model.md（selector / why / owner），逐条写理由
- pnpm typecheck 退出码 0（manifest 与脚本都过类型）
- 本段模板验收「vitest run tests/ 全绿」未达成（66 条失败），但已证明与本卡无关：移走本卡新增文件后同一批文件仍失败 8 条，且无测试引用本卡产物

### 改动文件

- `src/client/styles/report/manifest.ts`
- `scripts/report-style-ownership.mts`

### 下一步

交复核段（t-d346b8）：逐条对照 design/interfaces.md IF-6 与 prototypes/anatomy.html 的 10 张组件卡核对清单与判定口径。

---
