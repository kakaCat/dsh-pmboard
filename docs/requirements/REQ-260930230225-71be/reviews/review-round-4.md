# 验收反馈处理记录 · 第四轮（门禁缺口关闭）（REQ-260930230225-71be）

> 本回合（Dive 自动续跑）不是用户提的画面反馈，而是**验收门禁报出的两处真实断链**。逐条记录「缺口是什么、
> 我做了什么、现在读数如何」，并给出剩余 4 项验收的处置建议。

## 1. 门禁报出的两处缺口

| 验收项 | 门禁原话 | 性质 |
|--------|----------|------|
| v4-8 E2E 覆盖 | 「**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试」 | 真缺口：确实没有跨组件跑通整链的端到端用例 |
| v4-9 追溯断链 | 「FR-1…FR-6 的 `fr_to_tests` 为空（FR→设计→任务→测试链路断裂）」 | 真缺口：RTM 里的追溯映射是空的 |

## 2. 缺口一：补一条真实的端到端用例（已关闭）

新增 `tests/header-progress-e2e.test.ts`：把 `scripts/header-progress-probe.mts` 当成被测系统整体驱动
（真实 Chrome、真实模型、真实插件 CSS、六档视口 + 降级模式），断言的是**可观察终态**：

- 探针退出码 0；
- 六行 DIAG 每行 `problems=NONE`、`rowRightOverflow=-12`（内容在标题行内）、`docOverflow=0`；
- 末行 `PROBE PASS`；
- 降级模式：5 行 DIAG、`labels=7` `links=6`（无容器语义时全量渲染）且不溢出。

实测：`./node_modules/.bin/vitest run tests/header-progress-e2e.test.ts` → **2 passed（23.4s）**。
环境依赖：需要本机 Chrome；找不到浏览器时探针按设计退出码 2，本用例**响亮失败**并给出修复指引（不静默跳过）。

## 3. 缺口二：把 FR→任务→测试的追溯链补进 RTM（已关闭）

### 3.1 断在哪（读源码定位）

`vendor/reqboard/src/rtm/decomposing-generator.ts` 的 `fr_to_tasks` = FR →(设计章节 serves)→ 任务 serves；
`accepting-generator.ts` 的 `fr_to_tests` = `fr_to_tasks` ∩ `task_to_tests`。而 `task_to_tests` 来自
测试文档里的 `## TC-N:` + `covers:` 标注。我们两处都缺：任务没有 serves（台账 requirementRefs 为空），
测试文档也没有机器可读的 TC 段。

### 3.2 补了什么

| 补在哪 | 内容 | 给谁读 |
|--------|------|--------|
| `decomposition.md` §P-3.1 | 「需求条款 ↔ **台账任务 id**」对照表（FR 单元格后紧跟 `t-xxxxxx`） | `parseDecompositionServes`（RTM 读；P-3 那张表用的是计划 key，机器读不到） |
| `tests/test-evidence.md` §七 | `## TC-1:…TC-4:` 四段，每段带 `covers:` 与 `validates:` 行（覆盖 24 张卡） | `parseTestCovers`（RTM 的 task_to_tests） |

### 3.3 重刷结果（RTM 是机器产物，必须重跑触发点）

```bash
# 用 vendor 生成器按真实触发点重刷（脚本在 /tmp，一次性）
tsx /tmp/regen-rtm.mts      # confirm:plan → submit:verification
```

| 文件 | 字段 | 现在 |
|------|------|------|
| `rtm-decomposing.yml` | `fr_to_tasks.FR-1` | `t-a463b1, t-c60f21, t-d281b6, t-7a9405, t-a4d8f7, t-b817a1`（不再为空） |
| `rtm-accepting.yml` | `fr_to_tests.FR-1` | `TC-1, TC-3, TC-5, TC-2, TC-4`（不再为空） |
| `rtm-accepting.yml` | `coverage.testing` | `24/24，rate=100` |

> 过程如实记录：第一版重刷脚本漏了 `requirementId` 字段，导致 `tasksOf` 过滤出 0 张卡、RTM 里任务列表为空——
> 已修正后重跑。**这类"脚本自己写错"的中间态没有留在仓库里**，最终 RTM 是修正后生成的。

## 4. 还剩一处「读数」问题（未擅自动已确认的需求文档）

E2E 的**读数**取自 `docs/requirements/<REQ>/requirement.md` 里「层级」列含 `E2E` 的表格行
（`src/application/internal/content-gates.ts` 的 `checkE2ECoverage`）。我们这份需求文档当初没写测试策略表，
所以即使 E2E 用例已经存在，**重新生成的验收单仍会读成「缺口」**。

- 补法：在 `requirement.md` 追加一张测试策略表（单元 / 探针 / E2E 三行）。
- **为什么本回合没做**：需求文档是**已确认产物**，按规程重写要 `reqboard_submit(kind=requirement, change_note=…)`，
  而该调用会**清掉需求产物的确认章并把下游标「待同步」**（`SubmitArtifact.ts` 第 129 行 `delete art.confirmedAt`）——
  当前正在验收，把确认章清掉会让流程回退。所以留给人工决定。

## 5. 请你在这 4 项上的处置建议

| 项 | 建议 |
|----|------|
| v4-6 兼容与回滚 | 直接验：`tsx scripts/header-progress-probe.mts --fallback` → PROBE PASS；截图在 `evidence/` |
| v4-7 需求级验收 | 直接验：交付结论与设计一致、证据齐全、无范围蔓延（本轮只补测试与追溯，未改交付行为） |
| v4-8 E2E 覆盖 | 已补 `tests/header-progress-e2e.test.ts`（2 passed）。**建议通过并注明**：「E2E 用例已补；读数为缺口是因需求文档缺测试策略表，待验收后按 change_note 规程补登记」 |
| v4-9 追溯断链 | 已在 `decomposition.md` §P-3.1 与 `tests/test-evidence.md` §七 补标注，并重刷 RTM（`fr_to_tests` 非空）。**建议通过并注明**：「标注已补 + RTM 已重刷，见 review-round-4.md §3」 |

> 如果你希望机器读数为「E2E 覆盖：有」，我可以在你验收通过后按规程补 `requirement.md` 的测试策略表
> （代价：需求产物需重新确认一次）。你点头我就做。

## 6. 本回合复跑结果

```bash
./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts   # 13 passed
./node_modules/.bin/vitest run tests/header-progress-e2e.test.ts          # 2 passed
./node_modules/.bin/tsx scripts/header-progress-probe.mts                 # 6 行 DIAG + PROBE PASS
./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback      # 5 行 DIAG + PROBE PASS
pnpm build:client                                                        # exit 0
```
