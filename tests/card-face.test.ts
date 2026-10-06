/**
 * 卡面产物 chips + 五门确认入口 + 派生展示 单测（REQ-31e11f t7；REQ-261006175040-12d4 t6 改为读读数）。
 *
 * ## 为什么夹具只给**摘要字段**（REQ-261006175040-12d4 FR-7）
 *
 * 首屏 `GET /state` 自 B12 阶段⑥-① 起只下发摘要，卡面**拿不到** `artifacts` / `plan` /
 * `verification` / `archive`。旧用例直接用全量记录造夹具，把这条缝整个绕过去 ——
 * 于是「四门恒红 + 产物 0/6 + 确认按钮永不出现」在测试全绿的情况下上线。
 * 本文件的夹具只给 `gates` / `planState` / `archivePrepared` 三枚读数（外加摘要标量）。
 *
 * 钉住的性质：三态 chip 文案逐字、派生行只出「门 c/总数」、确认按钮只在当前门 pending 时在场、
 * 计划/验收/归档 chip 读读数、**读数缺省时整块不渲染**（读不到 ≠ 缺失）。
 *
 * serves: FR-1, FR-3, FR-4, FR-5, FR-6
 */
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../src/client/view.ts'
import type { BoardState, GateReading, RequirementRecord } from '../src/client/types.ts'

// -- 测试数据构造 ---------------------------------------------------------

let seq = 0
const rid = (p: string) => `${p}-${String(++seq).padStart(6, '0')}`

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: rid('REQ'), title: '需求', description: '', status: 'draft',
    blocked: false, comments: [], version: 1,
    createdAt: 1700000000000, updatedAt: 1700000000000,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  }
}

function makeState(over: Partial<BoardState> = {}): BoardState {
  return { revision: 1, requirements: [], tasks: [], ready: {}, ...over }
}

type Status = 'confirmed' | 'pending' | 'missing'
type Kind = 'requirement' | 'design' | 'decomposition' | 'verification'

/** feature 四门读数（顺序 = 分类生效门顺序；客户端不排序、不筛选）。 */
function featureGates(statuses: readonly Status[], counts?: readonly number[]): GateReading[] {
  const kinds: readonly Kind[] = ['requirement', 'design', 'decomposition', 'verification']
  return kinds.map((kind, i) => ({
    kind,
    status: statuses[i] ?? 'missing',
    count: counts?.[i] ?? (statuses[i] === 'missing' ? 0 : 1),
  }))
}

// -- 产物 chip 三态（读读数）----------------------------------------------

describe('产物 chips（读服务端下发的门读数）', () => {
  it('已确认 / 待确认 / 缺失三态逐字渲染（✓ / ⏳ / ✗ + 中文名）', () => {
    const req = makeReq({
      id: 'REQ-chip-three',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['confirmed', 'pending', 'missing', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('✓ 需求文档')
    expect(html).toContain('⏳ 设计文档')
    expect(html).toContain('✗ 拆分计划')
    expect(html).toContain('✗ 验收材料')
    expect(html).toContain('dsh-pm-artifact-chip confirmed')
    expect(html).toContain('dsh-pm-artifact-chip pending')
    expect(html).toContain('dsh-pm-artifact-chip missing')
  })

  it('待确认 chip 本身就是按钮（同一条 confirm-artifact 通道）', () => {
    const req = makeReq({
      id: 'REQ-chip-pending-btn',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['pending', 'missing', 'missing', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    const chipBtn = html.match(/<button[^>]*class="dsh-pm-artifact-chip pending"[^>]*>/g)
    expect(chipBtn).not.toBeNull()
    expect(chipBtn![0]).toContain('data-action="confirm-artifact"')
    expect(chipBtn![0]).toContain('data-kind="requirement"')
  })

  it('卡面渲染的 chip 条数 = 读数条数（哪些门生效由服务端决定）', () => {
    const req = makeReq({
      id: 'REQ-chip-bug-three',
      status: 'design',
      category: 'bug',
      gates: [
        { kind: 'design', status: 'pending', count: 1 },
        { kind: 'decomposition', status: 'missing', count: 0 },
        { kind: 'verification', status: 'missing', count: 0 },
      ],
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    // 只在 chips 区块里断言：整页 HTML 还含泳道副标题（desc 里就有「写拆分计划」），宽断言会误伤
    const chipsBlock = /<div class="dsh-pm-artifact-chips">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    // 条数 = 读数条数（三枚），且只渲染读数里给的门——「哪些门生效」是服务端的判定（t1/t2 覆盖）
    expect((chipsBlock.match(/dsh-pm-artifact-chip /g) ?? []).length).toBe(3)
    expect(chipsBlock).toContain('设计文档')
    expect(chipsBlock).toContain('拆分计划')
    expect(chipsBlock).not.toContain('需求文档')
  })

  it('读数缺省（旧服务端）⇒ chips 行、派生行、确认按钮**整块不渲染**，且不冒充缺失', () => {
    const req = makeReq({ id: 'REQ-no-readings', status: 'brainstorming', category: 'feature' })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).not.toContain('dsh-pm-artifact-chips')
    expect(html).not.toContain('dsh-pm-artifact-derived')
    expect(html).not.toContain('确认产物')
    // 关键：读不到 ≠ 缺失 —— 不得出现红 ✗ 与旧口径
    expect(html).not.toContain('✗ ')
    expect(html).not.toContain('产物 0/6')
    expect(html).not.toContain('门 0/4')
  })
})

// -- 派生行（门 c/总数）----------------------------------------------------

describe('派生行：门 已确认/生效门总数', () => {
  it('三已确认一无 ⇒ 门 3/4', () => {
    const req = makeReq({
      id: 'REQ-derived-34',
      status: 'implementing',
      category: 'feature',
      gates: featureGates(['confirmed', 'confirmed', 'confirmed', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('门 3/4')
  })

  it('一门未落章 ⇒ 门 0/4，且不再出现「产物 N/M」与「N 门待确认」两段旧口径', () => {
    const req = makeReq({
      id: 'REQ-derived-04',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['pending', 'missing', 'missing', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('门 0/4')
    expect(html).not.toContain('产物 ')
    expect(html).not.toContain('门待确认')
  })

  it('design 成组确认：多份里一份未落章 ⇒ 该门 pending（读数由服务端给，卡面照读数渲染）', () => {
    const req = makeReq({
      id: 'REQ-derived-group',
      status: 'design',
      category: 'feature',
      gates: featureGates(['confirmed', 'pending', 'missing', 'missing'], [1, 6, 0, 0]),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('⏳ 设计文档')
    expect(html).toContain('门 1/4')
  })
})

// -- 确认入口卡面外置 ------------------------------------------------------

describe('确认入口卡面外置（只在当前门待确认时在场）', () => {
  it('当前门（brainstorming ⇒ requirement）待确认 ⇒ 卡面有「确认产物」主按钮', () => {
    const req = makeReq({
      id: 'REQ-confirm-btn',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['pending', 'missing', 'missing', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('确认产物')
    expect(html).toContain('data-action="confirm-artifact"')
    expect(html).toContain('data-id="REQ-confirm-btn"')
    expect(html).toContain('data-kind="requirement"')
    // 按钮在卡面正面（不是详情抽屉里）
    expect(html).not.toContain('dsh-pm-detail')
  })

  it('design 门待确认 ⇒ 文案写明份数（份数来自读数 count，客户端不自己数）', () => {
    const req = makeReq({
      id: 'REQ-confirm-design',
      status: 'design',
      category: 'feature',
      gates: featureGates(['confirmed', 'pending', 'missing', 'missing'], [1, 6, 0, 0]),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('确认产物（全部 6 份）')
    expect(html).toContain('data-kind="design"')
  })

  it('当前门已落章 ⇒ 不显示按钮', () => {
    const req = makeReq({
      id: 'REQ-no-confirm-btn',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['confirmed', 'missing', 'missing', 'missing']),
    })
    expect(buildBoard(makeState({ requirements: [req] }))).not.toContain('确认产物')
  })

  it('当前门缺失（无产物）⇒ 不显示按钮（不给点了必被拒的假按钮）', () => {
    const req = makeReq({
      id: 'REQ-missing-no-btn',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['missing', 'missing', 'missing', 'missing']),
    })
    expect(buildBoard(makeState({ requirements: [req] }))).not.toContain('确认产物')
  })

  it('无门状态（draft）⇒ 不显示按钮', () => {
    const req = makeReq({
      id: 'REQ-draft-no-btn',
      status: 'draft',
      category: 'feature',
      gates: featureGates(['pending', 'missing', 'missing', 'missing']),
    })
    expect(buildBoard(makeState({ requirements: [req] }))).not.toContain('确认产物')
  })

  it('读数缺省 ⇒ 不显示按钮（读不到不等于待确认）', () => {
    const req = makeReq({ id: 'REQ-readingless-no-btn', status: 'brainstorming', category: 'feature' })
    expect(buildBoard(makeState({ requirements: [req] }))).not.toContain('确认产物')
  })
})

// -- 计划 / 验收 / 归档 chip ------------------------------------------------

describe('计划 chip（读 planState）', () => {
  it('待批 / 已批 / 被退三态', () => {
    const pending = makeReq({ id: 'REQ-plan-pending', status: 'decomposing', category: 'feature', gates: [], planState: 'pending' })
    const approved = makeReq({ id: 'REQ-plan-approved', status: 'decomposing', category: 'feature', gates: [], planState: 'approved' })
    const rejected = makeReq({ id: 'REQ-plan-rejected', status: 'decomposing', category: 'feature', gates: [], planState: 'rejected' })
    const html = buildBoard(makeState({ requirements: [pending, approved, rejected] }))
    expect(html).toContain('计划待批')
    expect(html).toContain('计划已批')
    expect(html).toContain('计划被退')
  })

  it('读数缺省（无计划记录）⇒ 不渲染计划 chip', () => {
    const req = makeReq({ id: 'REQ-plan-none', status: 'decomposing', category: 'feature', gates: [] })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).not.toContain('计划待批')
    expect(html).not.toContain('计划已批')
    expect(html).not.toContain('计划被退')
  })
})

describe('验收 / 归档 chip（读读数）', () => {
  it('accepting：verification 门 missing ⇒ 待验收材料；pending ⇒ 待人工审核', () => {
    const notSubmitted = makeReq({
      id: 'REQ-verify-missing', status: 'accepting', category: 'feature',
      gates: featureGates(['confirmed', 'confirmed', 'confirmed', 'missing']),
    })
    const submitted = makeReq({
      id: 'REQ-verify-pending', status: 'accepting', category: 'feature',
      gates: featureGates(['confirmed', 'confirmed', 'confirmed', 'pending']),
    })
    const html = buildBoard(makeState({ requirements: [notSubmitted, submitted] }))
    expect(html).toContain('待验收材料')
    expect(html).toContain('待人工审核')
  })

  it('accepting 但读数缺省 ⇒ 两个验收 chip 都不渲染（不谎报）', () => {
    const req = makeReq({ id: 'REQ-verify-noreading', status: 'accepting', category: 'feature' })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).not.toContain('待验收材料')
    expect(html).not.toContain('待人工审核')
  })

  it('done：archivePrepared true ⇒ 待归档；false ⇒ 待归档材料；缺省 ⇒ 不渲染', () => {
    const prepared = makeReq({ id: 'REQ-archive-ok', status: 'done', category: 'feature', gates: [], archivePrepared: true })
    const missing = makeReq({ id: 'REQ-archive-missing', status: 'done', category: 'feature', gates: [], archivePrepared: false })
    const unknown = makeReq({ id: 'REQ-archive-unknown', status: 'done', category: 'feature', gates: [] })
    const html = buildBoard(makeState({ requirements: [prepared, missing, unknown] }))
    expect(html).toContain('待归档<')
    expect(html).toContain('待归档材料')
    // 三条卡：只有前两条出 chip（unknown 那条不出）
    const chips = html.match(/dsh-pm-flag archive-pending/g) ?? []
    expect(chips.length).toBe(2)
  })
})

// -- 列表行「归档材料待补」--------------------------------------------------

describe('列表行：归档材料待补（读 archivePrepared）', () => {
  it('archivePrepared === false ⇒ 出现预警 chip', () => {
    const req = makeReq({ id: 'REQ-list-missing', status: 'archived', category: 'feature', archivePrepared: false })
    const html = buildBoard(makeState({ requirements: [req] }), Date.now(), 'list')
    expect(html).toContain('归档材料待补')
  })

  it('archivePrepared === true 或读数缺省 ⇒ 不出现预警 chip', () => {
    const ok = makeReq({ id: 'REQ-list-ok', status: 'archived', category: 'feature', archivePrepared: true })
    const unknown = makeReq({ id: 'REQ-list-unknown', status: 'archived', category: 'feature' })
    const html = buildBoard(makeState({ requirements: [ok, unknown] }), Date.now(), 'list')
    expect(html).not.toContain('归档材料待补')
  })
})

// -- confirm-artifact 动作属性 ----------------------------------------------

describe('confirm-artifact 动作', () => {
  it('待确认 chip + 主按钮都带 confirm-artifact data-action（两条入口同一条通道）', () => {
    const req = makeReq({
      id: 'REQ-action-btn',
      status: 'brainstorming',
      category: 'feature',
      gates: featureGates(['pending', 'missing', 'missing', 'missing']),
    })
    const html = buildBoard(makeState({ requirements: [req] }))
    const btnMatch = html.match(/<button[^>]*data-action="confirm-artifact"[^>]*>/g)
    expect(btnMatch).not.toBeNull()
    expect(btnMatch!.length).toBeGreaterThanOrEqual(2) // 待确认 chip + 主按钮
  })
})
