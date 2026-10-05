/**
 * Dive 写入收敛（REQ-261003215944-9e04 FR-9 · t10）。
 *
 * 【为什么要有这道门】
 * 「改 dive」原先散在八处、各写一份。本卡把能整体委托的（自动恢复 / 人显式继续）交给唯一写入口，
 * 把必须在既有 mutate 内就地算的（立项 create / 人解锁 / 阶段推进 / 回退）改为调纯函数。
 * 收敛是否真的做到，用**机械判据**说话——不靠人读代码：
 *
 *   1. 两条 grep 只命中规则模块（TC-16）：`roundsInStage = 0` 与 `activation = '…'` 这类**赋值字面量**
 *      除规则模块与一次性迁移外，全仓不许再出现（注释与字符串里也不许——否则门禁能被注释绕过）；
 *   2. 回退行为逐字一致（TC-22c）：回退解除自动链的写入结果，与改造前那两行的结果**JSON 逐字相同**；
 *   3. 归因接口：回退写入口接受 actor（看板=human / 工具=agent）——本事件按设计**不产生 dive 留痕**
 *      （回退事务自己的留痕在 applyRequirementRollback 里），故 actor 只进签名与审计，不产评论。
 *      这一条与 test-cases.md 里 TC-22c 的措辞有出入，已在汇报里如实指出。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetInjectionAfterRollback } from '../src/application/internal/rollback.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 递归收集 src 下的 .ts 文件（相对 src 的路径）。 */
function tsFiles(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) { out.push(...tsFiles(abs, base + name + '/')); continue }
    if (name.endsWith('.ts')) out.push(base + name)
  }
  return out
}

/** 按正则找命中（返回 `文件:行号: 行内容`）。 */
function hits(pattern: RegExp): string[] {
  const found: string[] = []
  for (const rel of tsFiles(SRC)) {
    const lines = readFileSync(join(SRC, rel), 'utf8').split('\n')
    lines.forEach((line, i) => { if (pattern.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`) })
  }
  return found
}

describe('TC-16 静态收敛：写入字面量只许出现在规则模块', () => {
  it('`roundsInStage = 0` 只命中 domain/dive/transition.ts（迁移模块豁免）', () => {
    const found = hits(/roundsInStage\s*=\s*0/).filter(h => !h.startsWith('application/internal/migrate-dive-state.ts'))
    expect(found.map(h => h.split(':')[0])).toEqual(['domain/dive/transition.ts'])
  })

  it('`activation = \'…\'` 只命中 domain/dive/transition.ts（迁移模块豁免；注释与字符串也不算例外）', () => {
    const found = hits(/activation\s*=\s*'/).filter(h => !h.startsWith('application/internal/migrate-dive-state.ts'))
    expect(found.map(h => h.split(':')[0])).toEqual(['domain/dive/transition.ts', 'domain/dive/transition.ts'])
  })

  it('立项路径不再手抄 dive 初值（用纯函数取）', () => {
    const text = readFileSync(join(SRC, 'application/internal/support.ts'), 'utf8')
    expect(text).toContain("event: 'arm'")
    expect(text).toContain("from '../../domain/dive/transition.js'")
  })
})

describe('TC-22c 回退解除自动链：与改造前逐字一致', () => {
  /** 改造前那两行的等价实现（用作"逐字一致"的对照组，不参与生产代码）。 */
  function legacyReset(dive: NonNullable<RequirementRecord['dive']>): Record<string, unknown> {
    const copy = JSON.parse(JSON.stringify(dive)) as Record<string, unknown>
    copy.activation = 'disarmed'
    delete copy.pausedReason
    return copy
  }

  function recordWith(dive: NonNullable<RequirementRecord['dive']>): RequirementRecord {
    return { id: 'REQ-261003215944-9e04', dive } as unknown as RequirementRecord
  }

  it('armed + 曾因达上限停手 → disarmed，清暂停语，phase 与计数都不动（JSON 与旧实现逐字相同）', () => {
    const dive = {
      activation: 'armed' as const, phase: 'active' as const, roundsInStage: 3,
      pausedReason: 'round-limit:implementing',
      driverHealth: { state: 'paused' as const, reason: 'round-limit:implementing', since: 111, attempts: 2 },
      lastActiveAt: 222,
    }
    const req = recordWith({ ...dive })
    resetInjectionAfterRollback(req, 999, { kind: 'agent', sessionId: 'session-a' })
    expect(JSON.stringify(req.dive)).toBe(JSON.stringify(legacyReset({ ...dive })))
    expect(req.dive?.activation).toBe('disarmed')
    expect(req.dive?.phase).toBe('active')       // 回退不动相位
    expect(req.dive?.roundsInStage).toBe(3)      // 回退不动计数
    expect('pausedReason' in (req.dive ?? {})).toBe(false) // 是"删掉"而不是"置 undefined"
  })

  it('归因接口：human / agent 两种 actor 都接受；本事件按设计不产生 dive 留痕', () => {
    for (const actor of [{ kind: 'human' as const }, { kind: 'agent' as const, sessionId: 's' }]) {
      const req = recordWith({ activation: 'armed', phase: 'active', roundsInStage: 1 })
      req.comments = []
      resetInjectionAfterRollback(req, 999, actor)
      expect(req.dive?.activation).toBe('disarmed')
      // 回退的留痕由 applyRequirementRollback 写；这里刻意不重复写一条（避免同一事务两条噪声）
      expect(req.comments).toHaveLength(0)
    }
  })

  it('缺省 actor（存量调用方）行为不变：仍然只解除自动链', () => {
    const req = recordWith({ activation: 'armed', phase: 'active', roundsInStage: 2 })
    resetInjectionAfterRollback(req, 999)
    expect(req.dive?.activation).toBe('disarmed')
    expect(req.dive?.roundsInStage).toBe(2)
  })
})
