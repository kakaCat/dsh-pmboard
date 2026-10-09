# 交付证据（REQ-261008020617-088f）

> 逐条是**命令 + 读数**，可按行复跑。时点：2026-10-08 实现期（工作树有他人在途改动，见文末）。

## 一、验收锚点

| # | 命令 | 读数 |
|---|---|---|
| 1 | `npx vitest run tests/layer-boundary.test.ts` | 12 用例 **1 失败**：application/ 越界用例**已转绿**（改前 2 失败）；剩的是边界外 tools/http |
| 2 | `grep -rn "node:\|@deepseek-ai/" src/application` | 真 import **0 处**（12 处命中全在文档注释里） |
| 3 | `npx tsc --noEmit` | 退出码 **0**、0 错误 |
| 4 | 层门越界条数逐卡读数 | 15 →（t1）9 →（t3/t4）7 →（t5）5 →（t6）1 →（t7）**0** |

## 二、分工况用例

| # | 命令 | 读数 |
|---|---|---|
| 5 | `npx vitest run tests/unit/gate` | 3 文件 9 用例全绿（断言未改） |
| 6 | `npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/compat-regression.test.ts tests/unit/query-run-status.test.ts` | 46 用例全绿 |
| 7 | `npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts tests/apply-wiring.test.ts` | 23 用例全绿 |
| 8 | `npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts tests/workspace-root-resolution.test.ts` | 37 用例全绿（含 6 条新增等价断言） |
| 9 | `npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts` | 21 用例全绿（日志双写链路） |
| 10 | `npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts` | 22 用例全绿 |

## 三、全量与知识层

| # | 命令 | 读数 |
|---|---|---|
| 11 | `pnpm test` | 608 文件 / 7179 用例：**9 文件 15 用例失败**，逐条归因全在守恒台账内（doc-sync / e2e-triad-gate / interruption ×3 / layer tools-http / message-hygiene ×3 / size-budget / t7-legacy / template-address ×2 / triad ×2） |
| 12 | `npx tsx scripts/kb-build.mts --write` + `pnpm kb:check` | code-map **零漂移**；`kb:check` 仍有 1 项 K14 失败：2 条不可判定条目（kb-0064 / kb-0065）**属他人既有条目**，非本需求新增 |

## 四、证伪与等价实测（临时脚本，跑完即删）

| # | 手法 | 读数 |
|---|---|---|
| 13 | 三门迁移前后运行时对照 | 15 条断言**全 OK**（fail 消息/code/gaps/pass/rtm_not_found/畸形/空清单） |
| 14 | 写入 1 条过期豁免 + `frozenCount=1` | 专属用例点名「过期豁免」、形状用例点名「超硬上界 0」；还原即回绿 |
| 15 | `HostFsPort` 六方法契约冒烟（临时根） | cwd=宿主 cwd、isDirectory 三态、原子写不留 `.tmp-*`、坏 JSON 不抛 |

## 五、环境申报（读数怎么读）

- 工作树在实现期有他人在途改动（>260 文件），失败集合会随他人在写而漂移；故判据取"**本次可归因失败 = 0**"
  与"失败集合 ⊆ 守恒台账"两条，而不是"整树全绿"。
- 未做 git 提交（理由见 `reviews/verification-review.md` 偏离 #6）。
