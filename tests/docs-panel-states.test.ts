// serves: FR-3, FR-4
/**
 * 文档行三态与绝对路径的渲染单测（REQ-261005143615-5ab1 · t-88ecd1）。
 *
 * 面板 render 是**纯字符串函数**（本包没有 jsdom），断言全部落在字符串上：
 *   TC-5：给了 `absPath` 的行 → 显示与 `data-open-doc` 都用**绝对路径**，
 *         同时把小字台账相对路径（`data-doc-relpath`）留在旁边供对账；
 *   TC-6：`unknown` 行 → 文案说「未判定」，HTML 里**不含** `line-through` 与 `dsh-pm-doc-missing`
 *         （那是"文件缺失"的画法，不能拿来画"判不了"）；`file-missing` 行**仍含**两者（不许被改坏）。
 *
 * @module dsh-pmboard/tests/docs-panel-states
 */
import { describe, it, expect } from 'vitest'
import { docsPanel } from '../src/client/views/panels/docs.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import type { DocPanelEntry, DocsResponse } from '../src/shared/protocol.js'

const REQ = 'REQ-261005143615-5ab1'
const DIR = 'docs/requirements/' + REQ
const ABS_ROOT = '/Users/mac/Documents/ai/dsh/dsh-pmboard'

/** 面板上下文：本用例只走纯渲染，取数/开正文都不该被触发。 */
const CTX: ReportTabCtx = {
  requirementId: REQ,
  load: () => Promise.reject(new Error('纯渲染不该取数')),
  openDoc: () => { /* 纯渲染不开正文 */ },
}

function render(documents: DocPanelEntry[], generated: DocsResponse['generated'] = []): string {
  const data: DocsResponse = { documents, generated, gates: [] }
  return docsPanel.render(data, CTX)
}

const IN_DISK: DocPanelEntry = {
  kind: 'requirement',
  path: DIR + '/requirement.md',
  state: 'confirmed',
  absPath: ABS_ROOT + '/' + DIR + '/requirement.md',
}
const MISSING: DocPanelEntry = { kind: 'design', path: DIR + '/design/interfaces.md', state: 'file-missing' }
const UNKNOWN: DocPanelEntry = { kind: 'design', path: DIR + '/design/architecture.md', state: 'unknown' }

describe('TC-5 有 absPath 的行：显示与打开都走绝对路径（FR-4）', () => {
  it('data-open-doc 等于绝对路径，且同时保留台账相对路径小字', () => {
    const html = render([IN_DISK])
    expect(html).toContain('data-open-doc="' + ABS_ROOT + '/' + DIR + '/requirement.md"')
    expect(html).toContain('data-doc-relpath="' + DIR + '/requirement.md"')
    // FR-6 紧凑表（REQ-261006130057-7a43 t8）：路径格是纯文本（等宽 <span>），
    // 打开入口独立成「打开」列——显示的是绝对路径（用户要的口径），不是裸相对路径
    expect(html).toContain('>' + ABS_ROOT + '/' + DIR + '/requirement.md</span>')
    // 「打开」按钮也指向绝对路径（同一 data-open-doc 委派）
    const openBtn = html.slice(html.indexOf('dsh-pm-doc-cell-open'))
    expect(openBtn).toContain('data-open-doc="' + ABS_ROOT + '/' + DIR + '/requirement.md"')
  })

  it('生成物行同规则：有 absPath 就用它打开', () => {
    const html = render([], [{ label: '任务队列', path: DIR + '/queue.json', absPath: ABS_ROOT + '/' + DIR + '/queue.json' }])
    expect(html).toContain('data-open-doc="' + ABS_ROOT + '/' + DIR + '/queue.json"')
  })

  it('没给 absPath（旧服务端）→ 逐字回旧显示：只有相对路径、无 relpath 小字', () => {
    const html = render([{ kind: 'requirement', path: DIR + '/requirement.md', state: 'pending' }])
    expect(html).toContain('data-open-doc="' + DIR + '/requirement.md"')
    expect(html).not.toContain('data-doc-relpath')
  })
})

describe('TC-6 unknown 与 file-missing 的画法必须能分辨（FR-3）', () => {
  it('unknown 行：说「未判定」，不划线、不套 dsh-pm-doc-missing', () => {
    const html = render([UNKNOWN])
    expect(html).toContain('data-doc-state-text="unknown"')
    expect(html).toContain('未判定')
    expect(html).toContain('读根不可得')
    expect(html).not.toContain('dsh-pm-doc-missing')
    expect(html).not.toContain('line-through')
  })

  it('file-missing 行：仍是划线 + dsh-pm-doc-missing + 「文件缺失」（既有语义不许被改坏）', () => {
    const html = render([MISSING])
    expect(html).toContain('dsh-pm-doc-missing')
    expect(html).toContain('line-through')
    expect(html).toContain('文件缺失')
    expect(html).toContain('data-file-missing="1"')
  })

  it('两种状态同页并存时，划线只出现在缺失那一行', () => {
    const html = render([MISSING, UNKNOWN])
    const rows = html.split('</tr>')
    const missingRow = rows.find(r => r.includes('interfaces.md')) ?? ''
    const unknownRow = rows.find(r => r.includes('architecture.md')) ?? ''
    expect(missingRow).toContain('line-through')
    expect(unknownRow).not.toContain('line-through')
  })
})
