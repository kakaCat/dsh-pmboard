/**
 * 产物催办按 kind 聚合 + 成组确认（REQ-261003222428-3556 FR-7 / N-3）。
 *
 * 背景（《自动链契约》§5 N-3，2026-10-02 实测）：task_detail/task_output 每张卡登记一份，
 * 产物确认机器一次只落一份章（成组仅限 design），一次交付积累 23+16 份待确认。
 * 本文件钉三件事：
 *  ① 催办按 kind 聚合：5 份 task_detail 待确认 → 注入 prompt 的待确认行只剩 1 条（kind×N）；
 *  ② 一次成组确认 → 5 份全部落章，回执 stamped 列出 5 份路径（落章清单）；
 *  ③ design 既有成组语义零回归 + 非成组 kind 仍逐份（历史语义不动）。
 */
import { describe, it, expect } from 'vitest'
import { artifactsToConfirm, aggregateUnconfirmedLabels, GROUP_CONFIRM_KINDS } from '../src/application/internal/artifact-gates.js'
import { confirmArtifact } from '../src/application/use-cases/ConfirmArtifact.js'
import { projectLedger } from '../src/application/internal/node-input-package.js'
import { makeHarness, req } from './application/harness.js'
import type { StageArtifact } from '../src/shared/protocol.js'

const EXEC = { agent: { id: 'session-w-001' } }

function art(kind: string, path: string): StageArtifact {
  return {
    stage: 'implementing', kind: kind as never, path,
    registeredAt: 1, registeredBy: { kind: 'agent' },
  } as StageArtifact
}

describe('FR-7 ① 催办按 kind 聚合（注入侧）', () => {
  it('5 份 task_detail 待确认 → openQuestions 只出 1 条聚合（kind×N + 成组确认指引）', () => {
    const r = req({
      status: 'implementing',
      artifacts: [
        art('requirement', 'docs/r/requirement.md'),       // 非成组 kind：逐条
        art('task_detail', 'docs/r/tasks/t-1.md'),
        art('task_detail', 'docs/r/tasks/t-2.md'),
        art('task_detail', 'docs/r/tasks/t-3.md'),
        art('task_detail', 'docs/r/tasks/t-4.md'),
        art('task_detail', 'docs/r/tasks/t-5.md'),
      ],
    })
    const out = projectLedger(r as never, 'implementing' as never)
    const rows = out.openQuestions.split('；').filter((x) => x.length > 0)
    // requirement 逐条 1 行 + task_detail 聚合 1 行 = 2 行（聚合前是 6 行）
    expect(rows).toHaveLength(2)
    expect(rows.some((x) => x.includes('task_detail×5'))).toBe(true)
    expect(rows.some((x) => x.includes('成组确认一次清'))).toBe(true)
    expect(rows.some((x) => x.startsWith('requirement（'))).toBe(true)
  })

  it('单份不成组（N=1 退回逐条标签）；labels 与 GROUP_CONFIRM_KINDS 同源', () => {
    const labels = aggregateUnconfirmedLabels([art('task_detail', 'p/only.md')], (a) => a.kind + '(' + a.path + ')')
    expect(labels).toEqual(['task_detail(p/only.md)'])
    expect([...GROUP_CONFIRM_KINDS].sort()).toEqual(['design', 'task_detail', 'task_output'])
  })
})

describe('FR-7 ② 一次成组确认 → 全部落章 + 回执落章清单', () => {
  it('5 份 task_detail 一次确认全 confirmed；stamped 列 5 份路径；评论记成组确认', async () => {
    const h = makeHarness({
      requirements: [req({
        status: 'implementing',
        artifacts: Array.from({ length: 5 }, (_, i) => art('task_detail', 'docs/r/tasks/t-' + (i + 1) + '.md')),
      })],
    })
    const out = await confirmArtifact(h.deps, { target: 'artifact', kind: 'task_detail', evidence: '用户说可以' }, EXEC) as Record<string, unknown>
    expect(out.success).toBe(true)
    expect((out.stamped as string[]).length).toBe(5)
    expect(out.stamped).toContain('docs/r/tasks/t-3.md')
    const after = (await h.store.get('REQ-000001'))!
    expect(after.artifacts!.every((a) => a.confirmedAt !== undefined)).toBe(true)
    expect(after.artifacts!.every((a) => a.confirmedVia === 'session')).toBe(true)
    expect(after.comments.map((c) => c.body).join(' ')).toContain('成组确认 5 份')
  })
})

describe('FR-7 ③ design 成组零回归 + 非成组 kind 逐份语义不动', () => {
  it('design 仍全量成组；requirement 仍只取首份（历史语义）', () => {
    const r = req({
      artifacts: [
        art('design', 'docs/r/design/a.md'),
        art('design', 'docs/r/design/b.md'),
        art('requirement', 'docs/r/requirement.md'),
        art('requirement', 'docs/r/requirement-v2.md'),
      ],
    })
    expect(artifactsToConfirm(r as never, 'design' as never)).toHaveLength(2)
    expect(artifactsToConfirm(r as never, 'requirement' as never)).toHaveLength(1)
    expect(artifactsToConfirm(r as never, 'task_detail' as never)).toHaveLength(0)
    const r2 = req({ artifacts: [art('task_detail', 'p/1.md'), art('task_detail', 'p/2.md')] })
    expect(artifactsToConfirm(r2 as never, 'task_detail' as never)).toHaveLength(2)
  })
})
