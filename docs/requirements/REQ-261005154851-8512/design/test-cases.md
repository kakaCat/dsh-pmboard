---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 测试策略与用例（REQ-261005154851-8512）

> 需求源：`requirement.md`（FR-1~FR-5）。每条用例都可跑、可证伪；命令一律给到文件级。
> 判定标准的 4 条与本文用例一一对应。

## 测试层级与载体 `serves: FR-1, FR-2, FR-3`

| 层级 | 载体 | 覆盖什么 |
|---|---|---|
| 投影单测 | `tests/injection-difficulty.test.ts`（新增） | `factsOf` 带 / 不带 `promptDifficulty` 两形态（键不出现） |
| 取词单测 | 同上文件 | 四档映射（expert/advanced→heavy；simple/standard→light）、声明与推断取重、无声明逐字不变 |
| 三处口径一致 | 同上文件 | 同一需求画面下，三处调用点算出的档位一致（heavy） |
| 探针 | `scripts/injection-difficulty-probe.mts`（新增） | 同一文本「带声明 expert」vs「不带声明」的 `routeKey` / `fragmentIds` / `difficultyReasons` |
| 回归 | 见「回归与基线」 | 难度映射既有用例、决策/内容门禁套件、同步缝摘要键集 |
| 实机 | 看板注入留痕 | 本需求自己（expert）下一轮注入留痕出现 heavy 分片与依据句 |

## 用例表（逐条可跑） `serves: FR-1, FR-2, FR-3, FR-4`

命令模板：`npx vitest run tests/injection-difficulty.test.ts -t "T-0x"`。

| 编号 | 场景 | 期望 | 命令 |
|---|---|---|---|
| T-01 | `factsOf({promptDifficulty:'expert'})` | 结果含 `promptDifficulty:'expert'` | 同上 `-t "T-01"` |
| T-02 | `factsOf({})`（存量记录） | 结果**不含**该键（`'promptDifficulty' in facts === false`） | 同上 `-t "T-02"` |
| T-03 | 声明 `expert` + 文本推断不出档 | `routeKey` 档位为 `heavy`（改造前是 `light`） | 同上 `-t "T-03"` |
| T-04 | 声明 `advanced` | 档位 `heavy` | 同上 `-t "T-04"` |
| T-05 | 声明 `standard` / `simple` | 档位 `light` | 同上 `-t "T-05"` |
| T-06 | 声明 `simple` + 文本推断为 heavy | **取重**：档位 `heavy`，且 reasons 含「冲突」「取重不取轻」语义 | 同上 `-t "T-06"` |
| T-07 | 无声明 + 文本推断不出 | `fragmentIds` 与改造前**逐字相同**（基线快照全等） | 同上 `-t "T-07"` |
| T-08 | 非法值（`'EXPERT'` / `' expert '` / `''` / `null`） | 一律按未声明：档位与"无声明"用例相同，**不抛错** | 同上 `-t "T-08"` |
| T-09 | 三处口径一致：用同一需求画面分别构造「系统提示词」「dive 采集半」「节点隔离」三路入参 | 三路取到的档位一致（`heavy`） | 同上 `-t "T-09"` |
| T-10 | 留痕：有声明时 | `difficultyReasons` 含「声明难度 … → 取词档 …」 | 同上 `-t "T-10"` |
| T-11 | 留痕：无声明且推断不出 | `difficultyReasons` 允许为空（不编造依据） | 同上 `-t "T-11"` |

## 探针 `serves: FR-2, FR-5`

```bash
npx tsx scripts/injection-difficulty-probe.mts    # 退出码 0 是唯一判据
```

| 读数 | 含义 | 断言 |
|---|---|---|
| `declared_route` | 带声明 `expert` 的 `routeKey` | 含 `heavy` |
| `declared_fragments` | 带声明的分片 id | 含 `brainstorming/heavy` 系分片 |
| `baseline_route` | 不带声明的 `routeKey` | 含 `light`（= 改造前行为） |
| `baseline_fragments` | 不带声明的分片 id | 与改造前的基线快照**全等** |
| `reasons` | 带声明时的 `difficultyReasons` | 非空且含声明档与最终档 |

## 回归与基线 `serves: FR-1, FR-5`

| 命令 | 判据 |
|---|---|
| `npx vitest run tests/injection-difficulty.test.ts` | 全绿（T-01~T-11） |
| `npx vitest run tests/difficulty-mapping.test.ts` | 全绿（四档→两档的既有语义不破） |
| `npx vitest run tests/content-gates.test.ts tests/decision-gates.test.ts` | 全绿（无声明路径的行为未被改动） |
| `npx vitest run tests/domain-summary.test.ts`（若存在） | 全绿（摘要键集未变；`promptDifficulty` 本就在 `SUMMARY_KEYS`） |
| `npx tsc --noEmit` | 0 错误 |
| `npx tsx scripts/kb-build.mts --write && pnpm kb:check` | 生成物零漂移（本需求对 kb:check 的既存红项贡献为零） |

## 判别力自证（停用即红） `serves: FR-2, FR-3, FR-4`

| 停用什么 | 哪条必须变红 |
|---|---|
| `capture-section` 的 `declaredDifficulty` 传参 | T-03（档位退回 light） |
| `factsOf` 的 `promptDifficulty` 投影 | T-01、T-03 |
| `session-driver` 的声明传参 | T-09（三处口径不一致） |
| 冲突取重分支（改回"声明优先"） | T-06 |
| 留痕依据句 | T-10 |

做法：本地临时停用 → 期望对应用例红 → `git checkout` 恢复 → 证据进验收材料。

## 取证与验收口径 `serves: FR-4, FR-5`

| 跑什么 | 看到什么算过 |
|---|---|
| 单测 + 探针 + `tsc` | T-01~T-11 全绿；探针退出码 0；`tsc` 0 错误 |
| 实机（本需求自己就是 expert 标本） | 看板注入留痕：`fragmentIds` 含 `brainstorming/heavy*`，`difficultyReasons` 含「声明难度 → 取词档」；`light` 分片不再出现 |
| 反例对照（改造前后） | 同一条需求、同一阶段，改造前留痕是 `light`、改造后是 `heavy`（两段记录同屏对照） |

实机证据（留痕截图或文字记录，含 `fragmentIds` 与 `difficultyReasons`）落
`docs/requirements/REQ-261005154851-8512/evidence/`。
