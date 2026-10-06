/**
 * 裁定记录门与会话留痕判据单测（REQ-261005105032-3b02 · FR-8 / D-11 / D-12；t-ebf533）。
 *
 * 覆盖（逐条对卡面验收）：
 *   · 有留痕且缺节 → `decision_log_missing`；缺节/空节不拿留痕当条件（留痕只决定真空态那一步）；
 *   · 条目缺原话来源 or「影响 FR」未命中真实条款 → `decision_entry_invalid`，gaps **一次列全部**坏条目；
 *   · 编号跳号 `D-1,D-3` 与重复 `D-2,D-2` 均拒；
 *   · 真空态且无留痕 → 放行；有留痕却只写真空态 → 仍拒；
 *   · 非 feature → `undefined`（D-12）；
 *   · 留痕判据只认 `source.kind === 'user'`、只扫最近 N 条、快照优先、不新增数据源。
 *
 * **冷读回落用例标 `@integration` 且默认不跑**（§10 #24：真机会话标本才具备冷会话读能力）。
 * 显式跑法：`DSH_PMBOARD_INTEGRATION=1 npx vitest run tests/decision-gates.test.ts`
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  checkDecisionLogGate,
  hasDecisionTrace,
  DECISION_SECTION_NAME,
  DECISION_VACUUM_MARKER,
} from '../src/application/internal/decision-gates.js'
import { GATE_HOW_ANCHOR } from '../src/application/internal/gate-feedback.js'
import type { DocsReader } from '../src/application/internal/content-gates.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** 冷读路径（只挂 `readEvents`，无快照）需要真机会话标本，默认不跑。 */
const RUN_INTEGRATION = process.env['DSH_PMBOARD_INTEGRATION'] === '1'

const REQ_ID = 'REQ-test01'
const REQ_PATH = 'docs/requirements/' + REQ_ID + '/requirement.md'

// --- 文档假读口（只实现门禁用到的三件事） -----------------------------------

function fakeDocs(files: Readonly<Record<string, string>>): DocsReader {
  return {
    exists: (relPath: string): boolean => Object.prototype.hasOwnProperty.call(files, relPath),
    read: async (relPath: string): Promise<string> => {
      const text = files[relPath]
      if (text === undefined) throw new Error('fakeDocs: 无此文件 ' + relPath)
      return text
    },
    list: () => [],
  }
}

/** 需求台账最小替身（本模块只读 id / category / artifacts / seats / sourceSessionId）。 */
function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ_ID,
    title: '裁定门用例',
    description: '',
    status: 'brainstorming',
    blocked: false,
    category: 'feature',
    // 非空 artifacts = 「非存量」。存量豁免（artifacts 空/undefined → 放行）在下面的单独用例里覆盖；
    // 其余用例必须带它，否则整组门禁断言会因为存量豁免而"全绿得毫无意义"。
    artifacts: [{ kind: 'requirement', path: REQ_PATH, stage: 'brainstorming', registeredAt: 1 }],
    // 留痕判据的窗口来源：立项来源窗口（席位折算前的老记录）+ 席位（下面单独的用例覆盖）。
    sourceSessionId: 'w-test',
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as unknown as RequirementRecord
}

/** 条款定义位（`extractClauseDefinitions` 认的 `**FR-N ...**` 形态）。 */
const REQ_DOC = [
  '# 需求说明（' + REQ_ID + '）',
  '',
  '## 功能点（需求条款）',
  '',
  '- **FR-1: 第一件事**',
  '- **FR-2: 第二件事**',
  '',
].join('\n')

/** 拼一份需求文档：正文 + 裁定节 + 紧随的另一个 H2（用于验证节区间在下一个同级标题处收口）。 */
function decisionDoc(sectionBody: string, heading = '## ' + DECISION_SECTION_NAME): string {
  return REQ_DOC + '\n' + heading + '\n\n' + sectionBody + '\n\n## 边界\n\n- 不做别的\n'
}

/** 拼一张 Markdown 表格（表头逐字五列）。 */
function table(rows: readonly (readonly string[])[]): string {
  const lines = ['| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |', '|---|---|---|---|---|']
  for (const row of rows) lines.push('| ' + row.join(' | ') + ' |')
  return lines.join('\n')
}

const GAPS_OK: readonly (readonly string[])[] = [
  ['D-1', '用户：「改成 X」', '改成 X', 'FR-1', '验收标准 1'],
  ['D-2', '用户：「不要 Y」', '不要 Y', 'FR-2', '验收标准 2'],
]

// --- 会话事件假标本 ---------------------------------------------------------

function userEvent(text: string): unknown {
  return {
    type: 'user/message',
    seq: 1,
    time: 1,
    data: { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } },
  }
}

function pluginEvent(text: string, kind = 'reqboard-handoff'): unknown {
  return {
    type: 'user/message',
    seq: 2,
    time: 2,
    data: { role: 'user', content: [{ type: 'text', text }], source: { kind } },
  }
}

/** 无祈使词的普通消息（「要 / 别 / 注意」等词表词一个都不出现）。 */
const NEUTRAL = '这个能不能优化一下'

describe('checkDecisionLogGate：缺节 / 空节（decision_log_missing）', () => {
  it('合法五列表 → 放行（undefined）', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(GAPS_OK)) }), makeReq())
    expect(fail).toBeUndefined()
  })

  it('有留痕且缺节 → decision_log_missing，文案含可执行锚点', async () => {
    const probe = { snapshotEvents: () => [userEvent('这个按钮改成蓝色吧')] }
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq(), { sessionProbe: probe })
    expect(fail?.code).toBe('decision_log_missing')
    expect(fail?.gaps?.join('')).toContain('缺「' + DECISION_SECTION_NAME + '」节')
    expect(GATE_HOW_ANCHOR.test(fail?.message ?? '')).toBe(true)
    expect(fail?.message).toContain('templates/brainstorming/feature.md')
  })

  it('缺节不拿留痕当条件：无留痕也拒（留痕只决定真空态那一步）', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq())
    expect(fail?.code).toBe('decision_log_missing')
  })

  it('节在但既无条目也未写真空态（空节）→ decision_log_missing', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc('') }), makeReq())
    expect(fail?.code).toBe('decision_log_missing')
    expect(fail?.gaps?.join('')).toContain('空节')
  })

  it('只有表头、没有条目的空表 → 视为空节（不是真空态）', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table([])) }), makeReq())
    expect(fail?.code).toBe('decision_log_missing')
  })

  it('需求文档不存在 → decision_log_missing（不抛错）', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({}), makeReq())
    expect(fail?.code).toBe('decision_log_missing')
  })
})

describe('checkDecisionLogGate：条目校验（decision_entry_invalid）', () => {
  it('缺原话来源 + 影响 FR 未命中真实条款 → gaps 同时点名 D-3 与 D-5', async () => {
    const rows = [
      GAPS_OK[0]!,
      GAPS_OK[1]!,
      ['D-3', '', '应该是 Z', 'FR-2', '验收标准 3'],
      ['D-4', '用户：「记得 W」', '记得 W', 'FR-1', '验收标准 4'],
      ['D-5', '用户：「加上 V」', '加上 V', 'FR-99', '验收标准 5'],
    ]
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(rows)) }), makeReq())
    expect(fail?.code).toBe('decision_entry_invalid')
    // 一次列全部坏条目（不是修一条报一条）：恰好两条，且逐条点名
    expect(fail?.gaps).toHaveLength(2)
    const joined = (fail?.gaps ?? []).join('\n')
    expect(joined).toContain('D-3（缺原话来源）')
    expect(joined).toContain('D-5（影响 FR 未命中真实条款')
    // 合法条目不许被牵连进来
    expect(joined).not.toContain('D-1')
    expect(joined).not.toContain('D-2')
    expect(joined).not.toContain('D-4')
  })

  it('影响 FR 写成「全 FR」这类非编号写法 → 也判未命中真实条款', async () => {
    const rows = [
      GAPS_OK[0]!,
      ['D-2', '用户：「都按你建议改」', '全按建议改', '全 FR', '验收标准 2'],
    ]
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(rows)) }), makeReq())
    expect(fail?.code).toBe('decision_entry_invalid')
    expect((fail?.gaps ?? []).join('')).toContain('D-2')
  })

  it('编号跳号 D-1, D-3 → 拒（gaps 点名缺号）', async () => {
    const rows = [GAPS_OK[0]!, ['D-3', '用户：「加上 V」', '加上 V', 'FR-2', '验收标准 3']]
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(rows)) }), makeReq())
    expect(fail?.code).toBe('decision_entry_invalid')
    expect((fail?.gaps ?? []).join('')).toContain('缺 D-2')
  })

  it('编号重复 D-2, D-2 → 拒', async () => {
    const rows = [
      GAPS_OK[0]!,
      ['D-2', '用户：「不要 Y」', '不要 Y', 'FR-2', '验收标准 2'],
      ['D-2', '用户：「记得 W」', '记得 W', 'FR-1', '验收标准 3'],
    ]
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(rows)) }), makeReq())
    expect(fail?.code).toBe('decision_entry_invalid')
    expect((fail?.gaps ?? []).join('')).toContain('D-2')
  })

  it('编号形态非法（D-ARCH-2 混进裁定表）→ 拒，且不污染 D-x 命名空间', async () => {
    const rows = [GAPS_OK[0]!, ['D-ARCH-2', '用户：「不要 Y」', '不要 Y', 'FR-2', '验收标准 2']]
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: decisionDoc(table(rows)) }), makeReq())
    expect(fail?.code).toBe('decision_entry_invalid')
    expect((fail?.gaps ?? []).join('')).toContain('D-ARCH-2')
  })
})

describe('checkDecisionLogGate：真空态（D-11）', () => {
  it('整节只写「本节无裁定」且无留痕 → 放行', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc('> ' + DECISION_VACUUM_MARKER) }),
      makeReq(),
    )
    expect(fail).toBeUndefined()
  })

  it('有留痕却只写真空态 → 仍拒（留痕判据优先）', async () => {
    const probe = { snapshotEvents: () => [userEvent('记得把阈值挪到设计阶段')] }
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc(DECISION_VACUUM_MARKER) }),
      makeReq(),
      { sessionProbe: probe },
    )
    expect(fail?.code).toBe('decision_log_missing')
    expect((fail?.gaps ?? []).join('')).toContain(DECISION_VACUUM_MARKER)
  })

  it('真空态 + 显式 trace=true → 拒；trace=false → 放行', async () => {
    const docs = fakeDocs({ [REQ_PATH]: decisionDoc(DECISION_VACUUM_MARKER) })
    const hit = await checkDecisionLogGate(docs, makeReq(), { trace: true })
    expect(hit?.code).toBe('decision_log_missing')
    const miss = await checkDecisionLogGate(docs, makeReq(), { trace: false })
    expect(miss).toBeUndefined()
  })

  it('真空态声明里夹了别的句子 = 不是真空态 → 空节拒', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc(DECISION_VACUUM_MARKER + '\n\n讨论里的补充都写在上面了') }),
      makeReq(),
    )
    expect(fail?.code).toBe('decision_log_missing')
  })
})

describe('checkDecisionLogGate：节名与适用范围（D-12）', () => {
  it('非 feature 需求 → undefined（bug/refactor/spike/doc/chore 都不要求该节）', async () => {
    for (const category of ['bug', 'refactor', 'spike', 'doc', 'chore'] as const) {
      const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq({ category }))
      expect(fail, category).toBeUndefined()
    }
  })

  it('category 缺省（存量记录）→ undefined，不追溯存量', async () => {
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq({ category: undefined }))
    expect(fail).toBeUndefined()
  })

  it('存量豁免（与 design-gates 的 isLegacy 同口径）：artifacts 空/undefined → 放行', async () => {
    // 存量 feature 需求还在 brainstorming 时其文档没有该节，不该被追溯拦死
    const noArtifacts = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq({ artifacts: undefined }))
    expect(noArtifacts).toBeUndefined()
    const emptyArtifacts = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: REQ_DOC }), makeReq({ artifacts: [] }))
    expect(emptyArtifacts).toBeUndefined()
  })

  it('artifacts 非空（非存量）且缺节 → 仍拒', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: REQ_DOC }),
      makeReq({ artifacts: [{ kind: 'requirement', path: REQ_PATH, stage: 'brainstorming', registeredAt: 1 }] as never }),
    )
    expect(fail?.code).toBe('decision_log_missing')
  })

  it('节名须逐字：写成「讨论记录」等近似名 = 缺节', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc(table(GAPS_OK), '## 讨论记录') }),
      makeReq(),
    )
    expect(fail?.code).toBe('decision_log_missing')
  })

  it('H3 同名小节不算该节（节名钉死 H2）', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc(table(GAPS_OK), '### ' + DECISION_SECTION_NAME) }),
      makeReq(),
    )
    expect(fail?.code).toBe('decision_log_missing')
  })

  it('节标题带模板惯例的 `<!-- serves: FR-8 -->` 注释仍逐字命中', async () => {
    const fail = await checkDecisionLogGate(
      fakeDocs({ [REQ_PATH]: decisionDoc(table(GAPS_OK), '## ' + DECISION_SECTION_NAME + ' <!-- serves: FR-8 -->') }),
      makeReq(),
    )
    expect(fail).toBeUndefined()
  })

  it('紧随下一个 H2 的表格不属于本节（节区间收口）', async () => {
    const text = REQ_DOC + '\n## ' + DECISION_SECTION_NAME + '\n\n' + DECISION_VACUUM_MARKER +
      '\n\n## 边界\n\n' + table([['D-1', '用户：「改成 X」', '改成 X', 'FR-1', '验收标准 1']]) + '\n'
    const fail = await checkDecisionLogGate(fakeDocs({ [REQ_PATH]: text }), makeReq())
    expect(fail).toBeUndefined()
  })

  it('真实标本：本需求 requirement.md 的 D-x 节被识别（带 serves 注释 + 全角顿号枚举）', async () => {
    const real = readFileSync(
      new URL('../docs/requirements/REQ-261005105032-3b02/requirement.md', import.meta.url),
      'utf8',
    )
    const req = makeReq({ id: 'REQ-261005105032-3b02' })
    const fail = await checkDecisionLogGate(
      fakeDocs({ 'docs/requirements/REQ-261005105032-3b02/requirement.md': real }),
      req,
    )
    // 节被识别的最强证据：不是「缺节 / 空节」（标题带 `<!-- serves: FR-8 -->` 注释仍逐字命中），
    // 而是走到了逐条校验这一步。
    expect(fail?.code).not.toBe('decision_log_missing')
    if (fail !== undefined) {
      expect(fail.code).toBe('decision_entry_invalid')
      // 标本里 `FR-1、FR-2` / `FR-8、FR-9` / `FR-2（配套）` 这些写法都必须被认成真实条款；
      // 唯一被判无效的是两处「全 FR」（D-14 / D-15，非编号写法）。
      for (const gap of fail.gaps ?? []) {
        expect(gap).toMatch(/^D-1[45]（影响 FR 未命中真实条款/)
      }
    }
  })
})

describe('hasDecisionTrace：留痕判据（§10 #20 / #23 / #24）', () => {
  it('只认 source.kind === "user"：插件自署消息不算人类发言', async () => {
    const probe = { snapshotEvents: () => [pluginEvent('改成蓝色'), pluginEvent('必须加上 X', 'dive')] }
    expect(await hasDecisionTrace(probe, makeReq())).toEqual({ hit: false })
  })

  it('人类消息命中祈使词表 → hit=true 且带原话（不概括）', async () => {
    const probe = { snapshotEvents: () => [userEvent(NEUTRAL), userEvent('这个按钮改成蓝色吧')] }
    const result = await hasDecisionTrace(probe, makeReq())
    expect(result?.hit).toBe(true)
    expect(result?.sample).toContain('改成')
  })

  it('疑问句 / 事实确认不算裁定：词表不命中 → hit=false', async () => {
    const probe = { snapshotEvents: () => [userEvent(NEUTRAL), userEvent('对，就是这样')] }
    expect(await hasDecisionTrace(probe, makeReq())).toEqual({ hit: false })
  })

  it('只扫最近 N 条（默认 200）：第 201 条（最旧）的祈使句不算留痕，limit 可覆写', async () => {
    const events = [userEvent('改成蓝色'), ...Array.from({ length: 200 }, () => userEvent(NEUTRAL))]
    const probe = { snapshotEvents: () => events }
    expect((await hasDecisionTrace(probe, makeReq()))?.hit).toBe(false)
    expect((await hasDecisionTrace(probe, makeReq(), { limit: 500 }))?.hit).toBe(true)
  })

  it('快照优先：快照读得到就不读冷路径', async () => {
    const readEvents = vi.fn(async (_key: string): Promise<readonly unknown[] | undefined> => [userEvent(NEUTRAL)])
    const probe = { snapshotEvents: () => [userEvent('必须加上 X')], readEvents }
    expect((await hasDecisionTrace(probe, makeReq()))?.hit).toBe(true)
    expect(readEvents).not.toHaveBeenCalled()
  })

  it('通道未注入 / 需求无窗口 → hit=false，不抛错', async () => {
    expect(await hasDecisionTrace(undefined, makeReq())).toEqual({ hit: false })
    expect(await hasDecisionTrace({}, makeReq())).toEqual({ hit: false })
    expect(await hasDecisionTrace({}, makeReq({ sourceSessionId: undefined }))).toEqual({ hit: false })
  })

  it('快照抛错 → 不抛给调用方（留痕判据不该让 stage 转移失败）', async () => {
    const probe = {
      snapshotEvents: (): readonly unknown[] | undefined => { throw new Error('会话服务抖动') },
    }
    expect(await hasDecisionTrace(probe, makeReq())).toEqual({ hit: false })
  })

  it('不新增数据源：只经注入端口的两条读法（端口冻结仍可读）', async () => {
    const probe = Object.freeze({
      snapshotEvents: (): readonly unknown[] | undefined => [userEvent('记得改模板')],
    })
    expect((await hasDecisionTrace(probe, makeReq()))?.hit).toBe(true)
  })

  it('窗口范围只取需求自己的席位 + 立项来源窗口', async () => {
    const seen: string[] = []
    const probe = {
      snapshotEvents: (key: string): readonly unknown[] | undefined => { seen.push(key); return [userEvent(NEUTRAL)] },
    }
    const req = makeReq({
      sourceSessionId: 'w-source',
      seats: [{ windowKey: 'w-seat', role: 'owner' }],
    } as unknown as Partial<RequirementRecord>)
    await hasDecisionTrace(probe, req)
    expect(seen).toEqual(['w-seat', 'w-source'])
  })

  it('非 feature 需求 → undefined（判据不适用，D-12）', async () => {
    const probe = { snapshotEvents: () => [userEvent('改成蓝色')] }
    expect(await hasDecisionTrace(probe, makeReq({ category: 'bug' }))).toBeUndefined()
  })

})

// §10 #24：冷读要真机会话标本，单测只覆盖快照路径——冷读用例标 @integration 且**默认不跑**
// （显式跑法见文件头；`describe.skipIf` 会让它们出现在 "skipped" 计数里，不做"跑绿了其实没跑"的错觉）。
describe.skipIf(!RUN_INTEGRATION)('@integration 冷读回落（默认跳过）', () => {
  it('@integration 只有 readEvents 的冷会话 → 命中留痕', async () => {
    const probe = {
      readEvents: async (_key: string): Promise<readonly unknown[] | undefined> => [userEvent('不要这么做')],
    }
    const result = await hasDecisionTrace(probe, makeReq())
    expect(result?.hit).toBe(true)
  })

  it('@integration 快照读不到（undefined）→ 回落冷读', async () => {
    const probe = {
      snapshotEvents: (): readonly unknown[] | undefined => undefined,
      readEvents: async (_key: string): Promise<readonly unknown[] | undefined> => [userEvent('必须加上 X')],
    }
    expect((await hasDecisionTrace(probe, makeReq()))?.hit).toBe(true)
  })
})
