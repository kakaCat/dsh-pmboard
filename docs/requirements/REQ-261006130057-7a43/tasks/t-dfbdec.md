# t-dfbdec 验收面板：RTM 验收追踪列表·研发

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
验收面板：RTM 验收追踪列表·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T14:11:44.850Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t3 研发完成：验收面板 RTM 列表三件套补齐（样式块+核验节删除迁移+20 例测试），verify.ts 主体零改动，门禁六套件 160/160 绿。

### 完成项

- verify.ts 实体面板已完整（前任子代理留件，614 行六段齐全，零改动）
- report.ts FR-8 标记块 ~140 行：汇总行/五列主表/覆盖链 chip/五态 verdict chip/行展开/材料/历史/空态，全引令牌零裸值；顺带退役 data-verify-table 死规则
- docs.ts 删核验节整块（含只服务它的 7 个 helper+导入），原位迁移指引条 data-verify-moved 走 switch-tab
- 新建 tests/verify-panel.test.ts 20 例（T-1~T-6 全 DOM 结构断言）；同步 docs-panel/report-tabs/report-degrade/report-content/acceptance-criteria 五处断言（改写未删）
- 门禁六套件 160/160 绿；13 个面板套件 267/267；build:client OK；tsc 除别窗口在途 TS2415 外零错

### 改动文件

- `src/client/styles/report.ts`
- `src/client/views/panels/docs.ts`
- `tests/verify-panel.test.ts`
- `tests/docs-panel.test.ts`
- `tests/report-tabs.test.ts`
- `tests/report-degrade.test.ts`
- `tests/report-content.test.ts`
- `tests/acceptance-criteria.test.ts`

### 下一步

t3 联调：渲染 verify 面板截图对照原型 #tab-verify

---
