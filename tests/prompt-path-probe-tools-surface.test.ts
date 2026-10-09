/**
 * 探针扩面「判据必须硬」的断言（REQ-261007200706-89b7 · 卡 t-540531 · FR-1）。
 *
 * ## 为什么需要它
 *
 * G1 的 8 处死路径全部住在**工具 description / 会话注入串 / 看板文案**里，而 `prompt-path-probe`
 * 原来的扫描面只有提示词片段 + round-state.ts——「文案引用的仓内路径必须存在」这条判据在那片区域
 * 长期是盲区（体检报告 C-3 就是这样漏过去的）。扩面本身也会被悄悄改回去（删一个 SCAN 条目就绿），
 * 所以这里把三条口径变成会失败的检查：
 *
 * ① **扫描面在场**：探针源码必须声明 agent 文案面（`src/tools` 递归 + capture-section + verification），
 *    且真实跑出来的 JSON 里 `scanned.agentSurface > 0`、token 出处确实落在这些文件上（不是空转）。
 * ② **禁词前缀硬规则在场且不吃白名单**：`agent-dh/` 与 `docs/standards/` 两类历史死路径写法，
 *    注入合成文本时必须判红（白名单里没有它们的容身之处）。
 * ③ **注释剥离不移动行号**：`.ts` 先剥注释，但报出的 `文件:行` 必须仍指向原文行——
 *    块注释若被整段吞掉换行，行号会整体前移，缺口点名就指错地方（本卡修过一次的 bug）。
 *
 * 判据边界：这里判「探针的面与规则在不在、空不空转」，不判「文案里有没有死路径」（那是探针自己的活儿）。
 *
 * @module tests/prompt-path-probe-tools-surface
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PROBE = join(ROOT, 'scripts/prompt-path-probe.mts')
const source = readFileSync(PROBE, 'utf8')

interface ProbeReport {
  ok: boolean
  exitCode: number
  scanned: { fragments: number; files: number; agentSurface: number; tokens: number }
  counts: { exists: number; whitelist: number; forbidden: number }
  tokens: { token: string; verdict: string; occurrences: string[] }[]
  gaps: { token: string; at: string; reason: string }[]
}

interface SpecimenReport {
  specimen: {
    ok: boolean
    redOnInjected: boolean
    whitePasses: boolean
    redOnForbidden: boolean
    agentSurfaceScanned: number
  }
  exitCode: number
}

/** 跑探针并取 JSON（探针的 `--json` 契约：stdout 只有可 JSON.parse 的结构）。 */
function runProbe(extra: readonly string[]): { json: unknown; status: number } {
  try {
    const out = execFileSync('npx', ['tsx', PROBE, '--json', ...extra], { cwd: ROOT, encoding: 'utf8' })
    return { json: JSON.parse(out), status: 0 }
  } catch (e) {
    const err = e as { stdout?: string; status?: number }
    return { json: JSON.parse(err.stdout ?? '{}'), status: err.status ?? 1 }
  }
}

describe('prompt-path-probe：agent 文案面扩面（FR-1）', () => {
  it('① 源码声明了 agent 文案面（src/tools 递归 + capture-section + verification）', () => {
    expect(source).toContain('AGENT_SURFACE_DIRS')
    expect(source).toMatch(/AGENT_SURFACE_DIRS = \['src\/tools'\]/)
    expect(source).toContain("'src/application/internal/capture-section.ts'")
    expect(source).toContain("'src/client/views/verification.ts'")
    expect(source).toContain('walkTypeScript')
  })

  it('② 真实扫描：agent 文案面扫到文件、缺口 0、禁词命中 0', () => {
    const { json, status } = runProbe([])
    const report = json as ProbeReport
    expect(status).toBe(0)
    expect(report.ok).toBe(true)
    expect(report.scanned.agentSurface).toBeGreaterThan(0)
    expect(report.counts.forbidden).toBe(0)
    expect(report.gaps).toEqual([])
    // 空转防线：token 的出处必须真的落在扩出来的面上（否则扫描面只是"声明了"却没扫到东西）
    const occurrences = report.tokens.flatMap((t) => t.occurrences)
    expect(occurrences.some((o) => o.startsWith('src/tools/'))).toBe(true)
    expect(occurrences.some((o) => o.startsWith('src/application/internal/capture-section.ts:'))).toBe(true)
  })

  it('③ specimen 五条判据全过（含禁词不吃白名单、扩面非空转）', () => {
    const { json, status } = runProbe(['--specimen'])
    const report = json as SpecimenReport
    expect(status).toBe(0)
    expect(report.specimen).toMatchObject({
      ok: true,
      redOnInjected: true,
      whitePasses: true,
      redOnForbidden: true,
    })
    expect(report.specimen.agentSurfaceScanned).toBeGreaterThan(0)
  })

  it('④ 禁词前缀声明为硬规则（两类前缀都在源码里，且注释剥离保留原文行号）', () => {
    expect(source).toContain('FORBIDDEN_PATTERNS')
    expect(source).toContain('agent-dh\\/')
    expect(source).toContain('docs\\/standards\\/')
    // 行号保真：块注释按原换行数替换（吞换行的写法已修，防回归）
    expect(source).toContain("'\\n'.repeat((m.match(/\\n/g) ?? []).length)")
  })
})
