---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 架构设计（REQ-261007160829-1991）

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4`

把「验收结论不可解释」这一族缺陷收敛成一条**判据单点 + 三个落点**：

- **判据单点**（既有，不改松紧）：`hasResultAnchor` —— 结果文本是否带可核验锚点（命令 / 路径 / 明确计数）。
- **落点 ① 预防**（FR-1）：在**提交动作**处用同一判据拦下不合格结果，不让它进验收单。
- **落点 ② 解释**（FR-2）：在**降级那一刻**把原因写进台账，并让两条通道的回执按真实原因说人话。
- **落点 ③ 当场拒绝**（FR-3）：人**自填**且无锚点的文本不静默降级，改为拒绝并说明补什么。
- **形态前置**（FR-4）：弹框第 2 问题干把形态要求写出来，让填的人一开始就知道。

关键取舍：**不改判据本身**（词表松紧需要台账数据支撑，属另一条需求），只改它的**结论可见性**与**责任落点**。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

| 文件 | 改动 | serves |
|---|---|---|
| `src/domain/workflow/AcceptanceSheetSpec.ts` | 抽出 `judgePassedVerdict` 纯函数（降级判定 + 原因）；`applyVerdicts` 写原因、对人工自填无锚点抛域错误；新增 `isHumanAuthored` | FR-2, FR-3 |
| `src/domain/workflow/ResultBinding.ts` | `ResultMatchReport` 增 `unanchored` 桶；`matchStructuredResults` 填该桶 | FR-1 |
| `src/application/use-cases/SubmitVerification.ts` | `bindStructuredResults` 增「锚点不合格」拒绝分支（新错误码） | FR-1 |
| `src/application/use-cases/AcceptSheet.ts` | 第 2 问题干附形态要求；回执 `note` 改用单点文案函数 | FR-2, FR-4 |
| `src/http/routers/verdicts.ts` | HTTP 回执 `note` 改用同一单点文案函数 | FR-2 |
| `src/shared/protocol.ts` | `VerificationItem.unverifiedReason?` 字段 | FR-2 |
| `src/domain/workflow/VerdictNotices.ts`（新建） | 两条通道共用的回执文案单点 + 形态提示常量 | FR-2, FR-4 |

**不动的文件**：`src/client/**` 一律不动（本轮 sides 只有 backend，看板渲染新字段列入需求「边界」）。

## 数据结构变更 `serves: FR-2`

只增一个**可选**字段 `unverifiedReason`（取值 `blank_pass` / `anchor_missing`），无 DDL、无版本升级。详见 `data-model.md`。

## 接口变更 `serves: FR-1, FR-2, FR-3`

- 工具入参形态**零变更**（`results[]` / 裁决入参都不加字段）。
- 变的是**错误语义**（提交侧新增一种拒绝）与**回执文案**（按真实原因分派）。详见 `interfaces.md`。

## 依赖关系 `serves: FR-1, FR-2, FR-3, FR-4`

- 提交侧（FR-1）与裁决侧（FR-2/FR-3）**共用同一个** `hasResultAnchor`：这是本设计的核心约束，两处各写一份必然漂移（本仓既有教训）。
- 文案单点（FR-2/FR-4）被弹框与 HTTP 两处 import：删改一处即两处同步，由单元用例钉住。
- 无新增外部依赖、无网络调用、无新增配置项。

## 边界与前提 `serves: FR-1, FR-2, FR-3`

- 需求阶段裁定 D-1（就地续作、归属本窗口）、D-2（采信实测根因）、D-3（范围 = ①+② 且限定服务端）是本设计的**前提**；D-2 是本设计存在的理由——立项时记的「多问只渲染第一问」被实测推翻，设计不得针对它做任何改动（不碰宿主问答通道、不合并两问）。
- 存量验收单不回填（`unverifiedReason` 缺失即「老数据」）。

## 错误处理 `serves: FR-1, FR-3`

- 提交侧：新增拒绝码 `REQBOARD_RESULT_UNANCHORED`，**台账零改动**（与其他 results 拒绝同址同序）。
- 裁决侧：人工自填无锚点 → 域错误 `REQBOARD_VERDICT_ANCHOR_MISSING`，同样零改动（`applyVerdicts` 抛错 → 调用方 `reject`，写盘发生在计算之后）。
- 判据纯函数抛错（理论不可能）→ 如实报错，不吞成「未复核」。

## 文档更新清单 `serves: FR-1, FR-2`

| 文档 | 更新点 |
|---|---|
| `docs/architecture/project-manual.md` | 验收通道新增「降级原因」一节（收工前按归档纪律补） |
| `docs/known-issues.md` | 记「无锚点结果曾被静默降级」的坑与现行防线（归档阶段申报去向） |
