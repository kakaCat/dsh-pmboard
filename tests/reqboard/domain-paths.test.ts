/**
 * L1 领域单测 · 分片数据根路径约定（REQ-261002161439-277d · t1 / FR-2、FR-3、FR-4）。
 *
 * 覆盖卡上验收 ① 与 ④：
 *  - 7 个文件名常量与 `<root>/requirements/<REQ>/record.json` 的拼接、冷存落在 `archive/` 下；
 *  - `domain/` 三模块的 import 图里**不出现 `node:`**（domain 不许碰 I/O）。
 *
 * 为什么把"路径拼接"当契约测：路径写错的症状是"数据写在这、读去那"，表现为看板静默空白——
 * 正是本需求要消灭的那类静默分歧（与 `queuePath.ts` 同款理由）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ARCHIVE_DIR,
  ARCHIVE_FILE,
  ARTIFACTS_FILE,
  COMMENTS_FILE,
  HISTORY_FILE,
  META_FILE,
  PATHS_ERROR,
  PLAN_FILE,
  RECORD_FILE,
  REQUIREMENTS_DIR,
  REQUIREMENT_FILES,
  VERIFICATION_FILE,
  archiveDir,
  isColdStatus,
  isRequirementId,
  journalPath,
  metaPath,
  objectPath,
  recordPath,
  requirementDir,
  requirementIdOfDirName,
  requirementsDir,
} from '../../src/domain/requirement/ReqboardPaths.js'

const ROOT = '/data/reqboard'
const REQ = 'REQ-261002161439-277d'
const LEGACY_REQ = 'REQ-47939a'

describe('常量：文件名与目录名是单一事实源', () => {
  it('7 个文件名常量各就各位，且清单恰好是这 7 个', () => {
    expect(REQUIREMENT_FILES).toEqual([
      'record.json',
      'comments.jsonl',
      'history.jsonl',
      'artifacts.json',
      'plan.json',
      'verification.json',
      'archive.json',
    ])
    expect([RECORD_FILE, COMMENTS_FILE, HISTORY_FILE, ARTIFACTS_FILE, PLAN_FILE, VERIFICATION_FILE, ARCHIVE_FILE])
      .toEqual([...REQUIREMENT_FILES])
  })

  it('目录名常量：热侧 requirements / 冷侧 archive / 全局 meta.json', () => {
    expect(REQUIREMENTS_DIR).toBe('requirements')
    expect(ARCHIVE_DIR).toBe('archive')
    expect(META_FILE).toBe('meta.json')
  })
})

describe('路径拼接：热侧、冷侧与全局', () => {
  it('record.json 落在 <root>/requirements/<REQ>/ 下', () => {
    expect(recordPath(ROOT, REQ)).toBe(`${ROOT}/requirements/${REQ}/record.json`)
    expect(requirementsDir(ROOT)).toBe(`${ROOT}/requirements`)
    expect(requirementDir(ROOT, REQ)).toBe(`${ROOT}/requirements/${REQ}`)
  })

  it('冷存路径落在 archive/ 下', () => {
    expect(archiveDir(ROOT)).toBe(`${ROOT}/archive`)
    expect(requirementDir(ROOT, REQ, { cold: true })).toBe(`${ROOT}/archive/${REQ}`)
    expect(recordPath(ROOT, REQ, { cold: true })).toBe(`${ROOT}/archive/${REQ}/record.json`)
  })

  it('两类追加日志与四个外置对象各有归属，文件名不串档', () => {
    expect(journalPath(ROOT, REQ, 'comments')).toBe(`${ROOT}/requirements/${REQ}/comments.jsonl`)
    expect(journalPath(ROOT, REQ, 'history')).toBe(`${ROOT}/requirements/${REQ}/history.jsonl`)
    expect(objectPath(ROOT, REQ, 'artifacts')).toBe(`${ROOT}/requirements/${REQ}/artifacts.json`)
    expect(objectPath(ROOT, REQ, 'plan')).toBe(`${ROOT}/requirements/${REQ}/plan.json`)
    expect(objectPath(ROOT, REQ, 'verification')).toBe(`${ROOT}/requirements/${REQ}/verification.json`)
    expect(objectPath(ROOT, REQ, 'archive')).toBe(`${ROOT}/requirements/${REQ}/archive.json`)
    // 冷侧的日志/对象同样可用（回滚脚本要读归档需求的全套文件）
    expect(journalPath(ROOT, REQ, 'comments', { cold: true })).toBe(`${ROOT}/archive/${REQ}/comments.jsonl`)
    expect(objectPath(ROOT, REQ, 'plan', { cold: true })).toBe(`${ROOT}/archive/${REQ}/plan.json`)
  })

  it('meta.json 在数据根下，不在任何需求目录里', () => {
    expect(metaPath(ROOT)).toBe(`${ROOT}/meta.json`)
  })

  it('根路径带尾斜杠不产生重复分隔符', () => {
    expect(recordPath(`${ROOT}/`, REQ)).toBe(`${ROOT}/requirements/${REQ}/record.json`)
  })
})

describe('需求 id 形态：拒绝越权与脏值', () => {
  it('接受两种代际的 id', () => {
    expect(isRequirementId(REQ)).toBe(true)
    expect(isRequirementId(LEGACY_REQ)).toBe(true)
  })

  it('拒绝会跳出数据根的形态，且拼接函数响亮抛错（不静默退回默认路径）', () => {
    const bad = ['../escape', 'REQ-../x', '../../etc/passwd', '', '.', '/abs/path', 'REQ-261002161439-277d/../..', 'REQ-261002161439-277D', 'req-261002161439-277d']
    for (const value of bad) {
      expect(isRequirementId(value)).toBe(false)
      expect(() => recordPath(ROOT, value)).toThrowError()
      try {
        recordPath(ROOT, value)
      } catch (err) {
        expect((err as { code?: string }).code).toBe(PATHS_ERROR.INVALID_ID)
      }
    }
  })

  it('目录名反推 id：非需求目录返回 undefined（临时目录 / .corrupt 残留不该被当需求）', () => {
    expect(requirementIdOfDirName(REQ)).toBe(REQ)
    expect(requirementIdOfDirName('record.json')).toBeUndefined()
    expect(requirementIdOfDirName('REQ-261002161439-277d.corrupt-123')).toBeUndefined()
    expect(requirementIdOfDirName('.tmp')).toBeUndefined()
  })
})

describe('冷热侧判定', () => {
  it('archived 与 done 属冷侧，其余属热侧', () => {
    expect(isColdStatus('archived')).toBe(true)
    expect(isColdStatus('done')).toBe(true)
    for (const hot of ['draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'canceled']) {
      expect(isColdStatus(hot)).toBe(false)
    }
  })
})

describe('domain 层不许碰 I/O（import 图检查）', () => {
  const SRC = fileURLToPath(new URL('../../src', import.meta.url))
  const ENTRIES = [
    'domain/requirement/ReqboardPaths.ts',
    'domain/requirement/RequirementSummary.ts',
    'domain/requirement/Journal.ts',
  ]

  /** 抽取 import 的模块说明符（与 tests/layer-boundary.test.ts 同款正则）。 */
  function extractImports(text: string): string[] {
    const specs: string[] = []
    const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) specs.push(m[1]!)
    return specs
  }

  it('三模块及其 domain 内可达的相对依赖，都不 import node:', () => {
    const seen = new Set<string>()
    const violations: string[] = []
    const visit = (abs: string): void => {
      if (seen.has(abs) || !existsSync(abs)) return
      seen.add(abs)
      const text = readFileSync(abs, 'utf8')
      const inDomain = abs.startsWith(resolve(SRC, 'domain'))
      for (const spec of extractImports(text)) {
        if (inDomain && spec.startsWith('node:')) violations.push(`${abs.slice(SRC.length + 1)} → ${spec}`)
        if (!spec.startsWith('.')) continue
        const base = resolve(dirname(abs), spec.replace(/\.js$/, ''))
        if (existsSync(`${base}.ts`)) visit(`${base}.ts`)
        else if (existsSync(base)) visit(base)
      }
    }
    for (const rel of ENTRIES) visit(resolve(SRC, rel))

    expect(violations).toEqual([])
    // 防假绿：三个入口都必须真的被走到（路径写错时不能安静通过）
    expect(seen.size).toBeGreaterThanOrEqual(ENTRIES.length)
    for (const rel of ENTRIES) expect(seen.has(resolve(SRC, rel))).toBe(true)
  })
})
