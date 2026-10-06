/**
 * 健康检查**适用性判据**回归（REQ-261005105032-3b02 t9 · FR-5 / FR-11 · 决议 #19 / brief §5）。
 *
 * 要解决的冲突（brief §10 #19）：一边要「UI 需求缺 `prototypes` 节 = 不健康并点名」，
 * 一边要「存量需求不被判不健康」。出路是**适用性判据**——只有 `sides` 含 frontend **且**
 * `createdAt ≥ prototypeRulesSince`（插件配置常量，缺省 = 规则上线日）的需求才判；
 * 更早创建的一律 `exempted: 'legacy'` 并如实报告。
 *
 * 标本都是临时目录里的真文件（`requirement.md` 的 front-matter + `rtm-*.yml`），
 * 关注点只有判据本身，故每例只落最少文件。
 *
 * 覆盖的验收锚点（逐条对应 t9 卡面）：
 *   ① 存量标本（createdAt < prototypeRulesSince）缺节 → `exempted: legacy` 且**不判不健康**；
 *   ② 新标本（createdAt ≥ prototypeRulesSince 且 sides 含 frontend）缺节 → 不健康并**点名该需求**；
 *   ③ 有节 / 非 UI 需求 / YAML 判不了 → 三种"不该报红"的情形都不报红（不误判）；
 *   ④ `expectedRTMFiles()` 不因新增节多出文件（集合逐字不变；6 vs 卡面「7 项」的出入见用例注释）。
 *
 * @module dsh-pmboard/tests/rtm-health-legacy
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROTOTYPE_RULES_SINCE,
  checkRTMHealth,
  expectedRTMFiles,
  prototypeSectionVerdict,
  prototypesSectionPresent,
} from '../src/application/internal/rtm-health.js'
import type { ActorRef, RequirementRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-261005105032-t9h'
const HUMAN: ActorRef = { kind: 'human' }
const DAY = 86_400_000

/** 只给健康检查要用的字段：status=brainstorming ⇒ 期望 lifecycle + brainstorming 两份。 */
function makeReq(createdAt: number): RequirementRecord {
  return {
    id: REQ_ID,
    title: 't9 健康判据标本',
    description: '标本',
    category: 'feature',
    status: 'brainstorming',
    blocked: false,
    comments: [],
    version: 1,
    createdAt,
    updatedAt: createdAt + 1,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [],
    artifacts: [],
  }
}

/** 需求文档 front-matter（`sides` 是"什么算 UI 需求"的唯一判据来源）。 */
function writeReqDoc(root: string, sides: string): void {
  const path = join(root, 'docs', 'requirements', REQ_ID, 'requirement.md')
  mkdirSync(join(root, 'docs', 'requirements', REQ_ID), { recursive: true })
  writeFileSync(path, ['---', `sides: ${sides}`, '---', '', '# 需求说明', ''].join('\n'))
}

/** 落一份 RTM YAML（`withPrototypes` 决定有没有 `outputs.prototypes` 节）。 */
function writeBrainstormingYaml(root: string, text: string): void {
  writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-brainstorming.yml'), text)
}

/** 有 `outputs.prototypes` 节的最小 YAML。 */
const YAML_WITH_PROTOTYPES = [
  'metadata:',
  '  stage: brainstorming',
  'outputs:',
  '  requirements: []',
  '  prototypes:',
  '    - path: prototypes/detail.html',
  'status:',
  '  artifacts: []',
  '',
].join('\n')

/** 缺 `outputs.prototypes` 节的最小 YAML（存量形态）。 */
const YAML_WITHOUT_PROTOTYPES = [
  'metadata:',
  '  stage: brainstorming',
  'outputs:',
  '  requirements: []',
  'status:',
  '  artifacts: []',
  '',
].join('\n')

describe('RTM 健康检查：原型节适用性判据（t9）', () => {
  let root: string
  let stateDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rtm-health-legacy-'))
    stateDir = join(root, '.dsh-data', 'state')
    mkdirSync(stateDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('① 存量标本（createdAt < 上线日）缺节 → exempted: legacy，不判不健康', () => {
    const req = makeReq(PROTOTYPE_RULES_SINCE - DAY)
    writeReqDoc(root, '[frontend, backend]')
    writeBrainstormingYaml(root, YAML_WITHOUT_PROTOTYPES)
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req)

    expect(health.healthy).toBe(true)
    expect(health.exempted).toBe('legacy')
    expect(health.missing_files).toEqual([])
    // 不判不健康 ⇒ 不点名（"不准不健康"与"点名"必须同进同退）
    expect('gaps' in health).toBe(false)
  })

  it('② 新标本（≥ 上线日且 sides 含 frontend）缺节 → 不健康并点名该需求', () => {
    const req = makeReq(2_000)
    writeReqDoc(root, '[frontend, backend]')
    writeBrainstormingYaml(root, YAML_WITHOUT_PROTOTYPES)
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req, { prototypeRulesSince: 1_000 })

    expect(health.healthy).toBe(false)
    expect(health.missing_files).toEqual([]) // 文件都在，红的是内容（静默降级）
    expect(health.gaps).toHaveLength(1)
    expect(health.gaps?.[0]).toContain(REQ_ID) // 点名该需求
    expect(health.gaps?.[0]).toContain('prototypes')
    expect('exempted' in health).toBe(false) // 新需求不谈豁免
  })

  it('③ 新标本已有 prototypes 节 → 健康（不因新增判据产生假红）', () => {
    const req = makeReq(2_000)
    writeReqDoc(root, '[frontend, backend]')
    writeBrainstormingYaml(root, YAML_WITH_PROTOTYPES)
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req, { prototypeRulesSince: 1_000 })

    expect(health.healthy).toBe(true)
    expect('gaps' in health).toBe(false)
    expect('exempted' in health).toBe(false)
  })

  it('③b sides 不含 frontend → 判据不适用（不给非 UI 需求加仪式）', () => {
    const req = makeReq(2_000)
    writeReqDoc(root, '[backend]')
    writeBrainstormingYaml(root, YAML_WITHOUT_PROTOTYPES)
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req, { prototypeRulesSince: 1_000 })

    expect(health.healthy).toBe(true)
    expect('gaps' in health).toBe(false)
    expect('exempted' in health).toBe(false)
  })

  it('③c YAML 判不了（解析失败）→ 按宽容度不判不健康（存量坏文件不误报）', () => {
    const req = makeReq(2_000)
    writeReqDoc(root, '[frontend]')
    writeBrainstormingYaml(root, '这不是 YAML 对象')
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req, { prototypeRulesSince: 1_000 })

    expect(health.healthy).toBe(true)
    expect('gaps' in health).toBe(false)
  })

  it('③d 缺 rtm-brainstorming.yml 文件 → 由 missing_files 点名，不重复判"缺节"', () => {
    const req = makeReq(2_000)
    writeReqDoc(root, '[frontend]')
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

    const health = checkRTMHealth(root, stateDir, req, { prototypeRulesSince: 1_000 })

    expect(health.healthy).toBe(false)
    expect(health.missing_files).toEqual(['rtm-brainstorming.yml'])
    expect('gaps' in health).toBe(false) // 一个缺口只点一次名（文件缺 ≠ 节缺）
  })

  it('④ expectedRTMFiles() 不变：不因新增 prototypes 节多出一份文件', () => {
    // 卡面写「仍返回 7 项」。实测（改动前后同源）：本函数最多 **6** 份——仓库里出现过的
    // `rtm-*.yml` 只有 6 个名字（lifecycle / brainstorming / design / decomposing / implementing /
    // accepting）；第 7 个"节点"是 `rtm-implementing/<task>.yml`（按任务生成，无法由 status 推出），
    // 故「7 份」若指 YAML **文件**，与实现的 6 份不符——已作为裁决点回报给卡主（不改函数语义）。
    // 这里锁的是卡面真正要的那件事：**集合逐字不变**（不因新节多出一份）。
    expect(expectedRTMFiles('done')).toEqual([
      'rtm-lifecycle.yml',
      'rtm-brainstorming.yml',
      'rtm-design.yml',
      'rtm-decomposing.yml',
      'rtm-implementing.yml',
      'rtm-accepting.yml',
    ])
    expect(expectedRTMFiles('draft')).toEqual([])
    expect(expectedRTMFiles('brainstorming')).toEqual(['rtm-lifecycle.yml', 'rtm-brainstorming.yml'])
  })

  it('⑤ 适用性判据本体（纯函数）：required / exempted / gaps 三层', () => {
    const legacy = prototypeSectionVerdict({
      reqId: REQ_ID, createdAt: 1, sides: ['frontend'], brainstormingText: YAML_WITHOUT_PROTOTYPES, rulesSince: 1_000,
    })
    expect(legacy).toEqual({ required: false, exempted: 'legacy', gaps: [] })

    const ui = prototypeSectionVerdict({
      reqId: REQ_ID, createdAt: 2_000, sides: ['frontend', 'backend'], brainstormingText: YAML_WITHOUT_PROTOTYPES, rulesSince: 1_000,
    })
    expect(ui.required).toBe(true)
    expect(ui.gaps).toHaveLength(1)

    const backendOnly = prototypeSectionVerdict({
      reqId: REQ_ID, createdAt: 2_000, sides: ['backend'], brainstormingText: YAML_WITHOUT_PROTOTYPES, rulesSince: 1_000,
    })
    expect(backendOnly).toEqual({ required: false, gaps: [] })
  })

  it('⑥ 节存在性判定的三态（有节 / 确定缺节 / 判不了）', () => {
    expect(prototypesSectionPresent(YAML_WITH_PROTOTYPES)).toBe(true)
    expect(prototypesSectionPresent(YAML_WITHOUT_PROTOTYPES)).toBe(false)
    expect(prototypesSectionPresent('outputs:\n  requirements: []\n')).toBe(false)
    expect(prototypesSectionPresent(undefined)).toBeUndefined() // 文件不在
    expect(prototypesSectionPresent('这不是 YAML 对象')).toBeUndefined() // 解析出来不是对象
    expect(prototypesSectionPresent('not: [valid')).toBeUndefined() // YAML 语法坏
  })
})
