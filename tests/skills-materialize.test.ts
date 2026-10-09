/**
 * skill 投放测试（REQ-261005122347-e07a t3 / 设计 test-cases TC-5 ~ TC-9）。
 *
 * 全部用**真写盘 + 真读盘**（临时目录），只有解释器探测喂替身：
 * 幂等与事务性这两条只有在真文件系统上才证得动（内存假实现会把"没写"和"写对了"混为一谈）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, chmodSync, renameSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { FileHostFs } from '../src/adapters/FileHostFs.js'
import { SkillAssets } from '../src/adapters/SkillAssets.ts'
import { SkillWriter } from '../src/adapters/SkillWriter.ts'
import { PythonProbe } from '../src/adapters/PythonProbe.ts'
import { executeInstallSkills } from '../src/application/use-cases/InstallSkills.ts'
import type { UseCaseDeps, PythonProbeResult } from '../src/application/ports.ts'

const REPO_SKILLS = fileURLToPath(new URL('../skills/', import.meta.url))

const tmpRoots: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tmpRoots.push(dir)
  return dir
}

/** 供 TC-9 用：把包内资产复制一份，好让用例去改（不动真包）。 */
function cloneAssets(): { dir: string; root: string } {
  const dir = tempDir('skills-asset-copy-')
  const root = join(dir, 'skills')
  cpSync(REPO_SKILLS, root, { recursive: true })
  return { dir, root }
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    try {
      chmodSync(dir, 0o700)
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* 清理失败不影响判定 */
    }
  }
})

interface HarnessOptions {
  readonly assetRoot?: string
  readonly probe?: () => Promise<PythonProbeResult>
  readonly enabled?: boolean
  readonly root?: string
}

function makeDeps(options: HarnessOptions = {}): UseCaseDeps {
  const skillAssets = new SkillAssets({ moduleDir: options.assetRoot ?? REPO_SKILLS, root: options.assetRoot ?? REPO_SKILLS })
  const skillWriter = new SkillWriter({ idFactory: () => 'fixed' })
  const probe = options.probe ?? (async () => ({ found: true, name: 'python3', version: '3.8.10', path: '/usr/bin/python3' }))
  return {
    store: {} as never,
    docs: { resolve: (rel: string) => join(options.root ?? tmpdir(), rel), workspaceRoot: () => options.root ?? tmpdir() } as never,
    // REQ-261008020617-088f RF-3：hostFs 必填（本夹具不碰 RTM，给真实现即可）
    hostFs: new FileHostFs(),
    clock: { now: () => 1_700_000_000_000 } as never,
    ids: {} as never,
    session: {} as never,
    questions: {} as never,
    rejections: {} as never,
    skillAssets,
    skillInstall: {
      probePython: probe,
      writeTree: (root: string, files: Parameters<SkillWriter['writeTree']>[1]) => skillWriter.writeTree(root, files),
      readTree: (root: string) => skillWriter.readTree(root),
      readManifest: (root: string) => skillWriter.readManifest(root),
    },
    skillsSettings: { enabled: options.enabled !== false },
    pluginMeta: { name: 'dsh-pmboard', version: '0.1.0', build: 'test' },
  } as unknown as UseCaseDeps
}

describe('TC-5 · 幂等（第二次一个字节都不写）', () => {
  it('连跑两次：第二次 reused=true 且盘上 mtime 不变', async () => {
    const base = tempDir('skills-idem-')
    const root = join(base, 'skills')
    const deps = makeDeps()
    const first = await executeInstallSkills(deps, 'w1', { root })
    expect(first.reused).toBe(false)
    expect(first.materialized.length).toBe(7)
    expect(existsSync(join(root, 'ui-ux-pro-max', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(root, '.manifest.json'))).toBe(true)
    expect(existsSync(join(root, '.gitignore'))).toBe(true)

    const before = statSync(join(root, 'ui-ux-pro-max', 'SKILL.md')).mtimeMs
    const second = await executeInstallSkills(deps, 'w1', { root })
    expect(second.reused).toBe(true)
    expect(second.materialized).toEqual([])
    expect(statSync(join(root, 'ui-ux-pro-max', 'SKILL.md')).mtimeMs).toBe(before)
  })

  it('force=true 忽略全等判定，真的重写', async () => {
    const base = tempDir('skills-force-')
    const root = join(base, 'skills')
    const deps = makeDeps()
    await executeInstallSkills(deps, 'w1', { root })
    const forced = await executeInstallSkills(deps, 'w1', { root, force: true })
    expect(forced.reused).toBe(false)
    expect(forced.materialized.length).toBe(7)
  })

  it('内容被改坏 → 下一次投放自愈（不是一直 reused）', async () => {
    const base = tempDir('skills-heal-')
    const root = join(base, 'skills')
    const deps = makeDeps()
    await executeInstallSkills(deps, 'w1', { root })
    const victim = join(root, 'ui-ux-pro-max', 'SKILL.md')
    const original = readFileSync(victim)
    rmSync(victim)
    const healed = await executeInstallSkills(deps, 'w1', { root })
    expect(healed.reused).toBe(false)
    expect(readFileSync(victim)).toEqual(original)
  })
})

describe('TC-6 · 事务性（失败不留半份）', () => {
  it('投放根不可写 → REQBOARD_SKILLS_WRITE_FAILED，且无 .tmp-* 残留、目标目录不存在', async () => {
    const base = tempDir('skills-ro-')
    chmodSync(base, 0o500)
    const root = join(base, 'skills')
    const deps = makeDeps()
    await expect(executeInstallSkills(deps, 'w1', { root })).rejects.toThrow(/REQBOARD_SKILLS_WRITE_FAILED/)
    chmodSync(base, 0o700)
    expect(existsSync(root)).toBe(false)
    expect(readdirSync(base).filter(n => n.includes('.tmp-'))).toEqual([])
    expect(readdirSync(base).filter(n => n.includes('.old-'))).toEqual([])
  })
})

describe('TC-7 · 解释器回执', () => {
  it('回执含 python.found/version 与 searchScript 绝对路径；缺失时 found=false 且不抛', async () => {
    const base = tempDir('skills-py-')
    const root = join(base, 'skills')
    const found = await executeInstallSkills(makeDeps(), 'w1', { root })
    expect(found.python.found).toBe(true)
    expect(found.python.version).toBe('3.8.10')
    expect(found.searchScript).toBe(join(root, 'ui-ux-pro-max', 'scripts', 'search.py'))
    expect(found.searchScript.startsWith('/')).toBe(true)

    const base2 = tempDir('skills-py2-')
    const missing = await executeInstallSkills(makeDeps({ probe: async () => ({ found: false }) }), 'w1', { root: join(base2, 'skills') })
    expect(missing.python.found).toBe(false)
    // 缺解释器**不是失败**：资产照常落地（诚实降级，不是罢工）。
    expect(missing.reused).toBe(false)
    expect(missing.materialized.length).toBe(7)
  })

  it('真解释器探测：本机 python3 可用且版本可解析（探不到也允许，只是不得静默撒谎）', async () => {
    const real = await new PythonProbe().probePython()
    if (real.found) {
      expect(real.path).toBeTruthy()
      expect(real.version).toMatch(/^\d+\.\d+/)
    } else {
      expect(real).toEqual({ found: false })
    }
  })
})

describe('TC-8 · 开关（一键回滚）', () => {
  it('skills.enabled=false → REQBOARD_SKILLS_DISABLED 且一个文件都不写', async () => {
    const base = tempDir('skills-off-')
    const root = join(base, 'skills')
    await expect(executeInstallSkills(makeDeps({ enabled: false }), 'w1', { root }))
      .rejects.toThrow(/REQBOARD_SKILLS_DISABLED/)
    expect(existsSync(root)).toBe(false)
    expect(readdirSync(base)).toEqual([])
  })
})

describe('TC-9 · 缺资产（装机漏打包）', () => {
  it('把 brand 改名 → REQBOARD_SKILLS_ASSET_MISSING 且错误里带缺失路径', async () => {
    const { root } = cloneAssets()
    renameSync(join(root, 'brand'), join(root, 'brand-renamed'))
    const base = tempDir('skills-missing-')
    await expect(executeInstallSkills(makeDeps({ assetRoot: root }), 'w1', { root: join(base, 'skills') }))
      .rejects.toThrow(/REQBOARD_SKILLS_ASSET_MISSING/)
    await expect(executeInstallSkills(makeDeps({ assetRoot: root }), 'w1', { root: join(base, 'skills') }))
      .rejects.toThrow(/brand/)
  })

  it('未知 skill 名 → REQBOARD_SKILLS_UNKNOWN_SKILL（不静默忽略）', async () => {
    const base = tempDir('skills-unknown-')
    await expect(executeInstallSkills(makeDeps(), 'w1', { root: join(base, 'skills'), skills: ['not-a-skill'] }))
      .rejects.toThrow(/REQBOARD_SKILLS_UNKNOWN_SKILL/)
  })

  it('只投指定 skill → materialized 只有它', async () => {
    const base = tempDir('skills-subset-')
    const root = join(base, 'skills')
    const res = await executeInstallSkills(makeDeps(), 'w1', { root, skills: ['brand'] })
    expect(res.materialized).toEqual(['brand'])
    expect(existsSync(join(root, 'brand', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(root, 'ui-ux-pro-max'))).toBe(false)
  })
})
