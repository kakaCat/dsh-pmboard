# 测试证据：收口读数（REQ-261008004324-81df）

> 采集时点：2026-10-08；工作树 HEAD `c49fd5e` + 他窗在飞改动。全部为实测输出摘要，可直接复跑。

## 一、全量读数（改前 → 改后）

```bash
pnpm test
# 开工前：Test Files 37 failed | 568 passed | 3 skipped (608) · Tests 67 failed | 7071 passed
# 收口后：Test Files 12 failed | 593 passed | 3 skipped (608) · Tests 21 failed | 7138 passed | 27 skipped (7186)
```

**剩余 21 条逐条归属**（12 个文件）：

- **另案 7 文件 / 11 用例**：`interruption-checkpoint` 3、`triad-gate` 2、`template-address-injection` 2、
  `t7-legacy-tolerance` 1、`failure-handling` 1、`e2e-triad-gate` 1、`doc-sync` 1。
- **B 类 5 文件 / 10 用例**（范围外，N1）：`message-hygiene` 3、`layer-boundary` 3、
  `live-tasks-single-source` 2、`size-budget` 1、`project-scope` 1。

**本需求 28 个目标文件**：25 个全绿；3 个（`triad-gate` / `e2e-triad-gate` / `template-address-injection`）
只剩上表列出的另案臂，与卡面既定验收（「放行类转绿、缺三要素类保留」）一致。

## 二、仓库门读数

```bash
npx tsc --noEmit -p tsconfig.json      # → exit 0，无输出
pnpm kb:check                          # → exit 1（见下）
```

`pnpm kb:check` 的三段与逐项：

| 项 | 读数 | 是否本需求引入 |
|---|---|---|
| kb-build --check | 符号 3394 条 · **生成物与库内一致（零漂移）** | 否（本需求关心的段为绿） |
| conventions-sync --check | 覆盖度与清单一致（零缺口、零漂移） | 否 |
| K1 index-chars | ❌ `INDEX.md` 10669 > 8000 chars | **否**：HEAD 版已 16624 chars（改前即红） |
| K3 conventions | ❌ `conventions.md` 223 行 > 200 | **否**：该文件与 HEAD 逐字节相同 |
| K14 不可判定 | ❌ 新增 2 条：kb-0064、kb-0065 | **否**：`unverifiable.baseline.txt` 与 HEAD 相同 |
| K7 / K9 / K5 / K10… | ✅ 零漂移 / 符号 3394 = 源码 3394 / 条目 71 / 覆盖 21 项 | — |

## 三、基线（回归集合差）与回滚

```bash
npx tsx scripts/test-baseline.mts --refresh
# → [采集] vitest 失败 23 条 / 共 7186 用例；写入 failures.txt（23 行）与 test-baseline.md（刷新历史 +1 行）

npx tsx scripts/test-baseline.mts --check
# → [差集] 新增失败 3 / 不再失败 2 ⇒ exit 1

npx tsx tests/drill/triage-baseline.mts          # 只读，脚本设计上不写盘
# → failures=23  reverse=18  other=50  并集=68（≠ 23）
#   新增未分诊 4 条 · 消失欠收敛 49 条
```

**结论与处置**：`--refresh` 只写 `failures.txt` + `md`，而仓内分诊不变量要求
`failures = reverse ∪ other`（`tests/baseline-triage.test.ts` / `tests/compat-req-261006201814.test.ts`）
⇒ 单独 refresh 会**引入 3 条新红**。仓规明确「刷分类文件是人的动作，不是脚本的」（`tests/drill/triage-baseline.mts` 头注）。
故本需求**回滚**基线两文件：

```bash
git checkout -- docs/reviews/test-baseline.md docs/reviews/test-baseline.failures.txt
npx tsx tests/drill/triage-baseline.mts    # → failures=68 = reverse 18 + other 50（不变量恢复，差集为空）
npx vitest run tests/baseline-triage.test.ts tests/compat-req-261006201814.test.ts   # → 2 passed / 18 passed
```

另有两条**顺序相关 flaky**（`tests/header-progress-e2e.test.ts`、`tests/reqboard/settings-init.test.ts`）
在多次全量跑中时红时绿 ⇒「差集为空」在本环境**不可机械达成**。

## 四、单项复跑读数（逐卡点名）

| 卡 | 命令 | 读数 |
|---|---|---|
| t-31ef1e | `npx vitest run` 3 文件 | 3 passed / 35 passed（7/7 · 19/19 · 9/9） |
| t-62c5ea | 同上 2 文件（`-t 放行`） | 放行类 3 passed；缺三要素类 3 仍红 |
| t-6056de | 同上 4 文件 + header-progress-responsive | 0/0/0/2；header-progress-responsive 22/22 |
| t-0f4ab9 | 同上 4 文件 | 4 passed / 24 passed |
| t-e1cf86 | 同上 2 文件 | 30 passed / 3 passed |
| t-734554 | 同上 2 文件 | 2 passed / 17 passed；静默 TypeError 计数 0 |
| t-effc81 | 同上 3 文件 | 3 passed / 29 passed；抖动条目连跑 8 次绿 |
| t-82178d | 同上 2 文件 | 2 passed / 11 passed |
| t-09e7b1 | 同上 2 文件 | 2 passed / 25 passed + 5 skipped（连跑 3 次一致） |
| t-eebb66 | 同上 3 文件 | 3 passed / 35 passed |
| t-79ed13 | `npx vitest run tests/skills-assets.test.ts` + 真实 tarball | 8 passed；pycache 0 / pyc 0（改前 3） |
| t-24ffdf | `grep -c '^| tests/' qualitative-ledger.md` | 44（台账 37 + 另案 7）；台账五列空列 0 |

## 五、证据文件路径

- 需求文档：`docs/requirements/REQ-261008004324-81df/requirement.md`
- 设计：`design/fix-design.md`（+ 本目录 architecture / data-model / interfaces / test-cases）
- 拆分计划：`decomposition.md`；任务卡与完工汇报：`tasks/*.md`（13 父卡 + 各段子卡）
- 定性台账与另案清单：`qualitative-ledger.md`
- 取证件（他窗移交）：`triage-evidence.md`
