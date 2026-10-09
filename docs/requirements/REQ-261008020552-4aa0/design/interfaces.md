---
doc: interfaces
requirement_id: REQ-261008020552-4aa0
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 接口契约：task_amend 扩 op + 两个工具面的描述结构

> 本批**零对外接口签名变更**（无 HTTP 路由改动、无既有入参/返回改动）；
> 唯一的「新接口面」是 task_amend 的两个新 op。契约按 design/architecture.md §3 定死后落地。

## 接口清单 <!-- serves: FR-1, FR-2 -->

| 接口 id | 形态 | 契约 | serves |
|---------|------|------|--------|
| IF-1 | 工具 `reqboard_task_amend`（op=archive） | 入参 `{op:'archive', docs:[{kind,path}], reason, requirement_id?}`；返回 = 原 `reqboard_archive_amend` 键集 + `op` 回显（`success/requirement_id/appended/skipped/status/note`）；错误码沿用 `REQBOARD_INVALID_INPUT` / `REQBOARD_BAD_STATUS` / `REQBOARD_NOT_BOUND_TO_WINDOW` / `REQBOARD_NO_BOUND_REQ` / `REQBOARD_STORE_INCONSISTENT` | FR-1 |
| IF-2 | 工具 `reqboard_task_amend`（op=interruption） | 入参 `{op:'interruption', reason, requirement_id?}`；返回 = 原 `reqboard_note_interruption` 键集 + `op` 回显（`success/requirement_id/interruption{at,reason,stage,pendingAction,tool}/note`）；错误码沿用 `REQBOARD_INVALID_INPUT` / `REQBOARD_NOT_BOUND_TO_WINDOW` / `REQBOARD_NO_BOUND_REQ` | FR-2 |
| IF-3 | 既有 3 op（op=refs/adopt/chain） | 入参、返回体、必填集**逐字不变**（只新增 op 枚举值，不新增必填约束） | FR-1 |
| IF-4 | 描述面（task_move / submit 参数 schema） | **无签名变更**：键名/类型/必填/枚举/`additionalProperties` 逐字不动，只改 `description` 字符串 | FR-3, FR-4 |

## IF-1 / IF-2 的行为等价约束 <!-- serves: FR-1, FR-2 -->

| 约束 | 取值 | 判据 |
|------|------|------|
| 挂起确认守卫（`assertNoPendingConfirm`） | op=archive 保留（原工具有此前置）；op=interruption **跳过**（原工具无此前置）；其余 op 维持先守卫后分派 | tests/task-amend-tool.test.ts「守卫按 op 分流」 |
| 阶段越界提示（boundary-guard） | op=archive / op=interruption 全阶段放行（对齐收编前：一个不在表内、一个表内 undefined） | design/architecture.md §3.4；`TASK_AMEND_OP_STAGES` |
| 壳层必填点名 | archive 缺 `docs`/`reason`、interruption 缺 `reason` → `REQBOARD_INVALID_INPUT` 并点名该 op 必填集 | tests/task-amend-tool.test.ts |
| 用例复用 | `amendArchiveManifest` / `noteInterruption` 判定、幂等、留痕结构零改动 | git diff（仅 D-3 文案前缀 + tool 留痕字面量） |
| 超时 | 两者均 `LIMITS.timeoutWriteMs`（与收编前一致） | 同名常量 |

## D-3 有意偏差（唯一的文案/留痕面改动） <!-- serves: FR-1, FR-2 -->

| 位置 | 收编前 | 收编后 |
|------|--------|--------|
| `AmendArchiveManifest` 8 处 reject 前缀 | `reqboard_archive_amend 未执行：…` | `reqboard_task_amend(op=archive) 未执行：…` |
| `NoteInterruption` 3 处 reject/fmt 前缀 | `reqboard_note_interruption 未执行：…` | `reqboard_task_amend(op=interruption) 未执行：…` |
| `interruption.tool` 留痕（新记录） | `reqboard_note_interruption` | `reqboard_task_amend`（历史记录不改写） |

错误码、触发条件、抛出路径、幂等性与台账结构全部不变。
