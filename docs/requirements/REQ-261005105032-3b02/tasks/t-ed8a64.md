# t-ed8a64 产出端到端证据与六条逆验证（几何量硬判据 / exit 2）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
产出端到端证据与六条逆验证（几何量硬判据 / exit 2）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
npx tsx scripts/req-report-probe.mts 退出码 0 且打印 PROBE PASS；人为改坏一处几何量（把硬上限改成必然违反的值）→ 退出码非 0 并打印具体判据；CHROME_BIN=/nonexistent 时 → 退出码 2；npx vitest run tests/probe-hard-criteria.test.ts 断言命中数为 0；npx tsx scripts/reverse-drill-matrix.mts 六条逆验证全部判定为必红（每条打印改坏点）；pnpm typecheck 与 pnpm test 全绿。

## 实施方案（implementation）
① 把探针族只打印的诊断行升为硬判据：改 scripts/req-report-probe.mts（既有 --window-size 与 TABS_TOP_MAX=713 硬上限保留），确保每个几何量都有断言分支、无 Chrome 环境 exit 2（响亮失败、不许静默跳过），并在回读时校验实际视口宽等于期望（--window-size 未生效即报错）。② 新增源码级断言用例 tests/probe-hard-criteria.test.ts：扫 scripts/req-*-probe.mts 中『只 console.log 几何量、无断言分支』的行，命中数必须为 0。③ 用既有 scripts/reverse-drill-matrix.mts 跑 6 条逆验证（人为改坏 → 必红）：R1 模板节标题、R1 渲染映射表项、R2 节名集合、R3 路径指针、R4 未重生成、stripPrototypeAnchors 移除。④ 把本轮四路径门禁回归（t6）、验收单对照项（t18）、文档自检（t21）串成一份端到端证据清单（命令 + 原始输出摘要 + 探针截图路径），供验收材料直接引用。依据 design-brief §6 与 §10 #25 及 requirement.md 验收标准 8/21/22。

## 上游产出摘要（dependsSummary）
- 验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支
- 加 R3 提示词路径可达探针与 R4 pnpm 脚本接线
- 加文档自检脚本 req-doc-validate.mts（9 项）并并入 R1

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T11:17:38.054Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，本需求的判据不只「会拦人」，还「拦得响」：没有浏览器就响亮失败、几何量不达标就红、改坏就必红——不再有静默跳过与纸面判据。

### 完成项

- 探针硬判据化：几何量从「只打印」变成「不达标就红」，21 项观测量全部有失败分支
- 无浏览器环境响亮失败（退出码 2）；显式指定的浏览路径不存在不再静默回退（旧语义已修）
- 新增源码级用例守住「不许只打印」这条纪律，并有扫描器自检防空转
- 六条逆验证全部真跑必红并打印改坏点，还原逐字节核对；还原过程有并发写入保护
- 三次 dogfood 固化为可复跑命令（裁定门 / 原型门 / 时序门，9 项判定）
- 产出端到端证据清单（8 节），含用例汇总、全量红逐条归因、不适用项与口径变更
- 四条探针 + 文档自检 + typecheck 全绿；本需求 39 个用例文件中仅 2 个文件红且均归因为基线/他人

### 改动文件

- `scripts/req-report-probe.mts`
- `scripts/reverse-drill-matrix.mts`
- `scripts/self-gate-dogfood.mts`
- `scripts/req-doc-validate.mts`
- `tests/probe-hard-criteria.test.ts`
- `docs/requirements/REQ-261005105032-3b02/notes/e2e-evidence.md`

### 下一步

提交验收材料（kind=verification）：结论 + 可复核证据清单引用本卡与执行裁决清单。

---
