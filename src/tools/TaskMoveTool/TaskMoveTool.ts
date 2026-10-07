/**
 * TaskMoveTool（工具名 reqboard_task_move）——agent 侧任务流转（REQ-260927100007-b8ba FR-7/FR-8；
 * REQ-260927144541-0481 FR-5）。
 *
 * FR-5 两件事：
 *  ① `acceptance` 参数**真正接线**：走 amendTaskAcceptanceIfRequested（台账落库 + 卡文档同步）。
 *     此前 AmendTaskAcceptance 用例已存在但**全仓无调用点**——死通道（P9）。只传 acceptance
 *     不传 to = 仅修订不改状态（开工时读到不可执行的验收标准，先改卡再干活）。
 *  ② 返回体声明补齐：用例实际返回 version / subtasks_created / task_card，此前 output.schema 没声明
 *     （additionalProperties:false 会把回执判成 invalid output）。
 *
 * REQ-261007100513-6749 t4（FR-4/FR-5）——新增 `tasks[]` 批量入口与逐项回执：
 *  - 入参 `tasks[]`（1–20 项，每项同扁平四参语义）与扁平四参**并存**，同传时以 `tasks` 为准；
 *  - 回执 `results[]`（逐项 `{task_id, ok, from?, to?, status?, version?, code?, error?, throttleRemainingMs?}`）
 *    + `partial`（有成功也有失败）+ `tree` / `tree_note` + 顶层 `throttleRemainingMs` / `guidance`；
 *  - **t5 已落地 `budget` 入参**（REQ-261007100513-6749 FR-6）：`{release:true, add?}` = owner 放行
 *    一张跑到请求预算上限的子卡（幂等；只写卡评论与运行态窗口，不改任务状态机）。t4 当时刻意
 *    收下不声明（收下却静默忽略 = 假接口），现在 schema + 实现一起补上（`TaskMoveOutput.budget`
 *    的键名由 t4 在类型层钉死，未改名）。
 *
 * 角色感知报错在用例/domain（非法转移文案含角色与合法边），工具壳只做协议转换。
 *
 * @module dsh-pmboard/tools/TaskMoveTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeMoveTask, throttleGuidance, MOVE_BATCH_MAX } from '../../application/use-cases/MoveTask.js'
import { amendTaskAcceptanceIfRequested } from '../../application/use-cases/AmendTaskAcceptance.js'
import { assertNoPendingConfirm } from '../../application/internal/support.js'
import { readSubtaskBudgetArg, releaseSubtaskBudget } from '../../application/internal/subtask-budget.js'
import { fmt } from '../../domain/text/fmt.js'
import { renderSmart } from '../shared.js'

/**
 * 撞 60s 节流时的**结构化失败回执**（REQ-261007100513-6749 t4 / FR-5，R3）。
 *
 * 为什么必须在工具层转：用例层继续抛错（既有回归钉着 `rejects.toThrow(/REQBOARD_BULK_CLOSE/)`，
 * 且"拒绝即抛错"是它的既有契约），但 `dsh-tools` 的 `toolErrorResult` 只把 `message` 放进 content，
 * `error.info` 仅对 `HarnessError` 生成 `{name, code}`——挂在错误对象上的 `throttleRemainingMs`
 * 与 `guidance` **到不了调用方**（值算出来了，agent 却只看到一句"还要等"）。故这里把它转成正常
 * 工具回执**返回**：结构化字段走 output.schema（与批量路径同形，两条路的回执不再分叉）。
 *
 * 返回 undefined = 不是节流错误（原样抛，什么都不改）。
 */
function bulkCloseReceipt(err: unknown, taskId: string): Record<string, unknown> | undefined {
  const e = err as { code?: unknown; message?: unknown; throttleRemainingMs?: unknown; guidance?: unknown } | null | undefined
  if (e === undefined || e === null || e.code !== 'REQBOARD_BULK_CLOSE') return undefined
  const ms = typeof e.throttleRemainingMs === 'number' && e.throttleRemainingMs > 0 ? e.throttleRemainingMs : undefined
  const guidance = typeof e.guidance === 'string' && e.guidance.length > 0
    ? e.guidance
    : ms === undefined ? undefined : throttleGuidance(ms)
  const receipt: Record<string, unknown> = {
    success: false,
    task_id: taskId,
    error: String(e.message ?? ''),
    code: 'REQBOARD_BULK_CLOSE',
    ...(ms === undefined ? {} : { throttleRemainingMs: ms }),
    ...(guidance === undefined ? {} : { guidance }),
  }
  return receipt
}

const summarize = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>
  // 批量：逐项结果才是重点（一眼看清"落了几张、哪种原因没落"）。
  const results = Array.isArray(o['results']) ? (o['results'] as Record<string, unknown>[]) : undefined
  if (results !== undefined) {
    const ok = results.filter((r) => r['ok'] === true).length
    const bad = results.filter((r) => r['ok'] !== true)
    const names = bad.slice(0, 3).map((r) => String(r['task_id'] ?? '') + '（' + String(r['code'] ?? '失败') + '）').join('、')
    const more = bad.length > 3 ? fmt(' 等 {n} 项', { n: String(bad.length) }) : ''
    const tree = o['tree'] !== undefined ? '；已附子卡链摘要' : ''
    return fmt('任务推进（批量）：共 {total} 项，成功 {ok}、失败 {fail}{detail}{tree}',
      { total: String(results.length), ok: String(ok), fail: String(bad.length), detail: bad.length > 0 ? '——未落：' + names + more : '', tree })
  }
  const change = String(o['from'] ?? '?') + ' → ' + String(o['to'] ?? '?')
  const amended = o['acceptance'] !== undefined ? '（并已修订验收标准）' : ''
  return fmt('任务推进：{task_id} {change}{amended}', { task_id: String(o['task_id'] ?? ''), change, amended })
}

/** 批量项 schema（与扁平四参同语义；`additionalProperties:false` 决定未声明的键会被绑定层拒收）。 */
const batchItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_id: { type: 'string', description: '任务 id（t-xxxxxx）；批内一项一卡（同一张卡重复出现会被拒）' },
    to: { type: 'string', description: '目标状态（todo/in_progress/integrating/testing/in_review/done/canceled）；与 acceptance 至少给一个' },
    reason: { type: 'string', description: '理由（进台账留痕）；每条短句（建议 ≤60 字）；需引号用「」' },
    acceptance: { type: 'string', description: '修订该卡验收标准（≤2000 字符，须含命令/断言锚点）；只给它 = 该项仅修订、不改状态' },
  },
} as const

export function defineTaskMoveTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_task_move',
    description: [
      '用于：推进任务状态（todo → in_progress → integrating → testing → in_review → done）。',
      '支持一次批量推进多张卡（tasks[]，1–20 项）：逐项给结果（results[]），坏项不拖累好项（台账无回滚）；',
      '同批提交的卡互不触发 60 秒节流，跨批仍触发（撞节流时回执给确定剩余毫秒与可做之事的指引）。',
      '非法转移的报错会说明**当前角色**（父卡/子卡/存量卡）与**该角色的全部合法边**。',
      '可选 acceptance：修订该任务的验收标准（≤2000 字符，须含可执行锚点）并同步卡文档；',
      '只传 acceptance 不传 to = 仅修订、不改状态（用于开工时发现验收标准不可执行）。',
      '可选 budget：owner 放行一张跑到请求预算上限（默认 60 次/窗口）的子卡——{release:true, add?}，须带 reason；',
      '重复放行幂等（released:false，不叠加窗口）；放行只写卡评论与运行态窗口，不改任务状态机。',
      '人工门越权（取消/复活/重开已完成卡）代码级拒绝；任务必须属于本窗口绑定的需求。',
    ].join(''),
    parameters: {
      task_id: { type: 'string', description: '任务 id（t-xxxxxx）' },
      to: { type: 'string', description: '目标状态（todo/in_progress/integrating/testing/in_review/done/canceled）；与 acceptance 至少给一个' },
      reason: { type: 'string', description: '理由（进台账留痕）；写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号；文本过大拆成多次调用' },
      acceptance: { type: 'string', description: '修订验收标准（≤2000 字符，须含命令/断言锚点）；只传它 = 仅修订不改状态' },
      tasks: {
        type: 'array',
        description: fmt('批量推进（1–{max} 项，每项同扁平四参语义：task_id 必填，to/acceptance 至少给一个）；'
          + '与扁平四参二选一，同传时以 tasks 为准；同批的卡互不触发 60 秒节流，坏项只废该项（台账无回滚）', { max: String(MOVE_BATCH_MAX) }),
        items: batchItemSchema,
      },
      // ── 新增（REQ-261007100513-6749 t5 / FR-6；键名由 TaskMoveOutput 类型钉死，只增不减）──
      // 不新增工具（工具 schema 每轮请求都要重发）：放行挂在这个既有工具的 `budget` 子对象上。
      budget: {
        type: 'object',
        additionalProperties: false,
        description: '子卡请求预算放行（owner 专属；与 to/acceptance 可同时给）：到顶的子卡经此显式放行一个窗口后续跑',
        properties: {
          release: { type: 'boolean', description: '显式放行一次：窗口 +1、已用次数归零、写卡评论留痕（幂等：重复放行不叠加窗口）' },
          add: { type: 'number', description: '本次放行的追加额度（正整数；缺省 = 卡上 budgetRequests ?? 60）' },
          expectedWindowIndex: {
            type: 'number',
            description: '你看到的窗口号（CAS）：与当前窗口号不一致 → 拒绝（code=REQBOARD_CONFLICT，回执给出当前窗口号），请按当前号重试；一致才换窗',
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          task_id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          status: { type: 'string' },
          version: { type: 'number' },
          subtasks_created: { type: 'array', items: { type: 'string' }, description: '父卡开工同事务懒展开的子卡 id' },
          task_card: { type: 'object', additionalProperties: true, description: '任务卡全文投影（照卡执行）' },
          acceptance: { type: 'string', description: '本次修订后的验收标准' },
          error: { type: 'string' },
          code: { type: 'string' },
          // ── 新增（REQ-261007100513-6749 t4；键名由 TaskMoveOutput 类型钉死，只增不减）──
          results: {
            type: 'array',
            description: '批量时的逐项结果（顺序与入参 tasks 一致）；单卡路径不返回本键',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                task_id: { type: 'string' },
                ok: { type: 'boolean' },
                from: { type: 'string' },
                to: { type: 'string' },
                status: { type: 'string' },
                version: { type: 'number' },
                code: { type: 'string', description: '失败时：既有拒绝码逐字透传（invalid_transition / REQBOARD_*）' },
                error: { type: 'string' },
                throttleRemainingMs: { type: 'number', description: '该项撞 60 秒节流时的剩余毫秒（确定值，照此等待即可）' },
              },
            },
          },
          partial: { type: 'boolean', description: '有成功项也有失败项时为 true（全部成功/全部失败时不发）' },
          tree: {
            type: 'object',
            additionalProperties: true,
            description: '落笔成功后受影响的父卡与其子卡链摘要（一层；节点逐字复用 TaskTreeNodeView）',
          },
          tree_note: { type: 'string', description: '树摘要不可得的原因（不静默省略）' },
          throttleRemainingMs: { type: 'number', description: '撞节流时：剩余毫秒（结构化，替代只出现在文案里的数字）' },
          guidance: { type: 'string', description: '撞节流时：这段时间可以做什么（给确定等待时间，禁止让调用方靠试探找节奏）' },
          // ── 新增（REQ-261007100513-6749 t5 / FR-6）──
          budget: {
            type: 'object',
            additionalProperties: false,
            description: '预算放行结果：released=true 表示本次确实放行了一个新窗口；false = 幂等命中（不叠加窗口）；'
              + 'CAS 不匹配时本对象给出**当前**窗口号（配合 success=false / code=REQBOARD_CONFLICT 重试）',
            properties: {
              task_id: { type: 'string' },
              windowIndex: { type: 'number', description: '放行后的窗口号（0 起；窗口 = windowIndex + 1）；被拒时 = 当前窗口号' },
              limit: { type: 'number', description: '本窗口生效上限（开窗时定格）；被拒时 = 当前上限' },
              released: { type: 'boolean' },
            },
          },
        },
      },
      render: renderSmart(summarize),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> {
      await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      const a = (args ?? {}) as Record<string, unknown>
      const taskId = typeof a.task_id === 'string' ? a.task_id : ''

      // ── 预算放行（t5 / FR-6）：与扁平四参/批量**可同时给**；形状非法一律响亮拒绝，绝不静默忽略 ──
      const parsedBudget = readSubtaskBudgetArg(a.budget, taskId)
      if (parsedBudget.kind === 'error') return parsedBudget.receipt
      let budgetOut: Record<string, unknown> | undefined
      if (parsedBudget.kind === 'release') {
        const receipt = await releaseSubtaskBudget(deps, {
          taskId,
          windowKey: deps.session.windowKey(exec),
          reason: typeof a.reason === 'string' ? a.reason : '',
          ...(parsedBudget.add === undefined ? {} : { add: parsedBudget.add }),
          ...(parsedBudget.expectedWindowIndex === undefined ? {} : { expectedWindowIndex: parsedBudget.expectedWindowIndex }),
        })
        if (!receipt.ok) {
          // CAS 不匹配（REQBOARD_CONFLICT）等**带当前窗口号**拒绝：结构化回报当前窗口号，
          // 调用方据此重试——不靠从文案里抠数字（文案仍在，供人读）。
          return {
            success: false, task_id: taskId, error: receipt.error, code: receipt.code,
            ...(receipt.windowIndex === undefined
              ? {}
              : { budget: { task_id: taskId, windowIndex: receipt.windowIndex, limit: receipt.limit, released: false } }),
          }
        }
        budgetOut = { task_id: receipt.task_id, windowIndex: receipt.windowIndex, limit: receipt.limit, released: receipt.released }
      }
      const withBudget = (out: Record<string, unknown>): Record<string, unknown> =>
        budgetOut === undefined ? out : { ...out, budget: budgetOut }

      // ── 批量路径：容器形状先在这里挡住（与既有的"至少给 to 或 acceptance"同一种回报样式）──
      if (Array.isArray(a.tasks)) {
        if (a.tasks.length === 0) {
          return {
            success: false,
            task_id: taskId,
            error: 'reqboard_task_move 未执行：tasks 不能是空数组（要推一张卡就用扁平四参）',
            code: 'REQBOARD_INVALID_INPUT',
          }
        }
        if (a.tasks.length > MOVE_BATCH_MAX) {
          return {
            success: false,
            task_id: taskId,
            error: fmt('reqboard_task_move 未执行：tasks 一次最多 {max} 项（本批 {n} 项）——拆成多批', { max: String(MOVE_BATCH_MAX), n: String(a.tasks.length) }),
            code: 'REQBOARD_INVALID_INPUT',
          }
        }
        // 扁平 acceptance 与 tasks 同传时以 tasks 为准（不静默改别的卡：扁平路径的修订通道整体让位）。
        const out = await executeMoveTask(deps, args, exec) as Record<string, unknown>
        return withBudget(out)
      }

      // 先修订（如有）：开工时读到不可执行的验收标准，先改卡再干活（用例内保证零行为变更）。
      const amended = await amendTaskAcceptanceIfRequested(deps, args, exec)

      const hasTo = typeof a.to === 'string' && a.to.trim().length > 0
      if (!hasTo) {
        if (amended === undefined) {
          // 只放行不推状态（owner 的主路）：`{task_id, budget:{release:true}, reason}`。
          if (budgetOut !== undefined) return { success: true, task_id: taskId, budget: budgetOut }
          return {
            success: false,
            task_id: taskId,
            error: 'reqboard_task_move 未执行：至少给出 to 或 acceptance',
            code: 'REQBOARD_INVALID_INPUT',
          }
        }
        return withBudget({ success: true, task_id: taskId, acceptance: amended })
      }

      const out = await executeMoveTask(deps, args, exec).catch((err: unknown) => {
        // 节流：用例层抛错（既有契约不动），工具层转成**结构化回执**返回——只有返回才能把
        // throttleRemainingMs / guidance 送到调用方（见 bulkCloseReceipt 的注释）。
        const receipt = bulkCloseReceipt(err, taskId)
        if (receipt !== undefined) return receipt
        throw err
      }) as Record<string, unknown>
      return withBudget({ ...out, ...(amended !== undefined ? { acceptance: amended } : {}) })
    },
  } as any)
}
