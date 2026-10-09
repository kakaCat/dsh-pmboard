/**
 * t11（REQ-261007223647-da5d · serves: FR-6 / 设计 frontend.md 组件树 RootSourceBadge）单测：
 * **地址拿不准就说不准** —— 根来源不是需求自己的根时，面板加红字，而不是静默给个打不开的路径。
 *
 * 治什么（2026-10-07 用户现场）：面板显示 `./dsh` 下的地址，文件其实在工作区/文档位置。
 * 打开行为不变（仍走现状三级回落），红字只负责**不静默**：让人一眼看出这个地址的根不可信。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  docLocationHtml,
  clearDocLocation,
} from '../src/client/req-doc-location.ts'
import { setDocWorkspaceContext, absolutizeDocPath, peekLastRootSource } from '../src/client/open-doc.ts'

const REQ = 'REQ-261007223647-da5d'
const DIR = 'docs/requirements/' + REQ

beforeEach(() => {
  clearDocLocation()
  setDocWorkspaceContext(undefined, undefined, {}, undefined)
  absolutizeDocPath('/__reset__')
})

describe('t11 · 根来源不是需求根 → 红字徽章在场', () => {
  it('只有会话根 → 徽章出现，且点名根来源（人知道该去找谁对账）', () => {
    setDocWorkspaceContext('/server-ws', undefined, {}, '/session-ws')
    const html = docLocationHtml(undefined, REQ)
    expect(html).toContain('地址可能不准')
    expect(html).toContain('dsh-pm-root-warn')
    expect(html).toContain('data-doc-root-source="session-root"')
    expect(html).toContain('会话工作区')
  })

  it('只有服务端根 → 徽章出现', () => {
    setDocWorkspaceContext('/server-ws', undefined, {}, undefined)
    const html = docLocationHtml(undefined, REQ)
    expect(html).toContain('地址可能不准')
    expect(html).toContain('data-doc-root-source="server-root"')
  })

  it('无根可回落（只能显示相对目录）→ 徽章出现（尤其不能让人以为它是绝对地址）', () => {
    setDocWorkspaceContext(undefined, undefined, {}, undefined)
    const html = docLocationHtml(undefined, REQ)
    expect(html).toContain('地址可能不准')
    expect(html).toContain('data-doc-root-source="none"')
    expect(html).toContain('无根可回落')
    // 同时仍不编绝对路径（t12 的原口径不动）
    expect(html).toContain('data-doc-dir="' + DIR + '"')
  })
})

describe('t11 · 需求级根 → 无徽章（不许给可信地址添噪音）', () => {
  it('需求级根命中 → 无红字', () => {
    setDocWorkspaceContext(undefined, undefined, { [REQ]: '/req-ws' }, '/session-ws')
    const html = docLocationHtml(undefined, REQ)
    expect(html).toContain('/req-ws/' + DIR + '/')
    expect(html).not.toContain('地址可能不准')
    expect(html).not.toContain('dsh-pm-root-warn')
  })

  it('视图自带 req-root（台账 workspaceRoot 拼出的绝对路径）→ 无红字', () => {
    setDocWorkspaceContext('/server-ws', undefined, {}, '/session-ws')
    const html = docLocationHtml(
      { dir: DIR, abs: '/req-ws/' + DIR, fromLedger: true, rootSource: 'req-root' },
      REQ,
    )
    expect(html).toContain('/req-ws/' + DIR + '/')
    expect(html).not.toContain('地址可能不准')
  })

  it('视图自带 session-root → 有红字（视图来源优先于全局读数）', () => {
    // 全局读数是 req-root，但这条视图是用会话根拼的——必须按视图说话
    setDocWorkspaceContext(undefined, undefined, { [REQ]: '/req-ws' }, undefined)
    const html = docLocationHtml(
      { dir: DIR, abs: '/session-ws/' + DIR, fromLedger: true, rootSource: 'session-root' },
      REQ,
    )
    expect(html).toContain('地址可能不准')
    expect(html).toContain('data-doc-root-source="session-root"')
  })

  it('旧调用方手搓的视图（有 abs、无 rootSource）→ 不加噪音（地址已由权威方拼好）', () => {
    const html = docLocationHtml({ dir: DIR, abs: '/whatever/' + DIR, fromLedger: true }, REQ)
    expect(html).not.toContain('地址可能不准')
  })
})

describe('t11 · 卡上判据的字面复现（peek 读数 ↔ 徽章）', () => {
  it('peekLastRootSource() ≠ req-root → 有徽章；= req-root → 无徽章', () => {
    // 非 req-root：会话根解析一次，读数即 session-root
    setDocWorkspaceContext('/server-ws', undefined, {}, '/session-ws')
    absolutizeDocPath(DIR)
    expect(peekLastRootSource()).not.toBe('req-root')
    expect(docLocationHtml(undefined, REQ)).toContain('地址可能不准')

    // req-root：需求级根命中
    setDocWorkspaceContext(undefined, undefined, { [REQ]: '/req-ws' }, '/session-ws')
    absolutizeDocPath(DIR)
    expect(peekLastRootSource()).toBe('req-root')
    expect(docLocationHtml(undefined, REQ)).not.toContain('地址可能不准')
  })
})
