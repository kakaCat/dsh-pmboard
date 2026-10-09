---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 拆分计划：修复 reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

> 依据：requirement.md（4 条 FR）+ design/bugfix-design.md（已确认落章）。
> 目标：四处边界 bug 各自一卡独立修复（文件零交集、可并行），链尾一张总验收卡兜全量回归与 diff 盘点。

## 任务表

| 计划 key | 任务标题 | 阶段 | 端侧 | 依赖 | 承接条款 | 验收 | 工作量 |
|---------|---------|------|------|------|---------|------|--------|
| t1 | 修复 AskConfirm 否定回执 user_feedback 条件展开（FR-1） | implement | backend | — | FR-1 | `grep -n "user_feedback" src/application/use-cases/AskConfirm.ts` 显示条件展开、无 undefined 路径；tests/ask-confirm.test.ts 新增用例（空反馈→键缺席、JSON 无损；有反馈→键等值）通过 | S（1 行源码 + 1 测试用例） |
| t2 | 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2） | implement | backend | — | FR-2 | `grep -n "role" src/http/routers/tasks.ts` 显示 transitionTask 带 role；新建 tests/http-task-move-role.test.ts：子卡→integrating/testing/in_review 被拒且字段零改动、存量卡老路径放行，通过 | S（2 个源码文件 + 1 新测试文件） |
| t3 | 修复需求 canceled→draft 复活边挂人工门（FR-3） | implement | backend | — | FR-3 | `grep -n "canceled>draft" src/domain/requirement/RequirementStatus.ts` 命中人工门集合；tests/domain/requirement-status.test.ts 新增用例（agent 抛 human_gate / human 放行 / system 抛 system_gate / agentNextActions 不含 draft）通过 | XS（1 行源码 + 1 测试用例） |
| t4 | 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4） | implement | backend | — | FR-4 | `grep -n -A2 "throttleMs - (now" src/domain/workflow/DoneEvidenceSpec.ts` 可见 clamp；tests/done-throttle-guidance.test.ts 新增用例（未来时间戳 ≤60s、正常历史 ≈50s 不变）通过 | XS（行内源码 + 1 测试用例） |
| t5 | 总验收：全量回归 + diff 盘点 | test | backend | t1, t2, t3, t4 | FR-1, FR-2, FR-3, FR-4 | `pnpm test` 退出码 0 且与基线比对无新增失败；`pnpm typecheck` 退出码 0；`git diff --stat` 盘点 = 5 源码文件 + 4 测试文件，无表外改动 | S（纯验证，无新代码） |

## 依赖说明

- t1–t4 文件零交集（各自源码 + 各自测试文件），可任意顺序/并行实施。
- t5 是链尾汇总卡：本身不改代码，依赖 t1–t4 全部完成才能跑「全量绿 + diff 盘点」结论；
  与四卡均无同名文件，依赖理由见落库时的 dep_reasons（时序汇总约束）。

## 边界（与已确认设计一致）

- 不做 H2 鉴权模型、H3、M1/M3/M4/M5、`canceled>archived` 门、存量非法态数据迁移、顺手重构、schema/prompt 文案改动。
- 每卡验收锚点 = grep 证据 + 单测断言，与设计文档「验收口径」节逐条对应。
