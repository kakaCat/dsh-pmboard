# 测试证据（REQ-261004222448-292a）

> 一句话：本需求 19 个用例文件 **376 例全绿**；全量套件失败数 **74 ≤ 开工前基线 81**，**新增失败 0**；
> 端到端渲染探针 4/4 组合通过且反向验证会红。
> 原始输出都在 `../evidence/` 下，命令可直接重跑（工作区根执行）。

## 一、本需求的用例矩阵（19 文件 / 376 例）

| 用例文件 | 例数 | 覆盖 |
|---|---|---|
| `tests/report-routes.test.ts` | 13 | 六端点信封、分页越界、非法标识不触盘、未装配降级、只读 |
| `tests/report-degrade.test.ts` | 18 | 取数架构（T-1/T-2/T-3/T-4/T-7/T-8）+ 降级诚实性（T-15~T-19）+ 终态只读 + 缺口口径 |
| `tests/report-content.test.ts` | 20 | 主干抽取与反应付（T-9/T-10/T-11）、文档铺开与核验门禁（T-5/T-13/T-16）、对话过滤（T-12）、按阶段花费（T-14/T-17） |
| `tests/report-prompt.test.ts` | 9 | 留痕来源与后果（T-18/T-20）、截断（T-21） |
| `tests/report-template.test.ts` | 9 | 模板两节（T-22）+ 别名表钉子 + 缺节标本 |
| `tests/report-shell.test.ts` | 45 | 壳的六条卡验收：首屏请求数、未点过的 Tab 零请求、未激活面板缺席、局部更新保态、终态只读、档二 |
| `tests/report-backend-parity.test.ts` | 7 | 双后端（分片 json + SQLite）七查询逐字段一致 + 缺席语义 + 只读性 |
| `tests/report-firstscreen-gaps.test.ts` | 16 | Tab 角标、评论列表、结果与成效三处首屏数据 |
| `tests/trunk-panel.test.ts` | 31 | 汇报 Tab 渲染 |
| `tests/docs-panel.test.ts` | 21 | 文档 Tab 渲染 |
| `tests/dag-panel.test.ts` | 22 | DAG Tab 渲染 + 画布复用边界 |
| `tests/dialogue-panel.test.ts` | 23 | 对话 Tab 渲染 + 过滤反例 |
| `tests/token-panel.test.ts` | 16 | 花费 Tab 渲染（含不可得态不出现 0） |
| `tests/prompts-panel.test.ts` | 19 | 提示词 Tab 渲染 |
| `tests/query-report.test.ts` | 38 | 服务端聚合（缺口四类、占比合计、优化点、三态） |
| `tests/query-trunk.test.ts` | 38 | 节名匹配、缺节、原文子串、别名表 |
| `tests/query-dialogue.test.ts` | 13 | 一条流过滤与分页 |
| `tests/query-prompts.test.ts` | 9 | 提示词三段与降级 |
| `tests/injection-log.test.ts` | 9 | 留痕四字段、四处写入点、截断、旧条目降级 |

原始输出：`../evidence/requirement-tests.txt`。

## 二、全量回归对比（同一 node_modules，两个工作树各跑一次）

| 工作树 | 文件 | 用例 | 失败 | 通过 |
|---|---|---|---|---|
| 开工前基线 `660973e`（另建 worktree 实测） | 427 | 4641 | **81** | 4540 |
| 交付后工作区 | 445 | 5010 | **74** | 4916 |

- 失败 **81 → 74**（净少 7）；新增失败 **0**（失败文件集差集为空，见 `../evidence/final-failed-files.txt`）。
- 剩余 74 条全部可在开工前提交上复现（id 格式迁移等既有问题）——**未修，也未掩盖**。

## 三、端到端渲染探针

`npx tsx scripts/req-report-probe.mts` → **4/4 组合 PASS，退出码 0**
（1280/900 × 在途 implementing/终态 archived）。

每条组合实测五件事：四问落点在首屏、无横向溢出（含报告壳自身同判据）、无内层滚动容器
（真 DOM 实测 + 两处合法例外）、未激活面板不在 DOM、窄档操作条按钮不重叠。

反向验证（防"恒绿装饰"）：

| 改坏方式 | 退出码 | 关键输出 |
|---|---|---|
| 面板容器加 `overflow:auto; max-height:200px` | **1** | `A3 内层滚动容器 1 处：section.dsh-pm-trunk-item[overflow auto/auto 竖向 224 装 486]` |
| 面板容器加 `width: 3000px` | **1** | `报告壳 scrollWidth=3024 ≤ clientWidth=1280+1 → ✗`（documentElement 那半仍绿——所以必须加壳自身判据） |
| 环境不可用（禁 Chrome） | **2** | `PROBE FAIL（环境不可用，退出码 2）` |

## 四、四条交付门

| 门 | 命令 | 结果 |
|---|---|---|
| 宿主 + 客户端构建 | `pnpm build` | exit 0；`dist/index.mjs` 与 `lib/client.js` 均为新产物 |
| 客户端校验 | 含在 build 内 | `[verify-client] OK  bundle=530906 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| 知识层自检 | `pnpm kb:check` | exit 0（11/11；**开工前为 5 项红**，本次一并修掉并声明） |

## 五、有意为之的"钉子"（改坏就会红）

`TRUNK_SECTION_ALIASES`（架构 ≡ 目标与总体方案）、模板两节标题、`data-hl-list` / `data-evid`
（反应付的两个容器）、`data-share-sum`（占比合计）、`data-delivered`（投递后果）、
8000 字符截断上限、`data-panel` 只在面板根上一次、无内层滚动的探针判据。
这些都是**口径**，不是实现细节——谁改它们，用例会直接红，而不是安静地变样。

## 六、任务覆盖标注（covers）

> 本需求全部 18 张父卡 + 66 张子卡的测试归属。逐条对照上一节的用例矩阵：
> 每张卡都有自己的自测（子卡的研发/联调/复核/测试段），其证据在 `tasks/<task_id>.md` 的完工记录里；
> 本文件给出「卡 → 覆盖它的用例文件」的机械标注，供覆盖度门禁与 RTM 使用。

covers: t-43fcf4 t-30e673 t-9c6ff5 t-9e4efc t-017953
covers: t-242dd9 t-96eef1 t-b21ac5 t-8d731c t-291256
covers: t-8eeed9 t-4be2d8 t-3b4520 t-8d4808 t-f116e5
covers: t-497311 t-5a9887 t-d67c87 t-ebe6cb t-4b7116
covers: t-cc7233 t-4490fa t-2683a4 t-15fe7e t-948878
covers: t-361f2f t-c71408 t-1faf63 t-4a7e43 t-733356
covers: t-9f4f1d t-8062a2 t-3ee6a8
covers: t-ab048e t-ac6c3f t-d8a61b t-386c7e t-237a9b
covers: t-9eb784 t-d8f196 t-e6d39a t-6dc7ad t-c0443c
covers: t-b9dd2c t-652fef t-65c1cc t-f18284 t-083ef6
covers: t-6fa33e t-8d2ea4 t-323272 t-6e01c5 t-34f276
covers: t-2be0cd t-8b9c17 t-7c5af5 t-ebb697 t-4c3c91
covers: t-f62af2 t-1aeb75 t-3d93e1 t-f8f267 t-7ae304
covers: t-702b00 t-0971a7 t-4a8b2f t-8faa7b t-fe3043
covers: t-cbc2f6 t-7f2690 t-db9c76 t-f062a1
covers: t-5d795a t-c41e92 t-37d009 t-11be69
covers: t-98684c t-c37d70 t-8d3b2c t-551dc8
covers: t-467be0 t-437f57 t-586efe t-f18a19
