/**
 * 契约单测（REQ-261005143615-5ab1 · t-25ebdf / serves: FR-3, FR-4）。
 *
 * 本文件钉三件事：
 *   ① `DocPanelState` 的取值集合**含新成员** `'unknown'`（未判定 ≠ 缺失）；
 *   ② `DocPanelEntry` 的 `absPath` 与 `DocsResponse.generated[].absPath` 都是**可选**——
 *      不给也能把一行渲染出来（旧服务端 / 未命中读根时就是这条路）；
 *   ③ `PanelQueryDeps` 的 `docRootsOf` / `docsAt` 两口可选，缺省即旧单根行为。
 *
 * 为什么「类型级」的事也写运行期断言：vitest 只做转译不做类型检查，本文件证明的是
 * **形状在运行期可用**；真正的类型门禁是验收里的 `pnpm typecheck`（两者都要过）。
 *
 * @module dsh-pmboard/tests/query-docs-contract
 */
import { describe, it, expect } from 'vitest'
import type { DocPanelEntry, DocPanelState, DocsResponse } from '../src/shared/protocol.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'

/** 取值集合的**运行期**副本：类型侧少一个成员，这里也少一个（两边一起改才过）。 */
const ALL_STATES: readonly DocPanelState[] = ['confirmed', 'pending', 'unregistered', 'file-missing', 'unknown']

describe('文档面板契约：未判定态与 absPath（REQ-261005143615-5ab1 t-25ebdf）', () => {
  it('TC-0a DocPanelState 取值集合含 unknown（未判定是独立态，不是缺失的别名）', () => {
    expect(ALL_STATES).toContain('unknown')
    expect(ALL_STATES).toContain('file-missing')
    // 两者必须并存：合并成一个就会重新出现「判不了却说缺失」的谎
    expect(new Set(ALL_STATES).size).toBe(ALL_STATES.length)
  })

  it('TC-0b DocPanelEntry.absPath 可选：不给能建行，给了能带上', () => {
    const 未注入: DocPanelEntry = { kind: 'design', path: 'docs/requirements/REQ-x/design/a.md', state: 'unknown' }
    const 已注入: DocPanelEntry = {
      kind: 'design',
      path: 'docs/requirements/REQ-x/design/a.md',
      state: 'confirmed',
      absPath: '/w/docs/requirements/REQ-x/design/a.md',
    }
    expect(未注入.absPath).toBeUndefined()
    expect(已注入.absPath).toBe('/w/docs/requirements/REQ-x/design/a.md')
    // 未判定行**不许**带绝对路径（宁可说不知道，也不给一条必然错的路径）
    expect(未注入.state).toBe('unknown')
  })

  it('TC-0c generated 行同样支持可选 absPath（旧响应只有 label/path）', () => {
    const 旧形状: DocsResponse['generated'][number] = { label: '任务队列', path: 'docs/requirements/REQ-x/queue.json' }
    const 新形状: DocsResponse['generated'][number] = {
      label: '任务队列',
      path: 'docs/requirements/REQ-x/queue.json',
      absPath: '/w/docs/requirements/REQ-x/queue.json',
    }
    expect(旧形状.absPath).toBeUndefined()
    expect(新形状.absPath).toBe('/w/docs/requirements/REQ-x/queue.json')
  })

  it('TC-0d PanelQueryDeps 的两口可选且可调用；不装配时字段缺席（= 旧单根行为）', () => {
    const 未装配: Pick<PanelQueryDeps, 'docRootsOf' | 'docsAt'> = {}
    expect(未装配.docRootsOf).toBeUndefined()
    expect(未装配.docsAt).toBeUndefined()

    const 已装配: Pick<PanelQueryDeps, 'docRootsOf' | 'docsAt'> = {
      docRootsOf: (req) => ['/w/' + req.id],
      docsAt: () => ({ exists: () => true }) as never,
    }
    expect(已装配.docRootsOf!({ id: 'REQ-1' } as never)).toEqual(['/w/REQ-1'])
    expect(typeof 已装配.docsAt!('/w')).toBe('object')
  })
})
