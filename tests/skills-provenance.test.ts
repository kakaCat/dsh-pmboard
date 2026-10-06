/**
 * skill 资产指纹与投放清单契约测试（REQ-261005122347-e07a t2 / 设计 test-cases TC-15、TC-16）。
 *
 * 重点：**篡改必红**。指纹最容易变成「写了个字段但没人用」——所以这里既测正向一致
 * （包内资产 ↔ PROVENANCE、盘上树 ↔ manifest），也测判定本身确实会红（改哈希 / 删文件 / 多文件）。
 * 反向演练记录见本需求 `notes/`。
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildManifest,
  isSha256Hex,
  manifestNeedsRebuild,
  parseProvenanceMarkdown,
  SKILL_MANIFEST_SCHEMA,
  verifyManifest,
  verifyProvenance,
  type SkillFileFingerprint,
  type SkillManifestV1,
} from '../src/application/internal/skill-manifest.ts'
import { skillsSettings } from '../src/plugin-config.ts'

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))
const PROVENANCE_PATH = join(SKILLS_DIR, 'PROVENANCE.md')

const sha256 = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex')

function fingerprintFiles(rels: readonly string[]): Record<string, SkillFileFingerprint> {
  const out: Record<string, SkillFileFingerprint> = {}
  for (const rel of rels) {
    const buf = readFileSync(join(SKILLS_DIR, rel))
    out[rel] = { sha256: sha256(buf), bytes: buf.byteLength }
  }
  return out
}

const provenance = parseProvenanceMarkdown(readFileSync(PROVENANCE_PATH, 'utf8'))
const fingerprintedPaths = Object.keys(provenance.sha256).sort()

describe('PROVENANCE.md 形状（设计 data-model §1）', () => {
  it('关键字段齐全，且来源/许可/commit 是实测值', () => {
    expect(provenance.source).toBe('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill')
    expect(provenance.license).toBe('MIT')
    expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(provenance.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('sha256 表覆盖每个 skill 的 SKILL.md 与全部 scripts/**/*.py，且都是合法 hex', () => {
    const rels = new Set(fingerprintedPaths)
    for (const skill of provenance.skills) {
      expect(rels.has(skill + '/SKILL.md'), skill + ' 缺 SKILL.md 指纹').toBe(true)
    }
    const pyEntries = fingerprintedPaths.filter(p => p.endsWith('.py'))
    expect(pyEntries.length, 'scripts/**/*.py 一条都没登记').toBeGreaterThan(0)
    for (const p of fingerprintedPaths) {
      expect(isSha256Hex(provenance.sha256[p]), p + ' 的 sha256 不是 64 位小写 hex').toBe(true)
    }
  })

  it('trimmed 每条都有 glob/bytes/why（理由要能被人否决）', () => {
    expect(provenance.trimmed.length).toBeGreaterThan(0)
    for (const rule of provenance.trimmed) {
      expect(rule.glob.length).toBeGreaterThan(0)
      expect(rule.bytes).toBeGreaterThan(0)
      expect(rule.why.length).toBeGreaterThan(0)
    }
  })

  it('skills[] 与 skills/ 下一级目录双向一致（多一个/少一个都红）', () => {
    const onDisk = readdirSync(SKILLS_DIR)
      .filter(name => statSync(join(SKILLS_DIR, name)).isDirectory())
      .sort()
    expect([...onDisk]).toEqual([...provenance.skills].sort())
  })

  it('越限即红：缺字段 / 空 sha256 / 未闭合 front-matter 一律抛错，不静默返回空表', () => {
    expect(() => parseProvenanceMarkdown('no frontmatter here')).toThrow(/front-matter/)
    expect(() => parseProvenanceMarkdown('---\nsource: x\n')).toThrow(/未闭合/)
    expect(() => parseProvenanceMarkdown('---\nsource: x\nlicense: MIT\ncommit: c\nfetchedAt: d\nskills:\n  - a\nsha256:\n---\n'))
      .toThrow(/sha256/)
  })
})

describe('TC-15 · 包内资产与 PROVENANCE 指纹一致（内容被手改即红）', () => {
  it('逐文件实算 sha256 = 登记值（全部一致）', () => {
    const actual = fingerprintFiles(fingerprintedPaths)
    expect(verifyProvenance(actual, provenance)).toEqual([])
  })

  it('改一个字节 → 判定必红（用同一条判定路径验证，不靠"应该没问题"）', () => {
    const actual = fingerprintFiles(fingerprintedPaths)
    const victim = fingerprintedPaths.find(p => p.endsWith('SKILL.md'))!
    const tampered = { ...actual, [victim]: { ...actual[victim]!, sha256: sha256(Buffer.from('tampered')) } }
    const mismatches = verifyProvenance(tampered, provenance)
    expect(mismatches.map(m => m.rel)).toContain(victim)
    expect(mismatches[0]!.kind).toBe('content-mismatch')
  })

  it('删文件 / 登记值非法 → 分别判 file-missing 与 schema-unsupported', () => {
    const actual = fingerprintFiles(fingerprintedPaths)
    const victim = fingerprintedPaths[0]!
    const withoutOne = { ...actual }
    delete withoutOne[victim]
    expect(verifyProvenance(withoutOne, provenance).map(m => m.kind)).toContain('file-missing')

    const broken = { ...provenance, sha256: { ...provenance.sha256, [victim]: 'not-a-hash' } }
    expect(verifyProvenance(actual, broken)[0]!.kind).toBe('schema-unsupported')
  })

  it('PROVENANCE 缺失 → 判 manifest-missing（视为未投放，而不是"内容都对"）', () => {
    expect(verifyProvenance({}, null)).toEqual([{ rel: '<manifest>', kind: 'manifest-missing' }])
  })
})

describe('TC-16 · 投放清单校验（手改投放目录里一个文件即红）', () => {
  const files = fingerprintFiles(fingerprintedPaths)
  const manifest: SkillManifestV1 = buildManifest({
    plugin: { name: 'dsh-pmboard', version: '0.1.0', build: 'test' },
    source: { commit: provenance.commit, license: provenance.license },
    materializedAt: 1700000000000,
    root: '/tmp/ws/.dsh/skills',
    files,
    trimmed: provenance.trimmed.map(t => t.glob),
    searchScript: 'ui-ux-pro-max/scripts/search.py',
  })

  it('buildManifest 规整形状：schema 常量、键排序、哈希小写', () => {
    expect(manifest.schema).toBe(SKILL_MANIFEST_SCHEMA)
    const keys = Object.keys(manifest.files)
    expect(keys).toEqual([...keys].sort())
    expect(manifest.trimmed).toEqual([...manifest.trimmed].sort())
    for (const k of keys) expect(isSha256Hex(manifest.files[k]!.sha256)).toBe(true)
  })

  it('逐项比对：盘上树与清单全等 → 零不一致', () => {
    expect(verifyManifest(files, manifest)).toEqual([])
  })

  it('手改一个文件（内容变）→ content-mismatch；少一个文件 → file-missing；多一个 → file-extra', () => {
    const victim = fingerprintedPaths.find(p => p.endsWith('SKILL.md'))!
    const changed = { ...files, [victim]: { ...files[victim]!, sha256: sha256(Buffer.from('x')) } }
    expect(verifyManifest(changed, manifest).map(m => m.kind)).toContain('content-mismatch')

    const fewer = { ...files }
    delete fewer[victim]
    expect(verifyManifest(fewer, manifest).map(m => m.kind)).toContain('file-missing')

    const more = { ...files, 'ui-ux-pro-max/data/extra.csv': { sha256: sha256(Buffer.from('y')), bytes: 1 } }
    expect(verifyManifest(more, manifest).map(m => m.kind)).toContain('file-extra')
  })

  it('清单缺失 / schema 不识别 → 视为未投放（走整目录重建），不是内容篡改', () => {
    expect(verifyManifest(files, null)).toEqual([{ rel: '<manifest>', kind: 'manifest-missing' }])
    const v2 = { ...manifest, schema: 2 } as unknown as SkillManifestV1
    const mismatches = verifyManifest(files, v2)
    expect(mismatches[0]!.kind).toBe('schema-unsupported')
    expect(manifestNeedsRebuild(mismatches)).toBe(true)
    expect(manifestNeedsRebuild([{ rel: 'a', kind: 'content-mismatch' }])).toBe(false)
  })
})

describe('skills 配置解析（FR-7：非法值装配期抛错）', () => {
  it('缺省开启、不指定 root', () => {
    expect(skillsSettings(undefined)).toEqual({ enabled: true })
    expect(skillsSettings({})).toEqual({ enabled: true })
    expect(skillsSettings({ skills: {} })).toEqual({ enabled: true })
  })

  it('显式关闭与显式 root 原样生效', () => {
    expect(skillsSettings({ skills: { enabled: false } })).toEqual({ enabled: false })
    expect(skillsSettings({ skills: { root: '/tmp/ws/.dsh/skills' } }))
      .toEqual({ enabled: true, root: '/tmp/ws/.dsh/skills' })
  })

  it('非布尔 enabled → 抛错，且 message 含错误码（验收判据）', () => {
    expect(() => skillsSettings({ skills: { enabled: 'no' as never } }))
      .toThrow(/REQBOARD_SKILLS_CONFIG_INVALID/)
    expect(() => skillsSettings({ skills: { enabled: 1 as never } }))
      .toThrow(/skills\.enabled/)
  })

  it('root 非绝对 / 空串 → 抛错（静默回落会让「我设了」变成错觉）', () => {
    expect(() => skillsSettings({ skills: { root: 'relative/path' } })).toThrow(/REQBOARD_SKILLS_CONFIG_INVALID/)
    expect(() => skillsSettings({ skills: { root: '   ' } })).toThrow(/REQBOARD_SKILLS_CONFIG_INVALID/)
  })
})
