# 测试证据（REQ-261007133149-0716）

covers: t-717790
covers: t-208349
covers: t-c43525
covers: t-d2d7d2
covers: t-8afc8a
covers: t-b79a34
covers: t-643999
covers: t-9f3538
covers: t-a77769
covers: t-efbc13
covers: t-1f9dff
covers: t-dfbe50
covers: t-4449bd
covers: t-6bcf55
covers: t-d346b8
covers: t-656f7a
covers: t-fe0ff1
covers: t-a4d8d0
covers: t-2c0e9a
covers: t-01a912
covers: t-35978f
covers: t-52d9f7
covers: t-6bf508
covers: t-ce6b19
covers: t-53bb01
covers: t-caab74
covers: t-ff7560
covers: t-2ae37f

> 记录**实际跑过的命令与当时的输出摘要**（末次运行 2026-10-07，改动全部落盘后）。
> 判据脚本自身的反向验证（`--self-test`）一并贴出——门禁红了才是判据，绿不是。

## 1. 判据一 · 外观零变更（逐组件计算样式 + 几何）

```
$ npx tsx scripts/report-style-snapshot.mts --check
[snapshot] 逐组件读数（键数 / 不同键数）：
  head      键数=16100 不同键数=0
  band      键数= 7490 不同键数=0
  tabs      键数= 4550 不同键数=0
  trunk     键数= 2060 不同键数=0
  docs      键数= 3380 不同键数=0
  dag       键数= 2120 不同键数=0
  dialogue  键数= 2000 不同键数=0
  verify    键数= 3140 不同键数=0
  token     键数= 2600 不同键数=0
  prompts   键数= 2780 不同键数=0
[snapshot] PASS：28 个采样条件、逐组件不同键数全 0（外观零变更）
exit=0
```

覆盖：七个面板 × {1280, 900} × {在途 implementing, 终态 archived} + 首屏四段 = 28 个采样条件。
基线在**改造前**采集（t1），归位后逐键相同——这是「外观一点没动」的机器证明。

## 2. 判据二 · 分片归属（组件越界 / 公共层含具体组件取值）

```
$ npx tsx scripts/report-style-ownership.mts
[ownership] 扫描 13 个分片 · 634 条规则 · 清单 10 个组件
[ownership] 组件越界 0 处 / 公共层含具体组件取值 0 处
[ownership] 待归位基线：登记 0 条 · 已清零 0 条 · 未登记 0 条
[ownership] 逐条白名单放行：类名 26 条 · 规则 2 条（理由写在脚本里）
[ownership] DOM 根：七件标本页并集 componentRootCount = 10（期望 10）
[ownership] 清单完整性：组件子树类名 351 个，全部已被前缀或公共白名单认领
[ownership] PASS：组件越界 0 处 / 公共层含具体组件取值 0 处 —— 全部已在待归位基线登记（未登记 0 处）
exit=0
```

归位前该脚本的输出是「组件越界 7 处 / 公共层含具体组件取值 220 处」（逐条登记为待归位债），
t4 归位后清零、基线收紧为空——**待归位清单就是 t4 的工单，烧完即空**。

## 3. 两条门禁的反向验证（R-1 / R-2：故意违规必须红）

```
$ npx tsx scripts/report-style-snapshot.mts --self-test
[snapshot] --self-test：反向验证 2 条（合成规则只进标本页，不改仓库文件）
  ✅ R-1 改一条组件规则的值（trunk 标题改色）：红灯 · trunk-1280-inflight · trunk · 代表节点 #5 h3.dsh-pm-trunk-title · color · rgb(29, 29, 31) → rgb(1, 2, 3)
  ✅ R-1 反例（合成规则匹配不到任何元素 = 不许红）：按预期不红
[snapshot] PASS：两条反向验证全对（故意改必红、无辜不红）
exit=0

$ npx tsx scripts/report-style-ownership.mts --self-test
  ✅ R-1 组件越界（verify 的选择器写进 docs 分片）：红灯 · panels/docs.ts · .dsh-pm-rtm-table · 它属于 verify
  ✅ R-2 公共层含具体组件取值（组件规则写进 shared）：红灯 · shared.ts · .dsh-pm-rtm-table · 它属于 verify
  ✅ R-3 反例（本组件选择器写进本组件分片 = 不许红）：按预期不红
[ownership] PASS：三条反向验证全对（故意违规必红、无辜不红）
exit=0
```

## 4. 面板契约（类型层判据 + R-3 / R-4 / R-5）

```
$ pnpm typecheck
（无输出）exit=0

$ npx vitest run tests/report-tabs.test.ts tests/report-shell.test.ts tests/report-contract.test.ts
 Test Files  3 passed (3)      Tests  86 passed (86)

# R-3：临时删掉某面板的 badge 实现
$ pnpm typecheck
src/client/views/panels/token.ts(21,14): error TS2322: Type '{ key: "token"; label: string; }'
  is not assignable to type 'PanelShape & { key: "token"; }'.
exit=2   （还原后 exit=0）
```

`tests/report-contract.test.ts` 八例含两条**篡改样本自检**（注册表重复键 / 交换顺序必须被点出来）
与一行 `@ts-expect-error`（契约一松 → 编译期红），即 R-4 / R-5 的自动化落点。

## 5. 探针（真实 CSS + headless Chrome 的几何与行为硬判据）

```
$ npx tsx scripts/req-report-probe.mts
[四观测量复测（T-19；阈值在探针断言里，不进 geometry 块）]
  w=1280 inflight：tabsTop=562 headHeight=355 bandHeight=174 verifyTabIndex1Based=5
  w=900  inflight：tabsTop=907 headHeight=421 bandHeight=449 verifyTabIndex1Based=5
  w=1280 terminal：tabsTop=423 headHeight=218 bandHeight=172 verifyTabIndex1Based=5
  w=900  terminal：tabsTop=678 headHeight=247 bandHeight=394 verifyTabIndex1Based=5

PROBE PASS（4/4 组合 + A13 六面板全过；横向溢出受控 / 无内层滚动容器 / 未激活面板缺席 /
头部三层 + 操作区聚合右端 / 状态带三格 ≤ 220px）
exit=0
```

## 6. 页面套件与窄档逐档

```
$ npx vitest run tests/{report-shell,report-tabs,report-contract,report-content,report-degrade,
    verify-panel,docs-panel,token-panel,dialogue-panel,prompts-panel,probe-hard-criteria}.test.ts
 Test Files  11 passed (11)    Tests  292 passed (292)

# 七面板 × {1400,1280,1152,1024,960,900,820,768,700,640,600,560} = 84 次量测
七面板 × 12 档 = 84 次量测；横向溢出 0 处
  · 页面级横向溢出 0 处（documentElement.scrollWidth == clientWidth）
  · 壳内横向溢出 0 处（报告壳 scrollWidth == clientWidth）
  · ≥700 档：壳宽逐档 = min(视口, 1280)
  · <700 档：壳宽停在 660（既有边界，见评审报告「外部条件」，非本需求引入）
```

## 7. 构建与取数协议

```
$ pnpm build                → exit=0（host dist 与 lib/client.js 均更新）
$ pnpm build:client         → exit=0（[verify-client] OK … 样式归属章在场, CSS 分片完整）
$ npx tsc --noEmit -p tsconfig.json → exit=0

$ git diff --stat src/client/api.ts
 src/client/api.ts | 21 +++++++++++++++++++---
 1 file changed, 18 insertions(+), 3 deletions(-)
（逐段核对：本需求只改了端点名的**类型收敛** `type PanelEndpoint = ReportTabKey` 与注释；
  URL / 参数 / 响应形状一字未动。diff 里另一段不属于本需求——那是 REQ-261006201920-2adc 的
  `changeReason` 字段，会话开始前就在工作树里。）
```

## 8. 分片可逆与无损账目

- 分片按固定顺序拼回即 `REPORT_CSS`（导出名、用法、调用方零改动）。
- 规则数 **634 = 改造前 631 + 拆组多出的 3**（`.dsh-pm-tok-h` 那三条跨组件小标题组按组件拆开）。
- 旧待归位基线里 221 条选择器在现 CSS 里逐条可查；3 条"查不到"全部可解释（2 条拆组、1 条补过特异性）。
- 散文泄漏自检：去注释后 0 处散文漏成选择器、0 个孤立注释符。

## 9. 知识层与门禁脚本的登记

```
$ npx tsx scripts/kb-conventions-sync.mts --check
[verify] 覆盖度与清单一致（零缺口、零漂移）   exit=0
```

两条门禁进「工程操作」：C-30（改外观必须比对逐组件快照）、C-31（组件样式只许住自己的分片），
各带时机 / 命令 / 期望 / 失败怎么办四要素，并在 `docs/knowledge/INDEX.md` 有索引行。
