/**
 * 裁决降级原因（REQ-261007160829-1991 · t-地基）serves: FR-2
 *
 * 本卡只做**地基**：落字段（`unverifiedReason`，两处镜像）+ 落判定纯函数（`judgePassedVerdict`），
 * **不改任何现有行为**（`applyVerdicts` 的内联判定与 `hasResultAnchor` 的正则原封不动）。
 *
 * 为什么要立这张地基：验收通道里人点「通过」后状态停在 `unverified`，真因是结果文本**没有可核验锚点**
 * 时被判据静默降级——降级本身是对的，**降级得说不出为什么**才是缺陷。本文件按 design/backend.md
 * §关键逻辑 S-1 的**六条判定顺序**逐条钉住：人工项吃事实形态、系统项吃处置、其余吃锚点；
 * 两条降级路径各带自己的原因（`blank_pass` / `anchor_missing`）。
 *
 * 用例先行（TDD）：本文件在 `judgePassedVerdict` 落地之前就写好了。
 */
import { describe, it, expect } from 'vitest'
import { judgePassedVerdict, type UnverifiedReason, type SheetItemLike } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { VerificationItem } from '../src/shared/protocol.js'

/** 普通项（无 result、非人工、非系统）的最小投影。 */
const item = (
  over: Partial<Pick<SheetItemLike, 'result' | 'needsHuman' | 'gapKind' | 'criterion'>> = {},
): Pick<SheetItemLike, 'result' | 'needsHuman' | 'gapKind' | 'criterion'> => ({
  criterion: '单测全绿',
  ...over,
})

describe('judgePassedVerdict · 落点与降级原因（S-1）', () => {
  it('无文本、且该项无 result → unverified(blank_pass)', () => {
    expect(judgePassedVerdict({ item: item() })).toEqual({ status: 'unverified', reason: 'blank_pass' })
  })

  it('无文本、但空串/纯空白也算无文本 → unverified(blank_pass)', () => {
    expect(judgePassedVerdict({ item: item({ result: '   ' }), opinion: '' })).toEqual({
      status: 'unverified',
      reason: 'blank_pass',
    })
  })

  it('有文本带锚点（命令 + 读数）→ passed', () => {
    expect(judgePassedVerdict({
      item: item(),
      opinion: 'npx vitest run tests/x.test.ts → 10 passed',
    })).toEqual({ status: 'passed' })
  })

  it('有文本无锚点（纯中文散文）→ unverified(anchor_missing)', () => {
    expect(judgePassedVerdict({
      item: item(),
      opinion: '功能正常，没有问题',
    })).toEqual({ status: 'unverified', reason: 'anchor_missing' })
  })

  it('人工项（needsHuman）有文本 → passed（走事实形态判据，不吃锚点）', () => {
    expect(judgePassedVerdict({
      item: item({ needsHuman: true }),
      opinion: '按钮与原型一致，截图见 docs/requirements/x/evidence/a.png',
    })).toEqual({ status: 'passed' })
  })

  it('人工项有文本、且文本无锚点 → 仍 passed（不吃锚点判据是这条的全部意义）', () => {
    expect(judgePassedVerdict({
      item: item({ needsHuman: true }),
      opinion: '现象正常，对齐没问题',
    })).toEqual({ status: 'passed' })
  })

  it('人工项无文本 → unverified(blank_pass)（不吃 result 兜底）', () => {
    expect(judgePassedVerdict({
      item: item({ needsHuman: true, result: 'npx vitest run → 10 passed' }),
    })).toEqual({ status: 'unverified', reason: 'blank_pass' })
  })

  it('系统项（gapKind 非空）有文本、无锚点 → passed（判处置，不吃锚点）', () => {
    expect(judgePassedVerdict({
      item: item({ gapKind: 'e2e' }),
      opinion: '确认无需 E2E：纯函数模块，无外部接口',
    })).toEqual({ status: 'passed' })
  })

  it('无文本、但该项有 result 且带锚点 → passed（零输入通过：人点通过即视为已复核 agent 实测）', () => {
    expect(judgePassedVerdict({
      item: item({ result: 'npx vitest run tests/x.test.ts → 10 passed' }),
    })).toEqual({ status: 'passed' })
  })

  it('无文本、该项 result **无锚点**（agent 的散文）→ unverified(anchor_missing)，不冒充通过', () => {
    // 本需求要治的正是这一形态：agent 写「（未附实际结果…待补复核）」这类无锚点文本，
    // 人留空点通过——既有实现记 unverified，本判据必须同结论（放进 passed 就是静默放行）。
    expect(judgePassedVerdict({
      item: item({ result: '功能正常，没有问题' }),
    })).toEqual({ status: 'unverified', reason: 'anchor_missing' })
  })
})

describe('unverifiedReason 字段（data-model：两处镜像、加性可选）', () => {
  it('字段是可选的：不写 = undefined（老台账读侧零迁移）', () => {
    const legacy = { id: 'v1-1', status: 'unverified' } as unknown as VerificationItem
    expect(legacy.unverifiedReason).toBeUndefined()
  })

  it('UnverifiedReason 的两值都能赋给 VerificationItem.unverifiedReason（类型层）', () => {
    const reasons: UnverifiedReason[] = ['blank_pass', 'anchor_missing']
    const items: VerificationItem[] = reasons.map(r => ({ id: 'v1-1', unverifiedReason: r } as VerificationItem))
    expect(items.map(i => i.unverifiedReason)).toEqual(['blank_pass', 'anchor_missing'])
  })
})
