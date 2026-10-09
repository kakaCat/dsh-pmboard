/**
 * t13（REQ-261007223647-da5d · serves: FR-1/FR-2/FR-3/FR-5/FR-6）兼容矩阵：
 * **旧数据 + 旧端**都能正常工作，不必清盘、不必同步升级。
 *
 * 为什么单开一个文件：兼容性最容易"看起来没问题"——每条卡各自的用例都绿，但只有把
 * **旧格式的输入**真的喂进**新代码**，才知道升级那天会不会把人现有的留痕 / 台账弄坏。
 * 矩阵四项：
 *  ① 旧 `capture-rejections.json`（条目无 `kind`）→ 合并读后拒绝粘滞仍命中，且**不被误判成取消**；
 *  ② 无「（推荐）」后缀的旧答案值 → 映射结果与改造前一致（不静默回落默认）；
 *  ③ 老服务端无 `pending_confirms` 键 → 客户端按 `[]` 渲染（横带不出、不报错）；
 *  ④ 旧调用方走 `absolutizeDocPath` → 三级根解析行为逐字不变。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CaptureRejectionFile } from '../src/adapters/CaptureRejectionFile.js'
import {
  CAPTURE_REJECTION_TTL_MS,
  interactionKindOf,
  recentCaptureCancels,
  recentCaptureRejection,
} from '../src/application/internal/capture-rejections.js'
import { mapCaptureAnswers, stripRecommendSuffix } from '../src/application/internal/capture-mapping.js'
import { requirementDocDirOf } from '../src/domain/requirement/DocLocation.js'
import { defineCaptureTool } from './helpers/tool-deps.js'
import { makeTestStore } from './application/harness.js'
import { parsePendingConfirms } from '../src/client/api.ts'
import { renderPendingConfirmBand } from '../src/client/views/pending-confirm.ts'
import { absolutizeDocPath, setDocWorkspaceContext } from '../src/client/open-doc.ts'
import type { CaptureRejection } from '../src/application/ports.js'

const W = 'session-compat'
const NOW = 1_700_000_000_000

/* ───────────────── ① 旧留痕文件（条目无 kind） ───────────────── */

describe('t13 ① · 旧 capture-rejections.json（无 kind 字段）', () => {
  let dir: string
  const fileOf = (): string => join(dir, 'capture-rejections.json')
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-compat-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  /** 旧格式（改造前只有 windowKey/at/title）：一个字都不迁移，直接读回。 */
  function writeLegacyFile(): void {
    writeFileSync(fileOf(), JSON.stringify([
      { windowKey: W, at: NOW - 60_000, title: '旧记录一' },
      { windowKey: 'session-other', at: NOW - 30_000 },
    ], null, 2))
  }

  it('旧条目读回不残缺，缺省按 reject 判定', async () => {
    writeLegacyFile()
    const rows = await new CaptureRejectionFile(fileOf()).readAll()
    expect(rows).toHaveLength(2)
    expect(interactionKindOf(rows[0]!)).toBe('reject')
    // 旧拒绝**不是**取消：不能因为升级就把存量拒绝算进「连续取消 3 次」的升级阈值
    expect(recentCaptureCancels(rows, W, NOW)).toBe(0)
  })

  it('旧拒绝在 TTL 内仍命中粘滞（升级不清空旧的"人说过不"）', async () => {
    writeLegacyFile()
    const rows = await new CaptureRejectionFile(fileOf()).readAll()
    expect(recentCaptureRejection(rows, W, NOW)?.title).toBe('旧记录一')
    // 出了 TTL → 不再粘滞
    expect(recentCaptureRejection(rows, W, NOW + CAPTURE_REJECTION_TTL_MS + 1)).toBeUndefined()
  })

  it('端到端：旧的拒绝留痕仍能拦住弹框（不因升级而重弹）', async () => {
    const rows: CaptureRejection[] = [{ windowKey: W, at: NOW - 60_000, title: '旧记录一' }]
    let asked = 0
    const tool = defineCaptureTool({
      store: makeTestStore(),
      now: () => NOW,
      userQuestions: () => ({ ask: async () => { asked++; return { answers: [] } } }),
      rejections: { record: () => {}, readAll: async () => rows },
    } as never) as never as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    expect(out.success).toBe(false)
    expect(asked).toBe(0) // 前置检查命中 → 一个框都不弹
    expect(String(out.note)).toContain('不需要立项')
  })
})

/* ───────────────── ② 无（推荐）后缀的旧答案值 ───────────────── */

describe('t13 ② · 旧答案值（不带推荐后缀）映射逐字不变', () => {
  const ROOTS = { sessionCwd: '/ws/session', hostCwd: '/ws/host' }

  it('旧四问作答 → 类型/算力档位/落点逐条命中，不回落默认', () => {
    const m = mapCaptureAnswers([
      { id: 'name', selected: ['旧候选名'] },
      { id: 'category', selected: ['bug'] },
      { id: 'difficulty', selected: ['advanced'] },
      { id: 'location', selected: ['docs/rfcs/'] },
    ], ROOTS)
    expect(m.title).toBe('旧候选名')
    expect(m.category).toBe('bug')
    expect(m.difficulty).toBe('advanced')
    // 落点：新映射把尾斜杠归一（'docs/rfcs/' → 'docs/rfcs'）——下游 requirementDocDirOf 对两种写法
    // 产出**同一个**目录（下面两条断言就是"结果等价"的证据），故旧台账里的写法不需要迁移。
    expect(m.docLocation).toBe('docs/rfcs')
    expect(requirementDocDirOf({ id: 'REQ-1', docBasePath: 'docs/rfcs/' })).toBe('docs/rfcs/REQ-1')
    expect(requirementDocDirOf({ id: 'REQ-1', docBasePath: 'docs/rfcs' })).toBe('docs/rfcs/REQ-1')
    expect(m.defaultsUsed).toEqual([])
  })

  it('带后缀的新答案值与旧的等价（剥后缀后同一结果）', () => {
    const oldWay = mapCaptureAnswers([
      { id: 'category', selected: ['bug'] }, { id: 'difficulty', selected: ['advanced'] },
    ], ROOTS)
    const newWay = mapCaptureAnswers([
      { id: 'category', selected: ['bug（推荐）'] }, { id: 'difficulty', selected: ['advanced（推荐）'] },
    ], ROOTS)
    expect(newWay.category).toBe(oldWay.category)
    expect(newWay.difficulty).toBe(oldWay.difficulty)
    expect(stripRecommendSuffix('bug（推荐）')).toBe('bug')
    expect(stripRecommendSuffix('bug')).toBe('bug') // 幂等
  })
})

/* ───────────────── ③ 老服务端无 pending_confirms 键 ───────────────── */

describe('t13 ③ · 老服务端（无 pending_confirms 键）→ 客户端按 [] 渲染', () => {
  it('缺键 → 宽松解析给 [] → 横带零渲染（不报错、不占首屏）', () => {
    const tickets = parsePendingConfirms(undefined)
    expect(tickets).toEqual([])
    expect(renderPendingConfirmBand(tickets, { now: NOW })).toBe('')
  })

  it('非数组的坏值同样降级为 []（中间层坏数据不炸看板）', () => {
    expect(parsePendingConfirms({ nope: 1 })).toEqual([])
    expect(renderPendingConfirmBand(parsePendingConfirms('nope'), { now: NOW })).toBe('')
  })
})

/* ───────────────── ④ 旧调用方的 absolutizeDocPath ───────────────── */

describe('t13 ④ · 旧调用方 absoluteDocPath 行为逐字不变', () => {
  it('三级根解析结果与改造前一致（含相对路径原样返回的降级）', () => {
    setDocWorkspaceContext('/server', undefined, { 'REQ-c': '/reqc' }, '/session')
    expect(absolutizeDocPath('docs/requirements/REQ-c/x.md')).toBe('/reqc/docs/requirements/REQ-c/x.md')
    expect(absolutizeDocPath('docs/other.md')).toBe('/session/docs/other.md')
    setDocWorkspaceContext('/server', undefined, {}, undefined)
    expect(absolutizeDocPath('docs/other.md')).toBe('/server/docs/other.md')
    setDocWorkspaceContext(undefined, undefined, {}, undefined)
    expect(absolutizeDocPath('docs/other.md')).toBe('docs/other.md')
    expect(absolutizeDocPath('/already/abs.md')).toBe('/already/abs.md')
  })
})
