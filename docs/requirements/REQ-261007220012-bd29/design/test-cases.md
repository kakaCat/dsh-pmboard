# 测试用例：工具面精简 27 → 21（REQ-261007220012-bd29）

> 每条 FR 的判据 → 测试文件 / 命令 → 期望读数。执行留痕见 `../tests/evidence.md`。

## TC-1 删除弃用别名（FR-1） <!-- serves: FR-1 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-1a 活引用零命中 | `grep -rl "reqboard_task_execute\|TaskExecuteTool\|defineTaskExecuteTool" src tests README.md \| grep -v '^tests/fixtures/'` | 无输出（冻结点夹具豁免） |
| TC-1b 目录与登记面一致 | `npx vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` | 4+7 例全绿；目录集合 == registry == 注册名 |
| TC-1c 契约回归 | `npx vitest run tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts` | 全绿（DELEGATING_ALIASES 清零后仍无缺 render 工具） |

## TC-2 取回执并入 ask_confirm（FR-2） <!-- serves: FR-2 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-2a 入参在位 | `npx vitest run tests/ask-confirm-prompt.test.ts` | ask_confirm schema 含 ticket；prompt 不再指向旧工具 |
| TC-2b 未知/跨窗口 ticket | `npx vitest run tests/ask-confirm-pending.test.ts -t TC-8` | 抛 `REQBOARD_UNKNOWN_TICKET` |
| TC-2c 取回执链路 | `npx vitest run tests/ask-confirm-pending.test.ts tests/pending-guard-integration.test.ts` | 未作答 confirmed=false / 已作答 confirmed+advanced / 被中止可查 |
| TC-2d 拦截面契约 | `npx vitest run tests/confirm-pending-guard.test.ts tests/pending-guard.test.ts` | 恢复路径文案指向 ask_confirm(ticket) 且不含「重新发起」 |

## TC-3 查询面 4 → 2（FR-3） <!-- serves: FR-3 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-3a run 节形状 | `npx vitest run tests/run-status-tool.test.ts` | 有 checkpoint → runId/stepIndex/jobStatus；无 → runId 整键省略且过自身 schema |
| TC-3b 单卡展开 | `npx vitest run tests/task-status-ledger.test.ts tests/task-status-integration.test.ts` | `task.{status,progress,run,report,workflow}`；`task.status='not_found'` 且不编码 |
| TC-3c 互斥 | 同上（FR-3 新增例） | task_id + parent_id 同传 → 错误含 REQBOARD_INVALID_INPUT 且说明互斥 |
| TC-3d 父子模式不回归 | `npx vitest run tests/task-tree.test.ts` | 原父子结构返回逐字一致 |

## TC-4 修缮簇单入口（FR-4） <!-- serves: FR-4 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-4a 壳层契约 | `npx vitest run tests/task-amend-tool.test.ts` | op 必填/枚举受控；缺必填点名该 op 必填集；渲染按 op 分派 |
| TC-4b op=adopt 等价 | `npx vitest run tests/adopt-task.test.ts` | 补归属/改挂/十一条拒绝条件逐条同旧 |
| TC-4c op=chain 等价 | `npx vitest run tests/regenerate-chain.test.ts` | 只读诊断与真补链同旧 |
| TC-4d op=refs 等价 | `npx vitest run tests/reqboard/backfill-task-refs.test.ts tests/receive-mark.test.ts` | 全量替换 / 幂等 / RTM 同步同旧 |

## TC-5 目录改名（FR-5） <!-- serves: FR-5 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-5a 目录 | `ls src/tools/TaskRunTool; ls src/tools/AdvanceTool` | 前者存在、后者不存在 |
| TC-5b 登记面 | `grep -n "key: 'TaskRun'" -A3 src/tools/registry.ts` | key/dir/factoryFile 三者对齐 |
| TC-5c 不变量 | `npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/task-run-contract.test.ts` | 全绿（工厂扫描键 defineTaskRunTool） |
| TC-5d 错误码清单随动 | `npx tsx tests/drill/refresh-error-code-inventory.mts` + 三件套 | site.file 指向新路径后全绿 |

## TC-6 schema 单源化（FR-6） <!-- serves: FR-6 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-6a 枚举单源 | `grep -rn "\['fork', 'create'\]" src/tools \| wc -l` | 1 |
| TC-6b 属性表单源 | `grep -rn "标题是否写定" src/tools \| wc -l` | 1 |
| TC-6c 行为不变 | `npx vitest run tests/open-window-tool.test.ts tests/open-window-inherit.test.ts` | 全绿 |

## TC-7 同步面与全量（FR-7） <!-- serves: FR-7 -->

| 用例 | 命令 | 期望 |
|------|------|------|
| TC-7a 五处口径 | registry / 磁盘目录 / register / README 行数 / package.json | 全部 21 |
| TC-7b README 面 | `npx vitest run tests/readme-tool-face.test.ts` | 表头条数 == 表内行数 == 工具名集合 == 登记面 |
| TC-7c 契约矩阵 | `npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/tools-schema.test.ts tests/arg-guidance.test.ts tests/error-code-matrix.test.ts` | 9 files / 150 tests passed |
| TC-7d 类型 | `npx tsc --noEmit -p tsconfig.json` | error TS 计数 0 |
| TC-7e 全量回归 | `pnpm test` | 与上一批差分**新增红 0**；失败文件 ∩ 本批触碰测试 = 空集 |
