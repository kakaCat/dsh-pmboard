/**
 * 斜杠命令面的注册与降级（REQ-261009174713-7bc8 · RF-16 / RF-18 · 卡 t18）。
 *
 * 契约（逐字取自设计 `design/interfaces.md` 的「依赖与装配契约」）：
 *   · `name: 'pm'` ⇒ 用户输入面为 `/pm`；`attachments: false` ⇒ 带附件由宿主在派发前拒绝；
 *   · 服务 `commands` **惰性注入**：缺席 = 不注册 + 留痕，插件其余面照常（RF-16）；
 *   · 同一作用域同名重复注册**抛错** ⇒ 按降级路径处理（不抛给用户）；
 *   · deps 由根包（组合根）注入，与工具面共用实例；命令面**不自行装配端口**。
 *
 * @module command-pmboard
 */
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { runPmCommand, type CommandDeps } from './command.js'

export const name = 'command-pmboard'
/** 惰性注入，不用静态 inject（设计口径）。 */
export const inject: readonly string[] = []

/** 降级留痕：命令面装不上时**不抛**，只记录（插件其余面照常可用）。 */
function logUnavailable(ctx: unknown, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[command-pmboard] /pm 注册失败，命令面已降级（插件其余面照常）：' + message, ctx === undefined ? '' : '')
}

/**
 * 把 `/pm` 注册进宿主命令表；返回卸载 disposer。
 *
 * 无 `commands` 服务（或无 register 能力）时返回 `undefined` 且**不抛** —— 这是 RF-16 的降级面。
 */
export function applyCommandSurface(ctx: Context, deps: CommandDeps): (() => void) | undefined {
  try {
    const commands = (ctx as unknown as { commands?: { register?: (definition: unknown) => () => void } }).commands
    if (commands?.register === undefined) {
      logUnavailable(ctx, new Error('宿主未提供 commands 服务'))
      return undefined
    }
    return commands.register({
      definitionId: CommandDefinitionId('dsh-pmboard'),
      name: 'pm',
      description: '创建或查看 pm 需求（pmboard 流水线）',
      input: { hint: '[<需求名称>]', attachments: false },
      handler: (invocation: CommandInvocation): Promise<CommandResult> => runPmCommand(deps, invocation),
    })
  } catch (error) {
    logUnavailable(ctx, error)
    return undefined
  }
}
