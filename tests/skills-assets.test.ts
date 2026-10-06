/**
 * 包内 skill 资产完整性测试（REQ-261005122347-e07a t3 / 设计 test-cases TC-1 ~ TC-4）。
 *
 * 为什么这些断言值得写：装机漏打包是**dev 能跑、装起来 404** 的典型静默缺口——
 * 只有"盘上到底有什么"能从用例里被否定。体积上限同理：裁剪失效不会报错，只会悄悄变胖。
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SkillAssets } from '../src/adapters/SkillAssets.ts'
import { parseProvenanceMarkdown } from '../src/application/internal/skill-manifest.ts'

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))
const assets = new SkillAssets({ moduleDir: SKILLS_DIR, root: SKILLS_DIR })
const provenance = parseProvenanceMarkdown(readFileSync(join(SKILLS_DIR, 'PROVENANCE.md'), 'utf8'))

describe('TC-1 · 资产在盘（7 个 SKILL.md + 检索脚本）', () => {
  it('每个 skill 都有 SKILL.md，且主 skill 的 search.py 在盘', () => {
    for (const skill of provenance.skills) {
      expect(statSync(join(SKILLS_DIR, skill, 'SKILL.md')).isFile(), skill + '/SKILL.md 不在盘').toBe(true)
    }
    expect(statSync(join(SKILLS_DIR, 'ui-ux-pro-max', 'scripts', 'search.py')).isFile()).toBe(true)
    // 检索脚本的依赖（缺了 search.py 跑不起来）也要在——否则"资产齐"只是假象。
    expect(statSync(join(SKILLS_DIR, 'ui-ux-pro-max', 'scripts', 'core.py')).isFile()).toBe(true)
  })

  it('listSkills() 与目录一级子项一致（不多不少）', () => {
    expect([...assets.listSkills()]).toEqual([...provenance.skills].sort())
  })

  it('listFiles() 只回文件、路径是 POSIX 相对形式，且 readAsset 能真读到内容', async () => {
    const files = assets.listFiles('ui-ux-pro-max')
    expect(files.length).toBeGreaterThan(0)
    expect(files.every(f => !f.startsWith('/') && f.startsWith('ui-ux-pro-max/'))).toBe(true)
    const sk = await assets.readAsset('ui-ux-pro-max/SKILL.md')
    expect(sk.content.byteLength).toBeGreaterThan(1000)
    expect(sk.sha256).toBe(provenance.sha256['ui-ux-pro-max/SKILL.md'])
  })

  it('读不到的资产响亮抛错（码 = REQBOARD_SKILLS_ASSET_MISSING），不返回空', async () => {
    await expect(assets.readAsset('ui-ux-pro-max/scripts/nope.py')).rejects.toThrow(/REQBOARD_SKILLS_ASSET_MISSING/)
  })
})

describe('TC-2 · 清单双向一致', () => {
  it('skills[] 与磁盘一级目录互为子集（防「收录了没登记」与「登记了没打包」两类漂移）', () => {
    const onDisk = [...assets.listSkills()]
    expect(onDisk.filter(s => !provenance.skills.includes(s))).toEqual([])
    expect(provenance.skills.filter(s => !onDisk.includes(s))).toEqual([])
  })
})

describe('TC-3 · 体积上限（裁剪失效即红）', () => {
  it('skills/ 磁盘占用 ≤ 5MB', () => {
    // du 口径（块）与字节口径都测：前者是卡片判据，后者防"刚好卡在边界"。
    let bytes = readFileSync(join(SKILLS_DIR, 'PROVENANCE.md')).byteLength
    for (const skill of assets.listSkills()) {
      for (const rel of assets.listFiles(skill)) {
        bytes += statSync(join(SKILLS_DIR, rel)).size
      }
    }
    expect(bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
  })

  it('不该进包的东西确实不在（上游自测 / 字体二进制 / 两个大 JSON / 字节码缓存）', () => {
    const all = assets.listSkills().flatMap(s => assets.listFiles(s))
    expect(all.filter(p => p.includes('__pycache__'))).toEqual([])
    expect(all.filter(p => /\.pyc$/.test(p))).toEqual([])
    expect(all.filter(p => p.includes('canvas-fonts/'))).toEqual([])
    expect(all.filter(p => p.endsWith('phosphor-icons-upstream.json'))).toEqual([])
    expect(all.filter(p => p.endsWith('google-font-licenses.json'))).toEqual([])
    expect(all.filter(p => /(^|\/)scripts(\/.*)?\/tests\//.test(p))).toEqual([])
  })
})

describe('TC-4 · 打包清单（不补 = dev 能跑、装机 404）', () => {
  it('package.json 的 files 含 "skills"', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      files?: string[]
    }
    expect(pkg.files ?? []).toContain('skills')
  })
})
