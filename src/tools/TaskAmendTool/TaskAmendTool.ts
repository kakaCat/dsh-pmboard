/**
 * reqboard_task_amend 工具壳（REQ-261007220012-bd29 FR-4）——修缮簇单入口。
 *
 * 合并：条款引用补写 + 归属补救 + 子卡链补链 + 归档清单补录四个原工具
 * （单职能、低频次、同为补救语义，是 agent 选错面最大的一簇；
 * archive 一支由 REQ-261008020552-4aa0 FR-1 收编）。
 *
 * 纪律：**用例一行不改**——按 op 分派到 `executeTaskRefs` / `executeAdoptTask` /
 * `executeRegenerateChain` / `amendArchiveManifest`，各段的判定、拒绝条件、幂等性与留痕
 * 完全继承；本壳只做「op 识别 + 必填项点名 + 输出 schema 并集」（op=archive 另补
 * success:true，与被收编原工具的返回键集一致）。
 *
 * @module dsh-pmboard/tools/TaskAmendTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeTaskRefs } from '../../application/use-cases/AmendTaskRefs.js'
import { executeAdoptTask } from '../../application/use-cases/AdoptTask.js'
import { executeRegenerateChain } from '../../application/use-cases/RegenerateChain.js'
import { amendArchiveManifest } from '../../application/use-cases/AmendArchiveManifest.js'
import { noteInterruption } from '../../application/use-cases/NoteInterruption.js'
import { assertNoPendingConfirm } from '../../application/internal/support.js'
import { LONG_TEXT_STYLE_NOTE, renderSmart } from '../shared.js'
import { TASK_AMEND_PROMPT } from './prompt.js'
import { taskAmendSummary } from './summary.js'

/** 修缮动作枚举（受控；字面量数组经 const 收窄——与同仓其它枚举同款写法）。 */
export const TASK_AMEND_OPS = ['refs', 'adopt', 'chain', 'archive', 'interruption'] as const
export type TaskAmendOp = (typeof TASK_AMEND_OPS)[number]

/** 各 op 的必填集（拒绝消息点名用；「必填」按该 op 的用例真实要求列）。 */
const REQUIRED_OF: Readonly<Record<TaskAmendOp, readonly string[]>> = {
  refs: ['task_id', 'requirement_refs', 'reason'],
  adopt: ['task_id', 'parent_id'],
  chain: ['task_id（dry_run:false 时）', 'reason（dry_run:false 时）'],
  archive: ['docs', 'reason'],
  interruption: ['reason'],
}

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && !(typeof v === 'string' && v.length === 0)
}

export function defineTaskAmendTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_task_amend',
    description: TASK_AMEND_PROMPT,
    parameters: {
      op: {
        type: 'string',
        enum: [...TASK_AMEND_OPS],
        required: true,
        description: '修缮动作（必填）：refs=补写条款引用 / adopt=归属补救 / chain=子卡链补链与诊断 / archive=归档清单补录 / interruption=断点补写',
      },
      // ── op=refs ──
      requirement_refs: {
        type: 'array',
        description: 'op=refs：目标引用集（全量替换，如 ["FR-1","FR-2"]；空数组 = 清空）',
        items: { type: 'string' },
      },
      // ── op=archive ──
      docs: {
        type: 'array',
        description: 'op=archive：要补录的清单条目（非空；kind + path）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', description: 'requirement / plan / verification / retro / notes' },
            path: { type: 'string', description: '文件路径（工作区相对路径）' },
          },
        },
      },
      // ── op=refs / adopt / chain 共用 ──
      task_id: { type: 'string', description: '任务 id（t-xxxxxx）；refs/adopt 必填，chain 在 dry_run:false 时必填' },
      reason: { type: 'string', description: '为什么改（进需求评论/卡片评论留痕）；refs/archive/interruption 必填，adopt/chain 按用例要求；' + LONG_TEXT_STYLE_NOTE },
      // ── op=adopt ──
      parent_id: { type: 'string', description: 'op=adopt：挂到哪张父卡下（t-xxxxxx，须为同需求的顶层卡）' },
      stage_kind: { type: 'string', description: 'op=adopt：子卡阶段（受控枚举 dev/integrate/review/test）；卡上已有 stageKind 时可不传' },
      force: { type: 'boolean', description: 'op=adopt：改挂已有归属的卡时必传（默认 false：只补缺失）' },
      // ── op=chain / archive ──
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；chain：不传则按 task_id 反查或取本窗口绑定需求；archive：缺省 = 本窗口最近更新的需求；interruption：缺省 = 本窗口绑定的进行中需求' },
      dry_run: { type: 'boolean', description: 'op=chain：true（默认）=只读诊断；false=真补链（须同时传 task_id 与 reason）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // 壳层回显：本次实际执行了哪个修缮动作（三段返回体并集之下，靠它区分）
          op: { type: 'string', description: '本次修缮动作：refs / adopt / chain' },
          success: { type: 'boolean' },
          // ── refs ──
          before: { type: 'array', items: { type: 'string' }, description: 'op=refs：改写前的引用集' },
          after: { type: 'array', items: { type: 'string' }, description: 'op=refs：改写后的引用集' },
          changed: { type: 'boolean', description: 'op=refs：false = 值没变，未写盘（幂等）' },
          rtm_synced: { type: 'boolean', description: 'op=refs：是否已同步 RTM（失败不阻断，如实回报）' },
          // ── adopt ──
          previous_parent_id: { type: 'string', description: 'op=adopt：改挂前的父卡（补缺失时为空串）' },
          stage_kind: { type: 'string', description: 'op=adopt：补救后的子卡阶段' },
          role: { type: 'string', description: 'op=adopt：补救后的角色（恒为 subtask）' },
          version: { type: 'number', description: 'op=adopt：卡片版本号' },
          // ── chain ──
          dry_run: { type: 'boolean', description: 'op=chain：本次是否只读诊断' },
          applied: { type: 'boolean', description: 'op=chain：是否真的补了链' },
          scanned: { type: 'number', description: 'op=chain：扫描到的顶层卡数' },
          created_total: { type: 'number', description: 'op=chain：本次新建子卡数' },
          candidates: {
            type: 'array',
            description: 'op=chain：逐卡链体检结果',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                task_id: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string' },
                chain_status: { type: 'string', description: 'solo=显式无链 / missing=链未生成 / partial=缺段 / complete=完整' },
                expected: { type: 'array', items: { type: 'string' } },
                existing: { type: 'array', items: { type: 'string' } },
                missing: { type: 'array', items: { type: 'string' } },
                created: { type: 'array', items: { type: 'string' } },
                note: { type: 'string' },
              },
            },
          },
          // ── 三段共用 ──
          task_id: { type: 'string' },
          requirement_id: { type: 'string' },
          parent_id: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          error: { type: 'string' },
          code: { type: 'string' },
          // ── archive ──
          appended: { type: 'array', items: { type: 'string' }, description: 'op=archive：本次真正追加的路径' },
          skipped: {
            type: 'array',
            description: 'op=archive：已存在（幂等跳过）的路径',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { path: { type: 'string' }, reason: { type: 'string' } },
            },
          },
          // ── interruption ──
          interruption: {
            type: 'object',
            additionalProperties: false,
            description: 'op=interruption：写入的断点记录（同一需求只保留一个，后写覆盖前写）',
            properties: {
              at: { type: 'number', description: '中断/检查点时间戳（ms）' },
              reason: { type: 'string', description: '中断原因原文；交棒检查点写 checkpoint' },
              stage: { type: 'string', description: '断点时的流水线阶段' },
              pendingAction: { type: 'string', description: '未完成动作（下一步工具命令）' },
              tool: { type: 'string', description: '最后成功调用的工具名（可缺省）' },
            },
          },
        },
      },
      render: renderSmart(taskAmendSummary),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> {
      const a = (args ?? {}) as Record<string, unknown>
      const op = a.op
      // 挂起确认守卫按 op 分流（REQ-261008020552-4aa0 FR-2 · design §3.2，行为等价关键点）：
      // op=interruption（断点补写）被收编前的原工具**没有** assertNoPendingConfirm 前置——
      // 挂起确认期间也允许记断点；其余 op（含未知 op）维持「先守卫后分派」的现状。
      if (op !== 'interruption') {
        await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      }
      // 绑定层按 enum 拒未知 op；这里再兜一层（直调用例的测试会绕过绑定层）。
      if (op !== 'refs' && op !== 'adopt' && op !== 'chain' && op !== 'archive' && op !== 'interruption') {
        return {
          op: String(op ?? ''), success: false, status: 'error',
          error: 'REQBOARD_INVALID_INPUT：op 必须是 ' + TASK_AMEND_OPS.join(' / '),
        }
      }
      const missing = requiredMissing(op, a)
      if (missing.length > 0) {
        return {
          op, success: false, status: 'error',
          error: 'REQBOARD_INVALID_INPUT：op=' + op + ' 缺必填项 [' + missing.join(', ')
            + ']；该 op 必填集：' + REQUIRED_OF[op].join(' / '),
        }
      }
      // op=archive：用例返回不含 success，壳补上（与被收编的原工具返回键集一致 + op 回显）。
      if (op === 'archive') {
        const out = (await amendArchiveManifest(deps, a, exec)) as unknown as Record<string, unknown>
        return { op, success: true, ...out }
      }
      // op=interruption：用例返回已含 success（与被收编的原工具一致），只回显 op。
      if (op === 'interruption') {
        const out = (await noteInterruption(deps, a, exec)) as Record<string, unknown>
        return { op, ...out }
      }
      const useCase = op === 'refs' ? executeTaskRefs : op === 'adopt' ? executeAdoptTask : executeRegenerateChain
      const out = (await useCase(deps, a, exec)) as Record<string, unknown>
      // op 回显（三段返回体本身不带 op）：渲染与调用方据此区分动作
      return { op, ...out }
    },
  } as any)
}

/**
 * 该 op 的必填项是否齐（只判**本壳能判**的键；更细的语义判定仍在各用例里，不在此重复）。
 *
 * op=chain 的 task_id/reason 只在 dry_run:false 时必填——dry_run 缺省即 true（只读诊断）。
 */
function requiredMissing(op: TaskAmendOp, a: Record<string, unknown>): string[] {
  const missing: string[] = []
  if (op === 'refs') {
    if (!hasValue(a.task_id)) missing.push('task_id')
    if (!Array.isArray(a.requirement_refs)) missing.push('requirement_refs')
    if (!hasValue(a.reason)) missing.push('reason')
    return missing
  }
  if (op === 'adopt') {
    if (!hasValue(a.task_id)) missing.push('task_id')
    if (!hasValue(a.parent_id)) missing.push('parent_id')
    return missing
  }
  if (op === 'archive') {
    if (!Array.isArray(a.docs)) missing.push('docs')
    if (!hasValue(a.reason)) missing.push('reason')
    return missing
  }
  if (op === 'interruption') {
    if (!hasValue(a.reason)) missing.push('reason')
    return missing
  }
  // chain
  if (a.dry_run === false) {
    if (!hasValue(a.task_id)) missing.push('task_id')
    if (!hasValue(a.reason)) missing.push('reason')
  }
  return missing
}
