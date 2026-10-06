/**
 * **跨缝**用例：只喂摘要字段的卡面渲染断言（REQ-261006175040-12d4 · t7 / FR-1、FR-3、FR-6、FR-7 · D-6）。
 *
 * ## 这条缝为什么会漏（本用例存在的唯一理由）
 *
 * 首屏 `GET /state` 只下发**摘要**（REQ-261002161439-277d B12 阶段⑥-①）：`artifacts` / `plan` /
 * `verification` / `archive` 属大字段，一个都不带。卡面原先就地读 `req.artifacts` 判门状态 ⇒
 * 每条需求都被算成「四门缺失」，卡面常年四红 ✗ + `产物 0/6` + 「确认产物」按钮永不出现
 * （缺陷现场与复现读数见 `docs/requirements/REQ-261006175040-12d4/evidence/before-repro.md`）。
 *
 * 既有单测直接用**全量记录**造夹具，把这条缝整个绕过去 —— 于是缺陷在测试全绿的情况下上线。
 * 本文件的夹具**只给摘要字段**（标量 + `gates` / `planState` / `archivePrepared` 三枚读数），
 * 一旦有人把卡面改回「读 `req.artifacts`」或把「读不到」下发成 `missing`，这里立刻红。
 *
 * ## 逆验证（改动前必红，人工取证）
 *
 * `evidence/inverse-verification.md` 记录两次受控改坏的实测输出：
 *   ① 把 `gatesOf` 改回「从 `req.artifacts` 现算」（旧实现形态）⇒ 本文件必红；
 *   ② 把「读数缺省」当成 `missing`（渲染成红 ✗）⇒ 本文件必红。
 *
 * serves: FR-1, FR-3, FR-6, FR-7
 */
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../src/client/view.ts'
import type { BoardState, GateReading, RequirementRecord } from '../src/client/types.ts'

/**
 * 摘要形状夹具：**只有** `/state` 真正下发的字段。
 *
 * 刻意不给 `artifacts` / `plan` / `verification` / `archive` —— 它们不在摘要里；
 * 给了就等于把这条缝重新绕过去（本用例的证伪力全靠"不给"）。
 */
function summaryShape(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-261006130057-7a43',
    title: 'PM 插件需求详情页 UI 优化（原型先行）',
    description: '',
    status: 'implementing',
    blocked: false,
    category: 'feature',
    comments: [],
    version: 89,
    createdAt: 1791262857854,
    updatedAt: 1791280122935,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

/** 该需求在台账里的真实读数（需求文档 / 6 份设计文档 / 拆分计划已落章；验收材料未登记）。 */
const REAL_READINGS: GateReading[] = [
  { kind: 'requirement', status: 'confirmed', count: 1 },
  { kind: 'design', status: 'confirmed', count: 6 },
  { kind: 'decomposition', status: 'confirmed', count: 1 },
  { kind: 'verification', status: 'missing', count: 0 },
]

function board(req: RequirementRecord): string {
  const state: BoardState = { revision: 1, requirements: [req], tasks: [], ready: {} }
  return buildBoard(state)
}

describe('跨缝：摘要形状（无大字段）也能渲染出正确门状态', () => {
  it('四门全落章 + 验收未交 ⇒ ✓✓✓✗ + 门 3/4（不再出现 产物 0/6）', () => {
    const html = board(summaryShape({ gates: REAL_READINGS, planState: 'approved', archivePrepared: false }))
    expect(html).toContain('✓ 需求文档')
    expect(html).toContain('✓ 设计文档')
    expect(html).toContain('✓ 拆分计划')
    expect(html).toContain('✗ 验收材料')
    expect(html).toContain('门 3/4')
    expect(html).not.toContain('产物 0/6')
    expect(html).not.toContain('产物 ')
    // 夹具里确实没有大字段（否则本用例证明不了"跨缝"）
    expect(html).not.toContain('dsh-pm-detail')
  })

  it('读数缺省（旧服务端）⇒ 门相关块整块不渲染，且**不出现** ✗ 与 产物 0/6', () => {
    const html = board(summaryShape())
    expect(html).not.toContain('dsh-pm-artifact-chips')
    expect(html).not.toContain('dsh-pm-artifact-derived')
    expect(html).not.toContain('确认产物')
    expect(html).not.toContain('✗ ')
    expect(html).not.toContain('产物 0/6')
    expect(html).not.toContain('门 0/4')
    // 其余卡面照常（不是白卡）
    expect(html).toContain('PM 插件需求详情页 UI 优化（原型先行）')
  })

  it('两种形态必须**可区分**：真缺一件（读数在、该门 missing）仍要显示红 ✗', () => {
    const withMissingGate = board(summaryShape({
      gates: [
        { kind: 'requirement', status: 'confirmed', count: 1 },
        { kind: 'design', status: 'missing', count: 0 },
        { kind: 'decomposition', status: 'missing', count: 0 },
        { kind: 'verification', status: 'missing', count: 0 },
      ],
    }))
    expect(withMissingGate).toContain('✗ 设计文档')
    expect(withMissingGate).toContain('门 1/4')
    // 与"读不到"（上一条）形成对照：一个渲染缺失，一个整块不渲染
    expect(board(summaryShape())).not.toContain('✗ 设计文档')
  })

  it('当前门待确认时，按钮按读数在场（尺寸/份数取自 count）', () => {
    const html = board(summaryShape({
      status: 'design',
      gates: [
        { kind: 'requirement', status: 'confirmed', count: 1 },
        { kind: 'design', status: 'pending', count: 6 },
        { kind: 'decomposition', status: 'missing', count: 0 },
        { kind: 'verification', status: 'missing', count: 0 },
      ],
    }))
    expect(html).toContain('确认产物（全部 6 份）')
    expect(html).toContain('门 1/4')
  })
})
