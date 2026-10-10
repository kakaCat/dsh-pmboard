/**
 * `/pm` 命令的执行体（REQ-261009174713-7bc8 · RF-17 / RF-18 · 卡 t18）。
 *
 * ## 判据单点（RF-18 的判据之一）
 *
 * 命令面**复用 core 的 use case**，不在这里复写任何判据：
 *   · 创建 → `executeCreateRequirement(deps, args, exec)`
 *   · 查询 → `queryState(deps, {}, exec)`
 *   · 窗口解析 → `exec = { agent: invocation.agent }`（与 19 个工具**同一实现**）
 *
 * ⇒ **禁止**在本文件复写 `agentIdOf` / 绑定判据 / 文档落点规则。deps 由组合根（根包）在装配时注入，
 * 与工具面共用同一个实例（避免第二套端口接线）。
 *
 * ## 错误不吞
 *
 * 非预期异常转成 `kind:'error'` 回执**并写日志**（栈不进用户可见文案）；错误码 → 文案的映射逐字取自设计。
 *
 * @module command-pmboard/command
 */
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { executeCreateRequirement } from 'pmboard-core/application/use-cases/CreateRequirement.js'
import { queryState } from 'pmboard-core/application/query/QueryState.js'
import { parsePmCommand } from './parse.js'
import {
  renderBound,
  renderCreated,
  renderUnknown,
  renderUnbound,
  renderUsage,
  renderWindowBound,
  renderWorkspaceUnavailable,
} from './render.js'

/** deps 取自用例自身的入参类型 ⇒ 与 core 的接线契约**同源**，core 改签名这里跟着报错（不会悄悄漂移）。 */
export type CommandDeps = Parameters<typeof executeCreateRequirement>[0]

/** 从异常里取领域错误码（core 的 reject 形态：`code` 字段）。 */
function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 绑定态的展示字段：优先顶层，回落 `open_requirements[0]`（查询回执的两种既有形态）。 */
function boundView(state: unknown): { id: string; title: string; status: string; boardLink?: string } {
  const s = (state ?? {}) as Record<string, unknown>
  const first = Array.isArray(s['open_requirements']) ? (s['open_requirements'][0] as Record<string, unknown> | undefined) : undefined
  const pick = (key: string): unknown => s[key] ?? first?.[key]
  const boardLink = pick('board_link')
  return {
    id: String(pick('requirement_id') ?? pick('id') ?? ''),
    title: String(pick('title') ?? ''),
    status: String(pick('status') ?? ''),
    ...(typeof boardLink === 'string' && boardLink !== '' ? { boardLink } : {}),
  }
}

/** 已绑定时**再查一次**取绑定 ID —— 只为让文案里的 `<REQ-ID>` 是真的（查不到就不编）。 */
async function boundIdFor(deps: CommandDeps, exec: unknown): Promise<string | undefined> {
  try {
    const view = boundView(await queryState(deps, {}, exec))
    return view.id === '' ? undefined : view.id
  } catch {
    return undefined
  }
}

/** 命令面唯一入口：`/pm` 的全部行为都在这里（注册层只负责调用它）。 */
export async function runPmCommand(deps: CommandDeps, invocation: CommandInvocation): Promise<CommandResult> {
  const command = parsePmCommand(invocation.rawInput)
  const exec = { agent: invocation.agent }
  try {
    if (command.kind === 'invalid') return { kind: 'error', text: renderUsage() }
    if (command.kind === 'show') {
      const state = await queryState(deps, {}, exec)
      if ((state as { bound?: unknown } | null)?.bound !== true) return { kind: 'success', text: renderUnbound() }
      const view = boundView(state)
      return { kind: 'success', text: renderBound(view.id, view.title, view.status, view.boardLink) }
    }
    // 类型/档位取缺省；doc_location 不传 ⇒ 回落 docs/requirements/<REQ>/（判据在 core，不在这里判）。
    const created = (await executeCreateRequirement(
      deps,
      { title: command.title, category: 'feature', prompt_difficulty: 'standard' },
      exec,
    )) as Record<string, unknown> | null
    const id = String(created?.['requirement_id'] ?? '')
    const boardLink = created?.['board_link']
    return { kind: 'success', text: renderCreated(id, typeof boardLink === 'string' ? boardLink : undefined) }
  } catch (error) {
    const code = codeOf(error)
    if (code === 'REQBOARD_WINDOW_BOUND') {
      return { kind: 'error', text: renderWindowBound(await boundIdFor(deps, exec)) }
    }
    if (code === 'REQBOARD_INVALID_WORKSPACE') return { kind: 'error', text: renderWorkspaceUnavailable() }
    if (code === 'REQBOARD_INVALID_INPUT') return { kind: 'error', text: renderUsage() }
    console.error('[command-pmboard] /pm 执行失败:', error)
    return { kind: 'error', text: renderUnknown(messageOf(error)) }
  }
}
