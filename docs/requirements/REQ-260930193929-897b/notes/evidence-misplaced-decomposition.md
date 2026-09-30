# REQ-260930193929-897b 拆分清单（decomposition）

> 自动生成于 reqboard_decompose：计划任务表 ↔ 落库任务 id 对照

## §1 RTM 覆盖对照表（根编号 ↔ 任务卡）

| 根编号 | 计划 key | 任务 id | 标题 | 状态 |
|--------|---------|--------|------|------|
| —（未声明接收任何条款） | t1 | t-be2369 | 把「按哪个工作区读文档」收敛成一个统一入口 | todo |
| —（未声明接收任何条款） | t2 | t-b9d8e9 | 让七个读文档的闸门都走这个统一入口 | todo |
| —（未声明接收任何条款） | t3 | t-211525 | 用正反两组测试锁住：该放行的放行、该拦的照拦 | todo |
| —（未声明接收任何条款） | t4 | t-671de7 | 确认老需求与看板路径不受影响，并写好回滚方式 | todo |

## §2 任务清单

| 计划 key | 任务 id | 标题 | 阶段 | 端侧 | 依赖 | 验收标准 |
|---------|--------|------|------|------|------|---------|
| t1 | t-be2369 | 把「按哪个工作区读文档」收敛成一个统一入口 | implement | backend | - | 1) 既有 workspace-root 相关用例全绿，且写侧行为与改造前逐字一致（无断言变化）；2) `rg -n "applyRequirementWorkspaceRoot" src/` 显示该函数已导出且写侧走委托；3) `pnpm typecheck` 无新增错误。 |
| t2 | t-b9d8e9 | 让七个读文档的闸门都走这个统一入口 | implement | backend | t-be2369 | 1) 定向用例（会话根 ≠ 需求根、文档在需求根）经四条通道均放行、无 gate_failure；2) `rg -n "checkDesignCompletenessGate|checkDesignDecompositionGate" src/` 的每个调用点在读盘前都有校正调用；3) `pnpm typecheck` 无新增错误。 |
| t3 | t-211525 | 用正反两组测试锁住：该放行的放行、该拦的照拦 | test | backend | t-b9d8e9 | 1) `pnpm vitest run tests/design-gate-workspace-root.test.ts` 全绿，且其中反向用例断言 gate_failure.code = design_doc_incomplete 且缺口含「requirement.md 不存在」；2) 用例中断言「读盘前根确实等于需求根」，使替身空过变成明确失败；3) 全量 `pnpm vitest run` 与基线对比无新增失败（本仓存在存量失败，须先记基线数再比对）。 |
| t4 | t-671de7 | 确认老需求与看板路径不受影响，并写好回滚方式 | implement | backend | t-b9d8e9 | 1) 存量需求（无 workspaceRoot）用例通过，行为与修复前逐字一致；2) 看板通道用例通过（不依赖「最后一次会话残留的根」）；3) `pnpm typecheck` 通过；4) 回滚步骤可执行：还原 5 个源文件 + 删除新增测试文件，无数据迁移与残留状态。 |
