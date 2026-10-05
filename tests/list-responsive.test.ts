/**
 * 列表视图自适应契约单测（REQ-260930194112-1ab8 t1）。
 *
 * 覆盖四件事（对应设计 interfaces.md I-1/I-2/I-4 与 test-cases.md TC-1/2/3/5）：
 * - TC-1 表格被 .dsh-pm-table-wrap 包裹（横向滚动兜底的结构前提）
 * - TC-2 列类名在 thead 与每条数据行里成对出现，分组头行不带列类名
 * - TC-3 分组头 colspan 仍为 8（隐藏列由 CSS 承担，不改 markup 列数口径）
 * - TC-5 空列表分支不含表格与滚动容器
 *
 * TC-4（CSS 规则齐备）由 t2 落地后追加。
 */
import { describe, expect, it } from 'vitest'
import { buildListView } from '../src/client/views/board.ts'
import { BOARD_CSS } from '../src/client/styles/board.ts'
import type { BoardState, RequirementRecord } from '../src/client/types.ts'

const T0 = 1_700_000_000_000

/** 需要按宽度让位的四列（顺序 = 表格列序：分类/进度/负责人/更新时间）。 */
const COL_CLASSES = [
  'dsh-pm-col-cat',
  'dsh-pm-col-progress',
  'dsh-pm-col-owner',
  'dsh-pm-col-when',
] as const

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-260930183951-eb6c',
    title: '修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续',
    description: '',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: T0 - 86_400_000,
    updatedAt: T0,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    ...over,
  }
}

function makeState(over: Partial<BoardState> = {}): BoardState {
  return { revision: 1, requirements: [], tasks: [], ready: {}, ...over }
}

const count = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 取出全部数据行（`<tr class="dsh-pm-list-row…">…</tr>`）与分组头行。 */
function splitRows(html: string): { dataRows: string[]; groupHeads: string[] } {
  return {
    dataRows: html.match(/<tr class="dsh-pm-list-row[\s\S]*?<\/tr>/g) ?? [],
    groupHeads: html.match(/<tr class="dsh-pm-list-grouphead"[\s\S]*?<\/tr>/g) ?? [],
  }
}

describe('列表视图自适应契约（REQ-260930194112-1ab8）', () => {
  it('TC-1 表格被滚动容器包裹（窄宽度兜底的结构前提）', () => {
    const html = buildListView(makeState({ requirements: [makeReq()] }), T0)
    const wrapAt = html.indexOf('<div class="dsh-pm-table-wrap">')
    const tableAt = html.indexOf('<table class="dsh-pm-table">')
    expect(wrapAt).toBeGreaterThan(-1)
    expect(tableAt).toBeGreaterThan(wrapAt)
    // 表格必须整个落在容器内：紧邻闭合
    expect(html).toContain('</table></div>')
  })

  it('TC-2 列类名在表头与每条数据行里成对出现，分组头行不带', () => {
    const html = buildListView(makeState({
      requirements: [makeReq(), makeReq({ id: 'REQ-260930182521-4fee', status: 'done' })],
    }), T0)
    const thead = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'))
    for (const cls of COL_CLASSES) expect(count(thead, cls)).toBe(1)

    const { dataRows, groupHeads } = splitRows(html)
    expect(dataRows.length).toBe(2)
    for (const row of dataRows) {
      for (const cls of COL_CLASSES) expect(count(row, cls)).toBe(1)
    }
    expect(groupHeads.length).toBeGreaterThan(0)
    for (const head of groupHeads) {
      for (const cls of COL_CLASSES) expect(count(head, cls)).toBe(0)
    }
  })

  it('TC-3 分组头 colspan 保持 8（列数口径不变）', () => {
    const html = buildListView(makeState({
      requirements: [makeReq(), makeReq({ id: 'REQ-260930182521-4fee', status: 'done' })],
    }), T0)
    const { groupHeads } = splitRows(html)
    expect(groupHeads.length).toBeGreaterThan(0)
    for (const head of groupHeads) expect(head).toContain('colspan="8"')
    expect(count(html, 'colspan="8"')).toBe(groupHeads.length)
  })

  it('TC-5 空列表分支不含表格与滚动容器', () => {
    const html = buildListView(makeState({ requirements: [] }), T0)
    expect(html).toContain('暂无进行中的需求')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('dsh-pm-table-wrap')
  })

  it('TC-4 自适应样式规则齐备（缺一即窄屏塌陷）', () => {
    // ① 保底横向滚动
    expect(BOARD_CSS).toContain('overflow-x: auto')
    expect(BOARD_CSS).toContain('min-width: 720px')
    // ② 关键列不换行 + 标题列例外
    expect(BOARD_CSS).toContain('white-space: nowrap')
    expect(BOARD_CSS).toMatch(/\.dsh-pm-td-title\s*\{[^}]*white-space: normal/)
    // ③ 操作列按钮不可压缩
    expect(BOARD_CSS).toContain('min-width: max-content')
    expect(BOARD_CSS).toMatch(/dsh-pm-list-actions \.dsh-pm-card-actions\s*\{[^}]*flex: none/)
    // ④ 两个宽度档位与四个列类名
    expect(BOARD_CSS).toContain('max-width: 1180px')
    expect(BOARD_CSS).toContain('max-width: 880px')
    for (const cls of COL_CLASSES) expect(BOARD_CSS).toContain(`.${cls}`)
  })
})
