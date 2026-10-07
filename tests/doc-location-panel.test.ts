/**
 * 需求文档位置：单一解析点 + 面板显示（2026-10-06 用户现场「生成文件的地址和面板里的文档地址不一致」）。
 *
 * serves: 现场缺陷的核心口径——
 *   TC-1 目录/文件同源：`requirementDocDirOf` 由 `requirementDocPathOf` 派生（不许各拼一份）
 *   TC-2 台账 `docBasePath` 真的被消费：换过位置的需求（docs/rfcs/）host 侧投影跟着走
 *   TC-3 面板显示真实落点：给了位置 → 绝对路径 + 台账相对路径小字（与详情页同形态）
 *   TC-4 取不到不编：没有位置 → 逐字回旧口径（老服务端行为不变，**不**造绝对路径）
 */
import { describe, it, expect } from 'vitest'
import { requirementDocDirOf, requirementDocPathOf, DEFAULT_DOC_BASE_PATH } from '../src/domain/requirement/DocLocation.js'
import { designDocStatus, designDocNamesOf } from '../src/application/internal/design-docs.js'
import { renderNodePanel } from '../src/client/node-panel.js'
import { docLocationHtml, clearDocLocation } from '../src/client/req-doc-location.js'
import { setDocWorkspaceContext } from '../src/client/open-doc.js'
import type { RequirementRecord, StageDetail, StageOverview, StageKey } from '../src/shared/protocol.js'
import { ALL_STAGE_KEYS } from '../src/shared/protocol.js'

describe('TC-1 需求文档位置唯一解析点', () => {
  it('缺省 / 无 docBasePath → docs/requirements/<id>/requirement.md（与改造前逐字节一致）', () => {
    expect(requirementDocPathOf(undefined)).toBe('')
    expect(requirementDocPathOf({ id: 'REQ-1' })).toBe('docs/requirements/REQ-1/requirement.md')
    expect(requirementDocPathOf({ id: 'REQ-1', docBasePath: DEFAULT_DOC_BASE_PATH }))
      .toBe('docs/requirements/REQ-1/requirement.md')
  })
  it('占位符替换 / 无占位符追加 id 子目录 / 尾斜杠归一', () => {
    expect(requirementDocPathOf({ id: 'REQ-1', docBasePath: 'docs/guides/<REQ>-guide/' }))
      .toBe('docs/guides/REQ-1-guide/requirement.md')
    expect(requirementDocPathOf({ id: 'REQ-1', docBasePath: 'docs/rfcs/' }))
      .toBe('docs/rfcs/REQ-1/requirement.md')
    expect(requirementDocPathOf({ id: 'REQ-1', docBasePath: 'docs/rfcs' }))
      .toBe('docs/rfcs/REQ-1/requirement.md')
  })
  it('docLinks.requirement 优先级最高（人工改过位置的老记录）', () => {
    expect(requirementDocPathOf({ id: 'REQ-1', docBasePath: 'docs/rfcs/', docLinks: { requirement: 'docs/x/req.md' } }))
      .toBe('docs/x/req.md')
  })
  it('目录由文件路径派生（两者不许各拼一份）', () => {
    expect(requirementDocDirOf({ id: 'REQ-1' })).toBe('docs/requirements/REQ-1')
    expect(requirementDocDirOf({ id: 'REQ-1', docBasePath: 'docs/rfcs/' })).toBe('docs/rfcs/REQ-1')
    expect(requirementDocDirOf(undefined)).toBe('')
  })
})

describe('TC-2 host 侧投影消费台账 docBasePath', () => {
  const req = (over: Partial<RequirementRecord>): RequirementRecord => ({
    id: 'REQ-x', title: 't', description: '', status: 'design', blocked: false, category: 'feature', ...over,
  } as RequirementRecord)

  it('designDocStatus：路径 = 台账位置 + /design/<name>（换过位置的需求不再指到默认目录）', () => {
    const rows = designDocStatus(req({ docBasePath: 'docs/rfcs/' }), 'feature')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.path.startsWith('docs/rfcs/REQ-x/design/'))).toBe(true)
    // 缺省位置行为不变
    expect(designDocStatus(req({}), 'feature').every(r => r.path.startsWith('docs/requirements/REQ-x/design/'))).toBe(true)
  })

  it('designDocNamesOf：扫的是台账位置下的 design/ 目录（扫错目录 = 谎报"一份都没交"）', () => {
    const asked: string[] = []
    const scan = {
      list: (dir: string) => {
        asked.push(dir)
        return dir === 'docs/rfcs/REQ-x/design' ? [{ name: 'architecture.md', isFile: true }] : []
      },
    }
    expect(designDocNamesOf(scan, req({ docBasePath: 'docs/rfcs/' }))).toEqual(['architecture.md'])
    expect(asked).toContain('docs/rfcs/REQ-x/design')
  })
})

// ─────────────────────────── 面板显示 ───────────────────────────

function makeOverview(stage: StageKey): StageOverview {
  const bodies: Record<string, unknown> = {
    draft: { title: '面板文档地址', category: 'feature', description: 'x', sourceWindow: 'w-abc123', createdAt: 1693000000000 },
  }
  return {
    requirementId: 'REQ-2026', category: 'feature', currentStage: stage,
    stages: ALL_STAGE_KEYS.map(s => ({
      stage: s, enabled: true, artifacts: [], pendingConfirmation: false, timeline: [], body: bodies[s] ?? {},
    })) as unknown as StageDetail[],
  }
}

function draftPanel(input: { id: string; docDir?: unknown }): string {
  return renderNodePanel({
    overview: makeOverview('draft'),
    stage: 'draft',
    requirement: input as never,
  })
}

describe('TC-3 面板显示真实文档位置', () => {
  it('给了位置（台账解析出来的 dir + abs）→ 显示绝对路径，并附台账相对路径小字', () => {
    const html = draftPanel({
      id: 'REQ-2026',
      docDir: { dir: 'docs/rfcs/REQ-2026', abs: '/Users/me/proj/docs/rfcs/REQ-2026', fromLedger: true },
    })
    expect(html).toContain('/Users/me/proj/docs/rfcs/REQ-2026/')
    expect(html).toContain('台账路径：docs/rfcs/REQ-2026/')
    expect(html).toContain('data-doc-from-ledger="yes"')
    // 事故根因不许复活：面板不再自己拼默认目录
    expect(html).not.toContain('docs/requirements/REQ-2026/')
  })

  it('只有相对目录（拼不出绝对路径）→ 原样显示相对目录，不编绝对路径', () => {
    const html = draftPanel({ id: 'REQ-2026', docDir: { dir: 'docs/rfcs/REQ-2026', fromLedger: true } })
    expect(html).toContain('data-doc-dir="docs/rfcs/REQ-2026"')
    expect(html).toContain('>docs/rfcs/REQ-2026/<')
    expect(html).not.toContain('台账路径：')
  })
})

describe('TC-4 取不到台账 → 逐字回旧口径（老服务端行为不变）', () => {
  it('没有 docDir：仍显示 docs/requirements/<id>/，且不标 from-ledger', () => {
    const html = draftPanel({ id: 'REQ-2026' })
    expect(html).toContain('docs/requirements/REQ-2026/')
    expect(html).not.toContain('data-doc-from-ledger="yes"')
  })

  it('docLocationHtml：缓存里有工作区根时把旧口径也绝对化（显示与详情页同一口径）', () => {
    setDocWorkspaceContext('/Users/me/proj', undefined, { 'REQ-2026': '/Users/me/proj' })
    clearDocLocation()
    const html = docLocationHtml(undefined, 'REQ-2026')
    expect(html).toContain('/Users/me/proj/docs/requirements/REQ-2026/')
    expect(html).toContain('台账路径：docs/requirements/REQ-2026/')
  })
})
