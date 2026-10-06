---
req_id: REQ-261005154851-8512
requirement_refs: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 拆分计划（REQ-261005154851-8512）

> 目标：让立项时选的「提示词难度」在**每条注入路径上算数**——expert/advanced 不再只拿到轻档纪律。
> 做法：三段落地——① 契约补一枚字段（同步缝窄投影 `RequirementFacts.promptDifficulty`）
> ② 三处取词调用点接上（每轮系统提示词 / dive 采集半 / 节点隔离输入包），统一走既有映射与取词入口
> ③ 兼容兜底 + 探针 + 实机留痕取证。
> 容量：缺省 16 DU；`detailUnits = files×1 + anchors×0.5 + chars/2000`（单一源 `src/domain/limits.ts`）。**4 张卡均在容量内**。

## 改动盘点（对照设计文档逐份核对） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 类型 | 路径 | 设计出处 |
|---|---|---|
| 修改 | `src/domain/requirement/RequirementSummary.ts`（`RequirementFacts` 加可选 `promptDifficulty`；`factsOf` 多投影一枚键） | data-model §字段级契约 |
| 修改 | `src/application/internal/capture-section.ts`（取词调用传 `declaredDifficulty`） | interfaces §三处调用点 ① |
| 修改 | `src/application/dive/session-driver.ts`（同上，并补 requirement 文本；只留痕不投递的性质不变） | interfaces §三处调用点 ② |
| 修改 | `src/application/use-cases/IsolateNodeContext.ts`（显式 `difficulty` 优先 → 否则按声明映射） | interfaces §三处调用点 ③、architecture §决策 |
| 不动 | `src/domain/prompt/difficulty-mapping.ts`、`src/application/gate/handlers/h3-inject.ts`、`src/application/internal/injection-log.ts` | architecture §三个取词调用点的现状 |
| 新增 | `tests/injection-difficulty.test.ts`（T-01~T-11） | test-cases §用例表 |
| 新增 | `scripts/injection-difficulty-probe.mts`（同文本两种声明的取词对比） | test-cases §探针 |
| 新增 | `docs/requirements/REQ-261005154851-8512/evidence/injection-difficulty.md`、`.../evidence/compat-baseline.md` | test-cases §取证与验收口径 |
| 修改 | `docs/knowledge/code-map.md`、`docs/knowledge/code-map.symbols.tsv`（**生成物**：改 src 后重生成） | backend §静态门禁 |
| 删除 | 无 | — |
| 不动 | `src/client/**`（`sides=[backend]`）、立项弹框的四问与 `CAPTURE_DEFAULTS` | requirement §边界 |

## 任务表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| key | 标题 | 层 | FR | 依赖 | DU |
|---|---|---|---|---|---|
| t1 | 契约先行：同步缝带上难度声明 | 契约/数据 | FR-1 | — | 3.95 |
| t2 | 三处接线：让声明难度在每条注入路径上算数 | 接线 | FR-2, FR-3, FR-4 | t1 | 8.10 |
| t3 | 探针与实机留痕取证 | 验收 | FR-5 | t2 | 4.70 |
| t4 | 兼容卡：无声明与脏数据行为逐字不变 | 兼容 | FR-1, FR-2 | t2 | 4.65 |

## 依赖图

```
t1 契约 ──▶ t2 三处接线 ──┬──▶ t3 探针 + 实机取证
                          └──▶ t4 兼容与基线（可并行）
```

## 容量核算（逐卡）

| key | files | anchors | chars | detailUnits | 上限 | 判定 |
|---|---|---|---|---|---|---|
| t1 | 2 | 3 | 900 | 2 + 1.50 + 0.45 = **3.95** | 16 | 内 |
| t2 | 4 | 6 | 2200 | 4 + 3.00 + 1.10 = **8.10** | 16 | 内 |
| t3 | 2 | 4 | 1400 | 2 + 2.00 + 0.70 = **4.70** | 16 | 内 |
| t4 | 2 | 4 | 1300 | 2 + 2.00 + 0.65 = **4.65** | 16 | 内 |

无超容量卡 ⇒ 不需要 `⚠️超容量(建议N批)` 标记。

## 覆盖对照表（需求条款 ↔ 接收任务） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1, t4 |
| FR-2 | t2, t4 |
| FR-3 | t2 |
| FR-4 | t2 |
| FR-5 | t3 |

## 迁移与兼容（t4 承接） `serves: FR-1, FR-2`

| 面 | 口径 |
|---|---|
| 存量数据 | **无迁移**：`promptDifficulty` 早已在台账里，本需求只补同步缝投影；无声明者读侧容错 |
| 旧调用方 | 三处调用点只多传一个**可选**入参；缺省时取词结果与改造前**逐字相同**（同分片 id） |
| 脏数据 | `'EXPERT'` / `' expert '` / `''` / `null` 一律按未声明处理，**不抛错、不猜档** |
| 历史注入 | **不追溯**：已注入过轻档的回合不补发 |
| 回滚 | 回退构建即可（零本地写入、零 schema 变更）；回滚后注入档位回到改造前 |

## 验收口径（总） `serves: FR-5`

```bash
# 主用例集（T-01~T-11：投影两形态 / 四档映射 / 冲突取重 / 无声明逐字不变 / 三处口径一致 / 留痕）
npx vitest run tests/injection-difficulty.test.ts

# 探针（带声明 vs 不带声明，退出码 0 是唯一判据）
npx tsx scripts/injection-difficulty-probe.mts

# 既有语义回归（四档映射 / 门禁套件 / 类型）
npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts tests/decision-gates.test.ts
npx tsc --noEmit
```

通过标准：主用例集全绿；探针退出码 0；既有映射与门禁套件零新增失败；`npx tsc --noEmit` 0 错误；
实机留痕（本需求自己就是 expert 标本）出现 `heavy` 分片与「声明难度 → 取词档」依据句，
记录落 `docs/requirements/REQ-261005154851-8512/evidence/injection-difficulty.md`。
