# S4 联调证据（t-9e29b1 · REQ-261007220012-bd29 FR-4）

日期：2026-10-07 · 阶段：联调（integrate）

## 三 op 请求样例 → 期望 → 实际

| op | 请求样例 | 期望 | 实际 |
|----|----------|------|------|
| refs | `task_amend({op:'refs', task_id, requirement_refs:['FR-1','FR-2'], reason})` | 全量替换 + RTM 同步 + 需求评论留痕；值同不写盘 | ✓（backfill-task-refs 用例逐条通过） |
| refs（幂等） | 同值重放 | `changed=false`，不写盘 | ✓ |
| adopt | `task_amend({op:'adopt', task_id, parent_id, stage_kind})` | parentId/stageKind 落库、角色翻 subtask、双侧留痕 | ✓（adopt-task 10 例） |
| adopt（已有归属） | 不传 force | 拒 `REQBOARD_ADOPT_ALREADY` | ✓ |
| adopt（改挂） | `force:true` + reason | 改挂并记原父卡 | ✓ |
| chain（诊断） | `task_amend({op:'chain'})`（dry_run 缺省 true） | 只读链体检（chain_status/expected/existing/missing），不写台账 | ✓（regenerate-chain 用例） |
| chain（补链） | `task_amend({op:'chain', dry_run:false, task_id, reason})` | 只补缺失阶段；已有子卡不动 | ✓ |
| 缺必填 | `task_amend({op:'refs', task_id})` | `REQBOARD_INVALID_INPUT` 且点名 requirement_refs/reason | ✓（task-amend-tool 用例） |
| 缺 op | `task_amend({task_id})` | 绑定层拒（required:['op']） | ✓ |

## 契约面

```
registry 21 / 磁盘工具目录 21 / src/index.ts register 21        （I-1/I-2）
src 内旧三工具名零命中（含用例消息、指路文案、阶段映射、长文本表）
apply-wiring + registry-log + output-contract + tools-dispatch 全绿（TaskAmend 扫三段用例的响应字面量）
```

命令与结果：

```
$ npx vitest run tests/task-amend-tool.test.ts tests/adopt-task.test.ts tests/regenerate-chain.test.ts \
      tests/reqboard/backfill-task-refs.test.ts tests/apply-wiring.test.ts tests/registry-log.test.ts \
      tests/output-contract.test.ts tests/tools-dispatch.test.ts
→ Test Files 8 passed (8) / Tests 79 passed (79)，exit 0
```
