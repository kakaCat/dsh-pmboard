# 接口设计：工具面精简 27 → 21（REQ-261007220012-bd29）

> 本文件是 `architecture.md` §接口契约 的**执行视角复述**（同一份契约的两处呈现）：
> 逐条给出「调用形状 → 返回形状 → 失败形状」，供实施与验收直接对照。
> 契约细节与理由见 `architecture.md`；本文件不引入新契约。

## I-1 ask_confirm（含 ticket 取回执模式） <!-- serves: FR-2 -->

```
调用：reqboard_ask_confirm({ ticket })                      // 取回执模式（原独立回执工具的唯一入参）
      reqboard_ask_confirm({ target, kind, question?, … })  // 发起确认（弹框/文字证据路径）
分派：evidence 非空 → confirmArtifact；否则 ticket 非空 → confirmReceipt；否则 → askConfirm
返回：success / confirmed / advanced / from / to / requirement_id /
      user_choice? / user_feedback? / note / pending? / ticket? / interrupted? / fallback? …
      —— 取回执模式**零新增键**（键集是既有 schema 的子集）
失败：未知/过期/跨窗口 ticket → REQBOARD_UNKNOWN_TICKET（用例原样）
      ticket 为空串 → 走弹框路径（不视为取回执）
兼容：不传 ticket 的调用返回体逐字不变；`target` 由 required 放宽为可选（发起路径仍由用例校验）
```

## I-2 status 的 run 节（原运行态查询工具并入） <!-- serves: FR-3 -->

```
调用：reqboard_status()                                     // 绑定自查（原零参形状不变）
      reqboard_status({ requirement_id })                   // 指定需求的运行态
      reqboard_status({ run_id })                           // 按 run_id 反查需求
返回：…（原有全部小节不变）+ run: { requirement_id, runId?, stepIndex, currentSubtaskId?,
      nextReady, jobStatus, pauseReason?, autoRun }
降级：无 active run → run.runId **整键省略**（不发 null）
     无法定位目标需求（未绑定且未传参）→ run 键**整体省略**
失败：显式点名目标需求而读失败 → 抛出（REQBOARD_REQUIREMENT_NOT_FOUND / TaskStore 未装配）
     走窗口绑定的缺省路径失败 → 省略 run 键（status 其余小节照常）
```

## I-3 task_tree 的 task_id 单卡展开（原单卡查询并入） <!-- serves: FR-3 -->

```
调用：reqboard_task_tree({ task_id })                       // 单卡展开
      reqboard_task_tree({ parent_id? , requirement_id? })   // 父子结构（原形状不变）
返回（单卡）：success / task_id / requirement_id / task: { task_id, status, progress,
              run?: { ok, stopReason, valueNonEmpty, reason? },
              report?: { summary, completedCount, filesChangedCount },
              workflow?: { at, ok, stopReason, valueNonEmpty } }
失败：卡不存在 → success=false + task.status='not_found' + error（**不编码**，判别位同旧契约）
     task_id 与 parent_id 同传 → 错误消息含 REQBOARD_INVALID_INPUT 且说明互斥
     TaskStore 未装配 → success=false + task.status='error' + 显式 error
```

## I-4 reqboard_task_amend（修缮簇单入口） <!-- serves: FR-4 -->

```
调用：reqboard_task_amend({ op:'refs',  task_id, requirement_refs, reason })
      reqboard_task_amend({ op:'adopt', task_id, parent_id, stage_kind?, reason?, force? })
      reqboard_task_amend({ op:'chain', task_id?, requirement_id?, dry_run?, reason? })
分派：assertNoPendingConfirm → executeTaskRefs / executeAdoptTask / executeRegenerateChain（用例零改动）
返回：三原工具输出键的并集 + `op` 回显
失败：缺 op → 绑定层拒（required:['op']）
     未知 op → REQBOARD_INVALID_INPUT（壳层兜底）
     op 与必填项不匹配 → REQBOARD_INVALID_INPUT，message **点名该 op 必填集**
```

## I-5 公共 schema 常量（S6） <!-- serves: FR-6 -->

```
src/tools/shared.ts:
  export const WINDOW_MODES = ['fork', 'create'] as const          // 唯一定义
  export function windowInheritanceSchema(description?: string)    // 每次返回新对象
使用：OpenWindowTool / HandoffTool 的 mode enum 与 inheritance 子 schema 均引用之；
     两工具各自的 description 语义保留（公共函数收可选 description）。
```
