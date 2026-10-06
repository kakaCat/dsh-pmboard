/**
 * RTM 校验器：编号白名单（认原型锚点前缀）+ 新节宽容度的用例（REQ-261005105032-3b02 t8 / FR-11）。
 *
 * 三条硬口径（决议 `#19`、data-model §6.4/§7）：
 *  ① 白名单认 `D-\d+`（扩前 `collectIds('D-1')` = `[]`，裁定编号对校验器不可见）；
 *  ② **锚点不判 dangling**，但也**不算编号引用**（`prototypes/x.html#FR-4` 不得让 FR-4 变"已引用"）；
 *  ③ 缺 `prototypes`/`decisions` 节 = `pending`（未采集，不判损坏）；未知 key 忽略不报错
 *     —— 存量 66 条需求的 RTM 必须读得进（本用例对**真实存量目录**全量读一遍）。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  RTM_ID_PATTERN,
  collectRTMIds,
  collectRTMPrototypeAnchors,
  findDanglingRTMReferences,
  isRTMPrototypeAnchor,
  rtmValidator,
  thresholdFor,
} from '../vendor/reqboard/src/rtm/validator.js'
import { lastReadError, readRTM } from '../vendor/reqboard/src/rtm/file-io.js'

describe('编号白名单：D-x 可见 + 原型锚点前缀（FR-11 §7.1/§7.2）', () => {
  it('collectRTMIds 认 D-1 / D-ARCH-2，且不误伤 D-1abc', () => {
    expect(collectRTMIds('D-1')).toEqual(['D-1'])
    expect(collectRTMIds('D-ARCH-2')).toEqual(['D-ARCH-2'])
    expect(collectRTMIds('D-1 D-ARCH-2')).toEqual(['D-1', 'D-ARCH-2'])
    expect(collectRTMIds('D-1abc')).toEqual([])
    expect(collectRTMIds('FR-4, TC-2, t-aaaaaa')).toEqual(['FR-4', 'TC-2', 't-aaaaaa'])
    // 白名单是单一事实源：正则里必须有 D-\d+ 这一支
    expect(RTM_ID_PATTERN).toContain('D-\\d+')
  })

  it('锚点：单列通道，既不算编号引用（禁假引用）也不是悬空', () => {
    // 锚点形态由决议 #6 定死为 `\S+#FR-\d+`：空白分隔后取到的原文就是路径形态
    const text = '设计落点 见 prototypes/x.html#FR-4 的锚点'
    // 禁假引用：锚点不得让 FR-4 变成"被引用"（§7.3 实测缺陷）
    expect(collectRTMIds(text)).toEqual([])
    expect(collectRTMIds(text)).not.toContain('FR-4')
    // 锚点原文另走一条通道
    expect(collectRTMPrototypeAnchors(text)).toEqual(['prototypes/x.html#FR-4'])
    expect(isRTMPrototypeAnchor('prototypes/x.html#FR-4')).toBe(true)
    expect(isRTMPrototypeAnchor('FR-4')).toBe(false)

    // 同一行既有编号又有锚点：只剥锚点，编号引用保留（不误伤正常 serve）
    expect(collectRTMIds('serves: FR-1, prototypes/x.html#FR-4')).toEqual(['FR-1'])
  })

  it('findDanglingRTMReferences：认不出的编号才悬空，锚点永不悬空', () => {
    const known = ['FR-1', 'D-1']
    expect(
      findDanglingRTMReferences(['FR-1', 'D-1', 'prototypes/x.html#FR-4', 'FR-99'], known),
    ).toEqual(['FR-99'])

    const verdict = rtmValidator.checkReferences(['FR-1', 'prototypes/x.html#FR-4'], known)
    expect(verdict).toEqual({
      dangling: [],
      anchors: ['prototypes/x.html#FR-4'],
      passed: true,
    })
  })
})

describe('新节宽容度：缺节 = pending、未知 key 忽略（FR-11 §6.4）', () => {
  /** 存量旧文件形态：只有 metadata + outputs.requirements，没有 prototypes / decisions 两节。 */
  const LEGACY_BRAINSTORMING = [
    'metadata:',
    '  stage: brainstorming',
    '  requirement_id: REQ-LEGACY-1',
    '  version: 7',
    'outputs:',
    '  requirements:',
    '    - id: FR-1',
    '      title: 老需求',
    '      source: requirement.md',
    '      line: 3',
    'status:',
    '  artifacts: []',
    '',
  ].join('\n')

  it('缺 prototypes / decisions 节 → 读出 pending，ok=true，不产生 error/gaps', () => {
    const report = rtmValidator.checkBrainstormingSections(parse(LEGACY_BRAINSTORMING))
    expect(report.ok).toBe(true)
    expect(report.sections.map(s => [s.section, s.state])).toEqual([
      ['outputs.prototypes', 'pending'],
      ['outputs.decisions', 'pending'],
    ])
    for (const s of report.sections) {
      expect(s.gaps).toEqual([]) // 未采集不是损坏
      expect(s.note).toContain('未采集')
    }
  })

  it('连 outputs 都没有（lifecycle 形态）也不炸：两节都 pending', () => {
    const report = rtmValidator.checkBrainstormingSections({ metadata: { version: 1 }, lifecycle: {} })
    expect(report.ok).toBe(true)
    expect(report.sections.every(s => s.state === 'pending')).toBe(true)
    expect(rtmValidator.checkBrainstormingSections(null).ok).toBe(true)
    expect(rtmValidator.checkBrainstormingSections('不是对象').ok).toBe(true)
  })

  it('含未知 key 的旧 YAML（顶层 + outputs + 条目内）→ 忽略不报错', () => {
    const yamlText = [
      'metadata:',
      '  stage: brainstorming',
      '  requirement_id: REQ-LEGACY-1',
      '  version: 7',
      '# 未来版本加的键：校验器必须忽略（前向兼容）',
      'future_block:',
      '  whatever: [1, 2, 3]',
      'outputs:',
      '  requirements: []',
      '  prototypes:',
      '    - path: prototypes/detail.html',
      '      authoritative: true',
      '      serves: [FR-1]',
      '      anchors:',
      '        - fr: FR-1',
      '          selector: "#FR-1"',
      '      geometry: []',
      '      future_field: 未来字段', // 条目内的未知 key 同样忽略
      '  decisions:',
      '    - id: D-1',
      '      source: 用户：「原型要单列」',
      '      verdict: 原型必须有唯一权威版本',
      '      serves: [FR-1]',
      '      criterion: 验收标准 1',
      '      future_field: 未来字段',
      '  future_section:',
      '    nested: true',
      'status:',
      '  future_status: ok',
      '',
    ].join('\n')
    const report = rtmValidator.checkBrainstormingSections(parse(yamlText))
    expect(report.ok).toBe(true)
    expect(report.sections.map(s => s.state)).toEqual(['ok', 'ok'])
  })

  it('形状真坏才报 error（非数组 / 条目缺必填）并点名', () => {
    const notArray = rtmValidator.checkBrainstormingSections({
      outputs: { requirements: [], prototypes: { oops: true }, decisions: [] },
    })
    expect(notArray.ok).toBe(false)
    expect(notArray.sections[0]).toMatchObject({ section: 'outputs.prototypes', state: 'error' })
    expect(notArray.sections[0]?.gaps.join()).toContain('不是数组')

    const badEntry = rtmValidator.checkBrainstormingSections({
      outputs: {
        requirements: [],
        prototypes: [{ path: '', anchors: [{ fr: 'FR-1' }] }],
        decisions: [{ id: 'E-1', source: '', verdict: 'x', serves: [], criterion: 'y' }],
      },
    })
    expect(badEntry.ok).toBe(false)
    const gaps = badEntry.sections.flatMap(s => s.gaps).join('|')
    expect(gaps).toContain('prototypes[0].path')
    expect(gaps).toContain('prototypes[0].authoritative')
    expect(gaps).toContain('prototypes[0].anchors[0]')
    expect(gaps).toContain('decisions[0].id')
    expect(gaps).toContain('decisions[0].source')
  })

  it('decomposing：task_coverage 缺节 = pending；部分卡未采集 = ok + 点名；非数组 = error', () => {
    const pending = rtmValidator.checkDecomposingSections({ outputs: {}, traceability: {} })
    expect(pending.ok).toBe(true)
    expect(pending.sections.every(s => s.state === 'pending')).toBe(true)

    const partial = rtmValidator.checkDecomposingSections({
      task_coverage: [
        { task_id: 't-aaaaaa', covers_prototypes: ['prototypes/x.html#FR-1'], covers_decisions: ['D-1'] },
        { task_id: 't-bbbbbb' }, // 老卡：缺键 = 未采集（不判坏）
      ],
    })
    expect(partial.ok).toBe(true)
    expect(partial.sections.map(s => s.state)).toEqual(['ok', 'ok'])
    expect(partial.sections[0]?.note).toContain('t-bbbbbb')

    const broken = rtmValidator.checkDecomposingSections({
      task_coverage: [{ task_id: 't-aaaaaa', covers_prototypes: 'FR-1', covers_decisions: [] }],
    })
    expect(broken.ok).toBe(false)
    expect(broken.sections[0]?.gaps.join()).toContain('task_coverage[0].covers_prototypes')
  })
})

describe('存量兼容：真实需求目录全量读取不报错（验收标准 9 / 决议 #19）', () => {
  const REQ_ROOT = join(process.cwd(), 'docs', 'requirements')

  /** 存量标本：每个需求目录下的指定 rtm 文件。 */
  function legacyFiles(name: string): string[] {
    if (!existsSync(REQ_ROOT)) return []
    return readdirSync(REQ_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => join(REQ_ROOT, d.name, name))
      .filter(p => existsSync(p))
  }

  it('全部 rtm-brainstorming.yml / rtm-decomposing.yml 读出无 error、无解析失败', () => {
    const brainstorming = legacyFiles('rtm-brainstorming.yml')
    const decomposing = legacyFiles('rtm-decomposing.yml')
    expect(brainstorming.length).toBeGreaterThan(0) // 存量标本确实存在（否则本用例是空跑）
    expect(decomposing.length).toBeGreaterThan(0)

    const broken: string[] = []
    let pendingSeen = 0
    for (const path of brainstorming) {
      const data = readRTM(path)
      expect(data, `${path} 解析失败`).not.toBeNull()
      expect(lastReadError(path), `${path} 读取留痕有错`).toBeUndefined()
      const report = rtmValidator.checkBrainstormingSections(data)
      if (!report.ok) {
        broken.push(`${path}: ${report.sections.filter(s => s.state === 'error').map(s => s.gaps.join('、')).join('；')}`)
      }
      if (report.sections.some(s => s.state === 'pending')) pendingSeen += 1
    }
    for (const path of decomposing) {
      const data = readRTM(path)
      expect(data, `${path} 解析失败`).not.toBeNull()
      expect(lastReadError(path), `${path} 读取留痕有错`).toBeUndefined()
      const report = rtmValidator.checkDecomposingSections(data)
      if (!report.ok) {
        broken.push(`${path}: ${report.sections.filter(s => s.state === 'error').map(s => s.gaps.join('、')).join('；')}`)
      }
    }

    expect(broken).toEqual([])
    // 存量里确实有一批"缺新节"的旧文件——pending 这条路是被真实数据走到的，不是纸面分支
    expect(pendingSeen).toBeGreaterThan(0)
  })
})

describe('既有门禁语义不被本次改动影响（零回归）', () => {
  it('阈值表与 checkGate 行为逐字不变', () => {
    expect(thresholdFor('design')).toBe(100)
    expect(thresholdFor('accepting')).toBe(80)
    expect(thresholdFor('不存在的节点')).toBe(100)

    const coverage = { total: 3, covered: 2, uncovered: ['FR-3'], rate: 67 }
    const failed = rtmValidator.checkDesign(coverage)
    expect(failed.passed).toBe(false)
    expect(failed.message).toContain('FR-3') // 仍点名
    expect(rtmValidator.checkAcceptance(coverage).passed).toBe(false) // 67% < 80%
    expect(rtmValidator.checkAcceptance({ ...coverage, rate: 80 }).passed).toBe(true)
  })
})
