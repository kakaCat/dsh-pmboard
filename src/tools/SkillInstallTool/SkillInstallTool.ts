/**
 * SkillInstallTool 工具壳（REQ-261005122347-e07a FR-1 / FR-6）——工具名 `reqboard_skill_install`。
 *
 * 只做协议转换（参数 / 返回体 / 渲染）；投放决策与幂等判定在
 * `application/use-cases/InstallSkills`，磁盘与进程在 `adapters/SkillAssets|SkillWriter|PythonProbe`
 * （层边界门禁：工具层不做判定）。
 *
 * **写工具**：失败**返回**结构化错误（`success:false` + `code`），不把异常直接抛给宿主——
 * 主 agent 要能从回执里看出"是开关关了还是装机漏打包"，而不是拿到一段栈。
 *
 * @module dsh-pmboard/tools/SkillInstallTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeInstallSkills, type InstallSkillsArgs } from '../../application/use-cases/InstallSkills.js'
import { SKILL_INSTALL_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 首行一句话摘要（人话）：投了几个、跳过了没、能不能检索。 */
function summarize(v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  if (o['success'] === false) {
    return '❌ 投放被拒：' + String(o['code'] ?? '?') + '｜' + String(o['message'] ?? '').slice(0, 60)
  }
  const py = (o['python'] ?? {}) as Record<string, unknown>
  const reused = o['reused'] === true
  return (reused ? '✅ 资产已就位（幂等跳过，未写盘）' : '✅ 已投放 ' + String((o['materialized'] as unknown[] | undefined)?.length ?? 0) + ' 个 skill')
    + '｜python=' + (py['found'] === true ? String(py['version'] ?? 'found') : '缺失（勿伪造检索结果）')
    + '｜' + String(o['root'] ?? '')
}

export function defineSkillInstallTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_skill_install',
    description: SKILL_INSTALL_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；给了就必须是本窗口绑定的进行中需求' },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: '只投放指定的 skill 名；缺省 = 全部 7 个。未知名字 → 拒',
      },
      force: { type: 'boolean', description: 'true = 忽略全等判定强制重写（排查资产损坏用）' },
      root: { type: 'string', description: '覆盖投放根（绝对路径）；缺省 = <会话工作区>/.dsh/skills' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          code: { type: 'string' },
          message: { type: 'string' },
          root: { type: 'string' },
          materialized: { type: 'array', items: { type: 'string' } },
          reused: { type: 'boolean' },
          bytes: { type: 'number' },
          manifest: { type: 'object', additionalProperties: true },
          python: { type: 'object', additionalProperties: true },
          searchScript: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: renderSmart(summarize),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(input: unknown, context: ToolRunContext): Promise<Record<string, unknown>> {
      const windowKey = deps.session.windowKey(context)
      try {
        return await executeInstallSkills(deps, windowKey, (input ?? {}) as InstallSkillsArgs) as unknown as Record<string, unknown>
      } catch (err) {
        const e = err as { code?: unknown; message?: unknown }
        return {
          success: false,
          code: typeof e?.code === 'string' ? e.code : 'REQBOARD_SKILLS_INSTALL_FAILED',
          message: typeof e?.message === 'string' ? e.message : String(err),
        }
      }
    },
  } as never)
}
