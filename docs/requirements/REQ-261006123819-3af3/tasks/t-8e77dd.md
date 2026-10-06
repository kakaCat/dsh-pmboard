# t-8e77dd 知识层条目/索引/根因修复与生成页压行

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
知识层条目/索引/根因修复与生成页压行

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx tsx scripts/kb-probe.mts → 0 项失败 exit 0（改动前 5 项失败 K1/K3/K5/K6/K10-C27）；② pnpm kb:check → exit 0 且无 [drift] 行；③ grep -c 'kb-conventions-c-22' docs/knowledge/INDEX.md ≥1 且 grep -c 'kb-0043\|kb-0048' docs/knowledge/INDEX.md = 2；④ INDEX.md 字符数 ≤8000（测得值，含新增 4 行）；⑤ 根因用例：喂含 · 或 → 或超 140 字符的 one_liner → 不落盘条目文件；沉淀路径对非法字符先清洗再截断；⑥ 反向 RV-6/RV-7：删 INDEX 里 kb-0043 行 → K5 红；删 c-22 行 → 新增的完整性检查红；均还原复绿。

## 实施方案（implementation）
docs/knowledge/entries/kb-0043.md 的 one_liner 由 154 字符改到 ≤140；kb-0048.md 的 one_liner 去掉两个 →（换成 /）；docs/knowledge/INDEX.md 补 4 行（c-22、c-28、kb-0043、kb-0048，内容见 design/interfaces.md「本次要补的 4 行」）并把全文压回 ≤8000 字符（含这 4 行）。根因①：src/application/use-cases/DepositKnowledge.ts:70 的 input.indexEntry.slice(0,140) 改为先 replace(/[·→\n]/g,' ') 再截断（与 src/domain/knowledge/operations.ts:350 既有正确口径同源）。根因②：src/adapters/KnowledgeRepository.ts 的 appendEntry 在写 entries/<id>.md（:123）之前先校验 one_liner（试 renderIndexLine），杜绝条目落盘而索引没写。页内压行：src/domain/knowledge/generate.ts 的 renderDesignTokens（:158-211）把颜色/变量节由一行一条改为一行多条，使内容行 ≤199，节名与数据完整性不变。scripts/kb-probe.mts 新增一条检查：conventions.md 的每个 ### C-NN 小节在 INDEX.md 都有对应行且锚点可达。重生成 docs/knowledge/design-tokens.md。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T06:05:21.990Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

知识层自检由 7 项失败转为 12 项全过：坏 one_liner 与漏行补齐、两处产出孤儿的根因堵住、生成页 220→91 行、新增小节↔索引行门禁。

### 完成项

- 两条坏 one_liner 修好并进索引：kb-0043 压到 121 字符、kb-0048 去掉 → 与截断尾巴
- INDEX 补 c-22 / kb-0043 / kb-0048 三行；字符数由 10647 降到 7560（≤8000）
- 索引标签压缩按人工裁定 D-7 执行：只压索引行标签，条目正文一字不动
- 根因①：沉淀路径先清洗 ·/→/换行再截断（与 operations.ts 既有正确口径同源）
- 根因②：appendEntry 先算索引行再写条目文件——坏 one_liner 不再留下孤儿
- 生成页压行：design-tokens.md 220 行 → 91 行，颜色 87 / 变量 87 一条不少
- 新增门禁 K12：规范页每个 ### C-NN 必须在索引有对应行（此前无人管，C-22 漏行由此长期无人发现）
- 顺带修好 kb-0043 的死链指针与被 K5 遮住的 K4 红；补齐 C-27 的「失败怎么办」占位
- 判据：kb-probe 12 项全过 exit 0；kb:check exit 0 零漂移；tsc 0 错；全量 62 失败 ≤ 基线 68
- RV-6 / RV-7 实测：删 kb-0043 行 K5 红、删 c-22 行 K12 红；还原逐字节一致

### 改动文件

- `docs/knowledge/INDEX.md`
- `docs/knowledge/entries/kb-0043.md`
- `docs/knowledge/entries/kb-0048.md`
- `docs/knowledge/conventions.md`
- `docs/knowledge/design-tokens.md`
- `src/domain/knowledge/generate.ts`
- `src/application/use-cases/DepositKnowledge.ts`
- `src/adapters/KnowledgeRepository.ts`
- `scripts/kb-probe.mts`
- `tests/kb-repository.test.ts`
- `tests/kb-archive-deposit.test.ts`

### 下一步

下一张就绪卡：t-80336d（证据模板带工作树指纹）；再之后 t-a9229c 会用到本卡留出的 INDEX 余量补 c-28。

---
