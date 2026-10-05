# t13 兼容与回归收口证据（REQ-261003204149-1e80）

> 本卡无新代码，只交**证据**：四项验收的原始结果 + 兼容性与回滚路径的说明。

## 一、四项验收（全部通过）

| # | 验收项 | 命令 | 结果 |
|---|---|---|---|
| ① | 全量回归不高于现场基线 | `npx vitest run` | **98 failed / 3418 passed** ＝ 现场基线 98 failed（双向差集 ∅；通过数 +62 全是本需求新增用例） |
| ② | 类型检查无新增 | `npx tsc --noEmit` | **150 = 基线 150** |
| ③ | 构建可出包 | `pnpm build` | 退出码 0；`✔ Build complete`；`[verify-client] OK  bundle=337856 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| ④ | 代码回滚演练 | 暂存本轮全部改动 → `npx vitest run tests/queue` → 恢复 | **122 passed**（回滚态下既有队列用例全绿）；已恢复（`stash pop` 成功，新增文件均在位，复跑 move-rollback/rollback-domain 全绿） |

## 二、兼容性（面向旧数据与旧调用方）

| 面 | 兼容方式 |
|---|---|
| 台账字段 | 只新增**可选**字段 `RequirementRecord.rollback` 与 `TaskRecord.reworkOf`；旧台账读入即 `undefined`，行为与改造前一致 |
| 迁移 | **无回填、无迁移脚本**——不为历史需求猜"是否被回退过" |
| 工具入参 | `reqboard_move` 的入参一字未改（仍是 `requirement_id` / `to` / `reason`） |
| 回执 | 前进方向**整体省略** `rollback` 键（不是发 `null`）；既有消费方零改动（面板 / api-client 回归 43 例绿） |
| 看板接口 | `POST /req/move` 的请求体形状不变；响应仍在 `data` 上展开完整需求记录，仅多一个 `rollback` 键 |
| 人工门 | 五道门**数量与前进语义一字未改**；只放宽"回退方向" |

## 三、代码回滚路径

- **整轮回滚**：还原本需求涉及的 14 个源文件（3 个新增 + 11 个修改）与 10 个测试文件即可；
  新增的两个台账字段被旧代码忽略，**已写入的数据不会损坏台账**（演练已证：回滚态下 `tests/queue` 122 例全绿）。
- **单点可逆**（需要"只退一半"时）：
  - 产物门豁免 = `artifact-gates.ts` 一行 → 还原即恢复"回退前必须先补齐 from 阶段产物"；
  - 守卫放行 = `DecomposeSpec.ts` 一行 → 还原即恢复"已有未取消任务一律拒绝重拆"；
  - 人工门 = `RequirementStatus.ts` 一行（把 `implementing>design` 放回 `HUMAN_ONLY`）→ 恢复"回退须人点"。
- **范围外 hotfix 亦可单独回滚**：`CaptureTool.ts` / `SubmitTool.ts` 各一处 schema 声明，
  还原后退回到"每次立项/提交报 invalid output"的旧状（不建议）。

## 四、本需求涉及的文件清单（供复核）

**新增（4）**：`domain/requirement/RollbackSpec.ts`、`application/internal/rollback.ts`、
`application/internal/rollback-revocation.ts`、`application/internal/rollback-tasks.ts`

**修改（11）**：`domain/requirement/RequirementStatus.ts`、`domain/workflow/DecomposeSpec.ts`、
`shared/protocol.ts`、`application/internal/artifact-gates.ts`、
`application/use-cases/MoveRequirement.ts`、`application/use-cases/Decompose.ts`、
`http/routers/requirements.ts`、`tools/MoveTool/MoveTool.ts`、
`tools/CaptureTool/CaptureTool.ts`（范围外 hotfix）、`tools/SubmitTool/SubmitTool.ts`（范围外 hotfix）

**测试（10）**：`rollback-domain` / `rollback-revocation` / `rollback-tasks` / `move-rollback` /
`artifact-gates` / `decompose-tools` / `output-contract` / `domain/subtask-status` /
`domain/requirement-status` / `tools-status`
