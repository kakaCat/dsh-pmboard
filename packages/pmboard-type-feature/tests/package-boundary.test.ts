/**
 * 分层门禁的四类越界自检（REQ-261009174713-7bc8 t3 / RF-15、RF-24）。
 *
 * 为什么必须有：门禁「永不触发」是静默失效的典型死法（本仓已有两次先例）。
 * 这里在临时目录里**造出四类越界**，逐类断言非零退出并点中对应 kind；
 * 再断言「干净树」退出码 0——只测「能查」不测「不误报」同样会让门禁烂掉。
 *
 * 注意：夹具写在 os.tmpdir()（仓内写入被 hermetic-guard ⑤-a 拒绝，这是既有约定）。
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHECKER = join(process.cwd(), 'scripts', 'package-boundary-check.mts')

interface Run { code: number; out: string }

function runChecker(root: string): Run {
  try {
    const out = execFileSync('npx', ['tsx', CHECKER, '--root', root, '--json'], { encoding: 'utf8', cwd: process.cwd() })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}

function writePkg(root: string, name: string, deps: Record<string, string>, src?: Record<string, string>): void {
  const dir = join(root, 'packages', name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, private: true, type: 'module', dependencies: deps }, null, 2))
  for (const [rel, body] of Object.entries(src ?? {})) {
    mkdirSync(join(dir, 'src', rel.split('/').slice(0, -1).join('/') || '.'), { recursive: true })
    writeFileSync(join(dir, 'src', rel), body)
  }
}

const CLEAN = {
  'pmboard-common': {},
  'reqboard-rtm': {},
  'pmboard-type-kit': { 'pmboard-common': 'workspace:*' },
  'pmboard-type-feature': { 'pmboard-common': 'workspace:*', 'pmboard-type-kit': 'workspace:*' },
  'pmboard-core': { 'pmboard-common': 'workspace:*', 'reqboard-rtm': 'workspace:*', 'pmboard-type-kit': 'workspace:*' },
  'tool-pmboard': { 'pmboard-common': 'workspace:*', 'pmboard-core': 'workspace:*' },
  'pmboard-templates': {},
} as Record<string, Record<string, string>>

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-boundary-'))
  for (const [name, deps] of Object.entries(CLEAN)) writePkg(root, name, deps)
  return root
}

describe('分层门禁：能查（四类越界逐类点名）', () => {
  it('干净树 → 退出码 0（不误报）', () => {
    const r = runChecker(freshRoot())
    expect(r.code).toBe(0)
  })

  it('① core 声明并引用类型包 → layer-declaration', () => {
    const root = freshRoot()
    writePkg(root, 'pmboard-core', { 'pmboard-common': 'workspace:*', 'pmboard-type-feature': 'workspace:*' }, { 'index.ts': "import { x } from 'pmboard-type-feature'\n" })
    const r = runChecker(root)
    expect(r.code).toBe(1)
    expect(r.out).toContain('layer-declaration')
  })

  it('② 类型包引用 core → layout 越界被点名', () => {
    const root = freshRoot()
    writePkg(root, 'pmboard-type-bug', { 'pmboard-common': 'workspace:*', 'pmboard-core': 'workspace:*' }, { 'index.ts': "import { y } from 'pmboard-core'\n" })
    const r = runChecker(root)
    expect(r.code).toBe(1)
    expect(r.out).toContain('layer-declaration')
  })

  it('③ 工具包内横向目录引用 → cross-dir-import', () => {
    const root = freshRoot()
    writePkg(root, 'tool-pmboard', { 'pmboard-common': 'workspace:*', 'pmboard-core': 'workspace:*' }, { 'intake/a.ts': "import { z } from '../verify/b.js'\n" })
    const r = runChecker(root)
    expect(r.code).toBe(1)
    expect(r.out).toContain('cross-dir-import')
  })

  it('④ 资产包出现 import → asset-import', () => {
    const root = freshRoot()
    writePkg(root, 'pmboard-templates', {}, { 'index.ts': "import { readFileSync } from 'node:fs'\n" })
    const r = runChecker(root)
    expect(r.code).toBe(1)
    expect(r.out).toContain('asset-import')
  })

  it('工具包经 kit/ 中转 → 不算横向越界（合法通路）', () => {
    const root = freshRoot()
    writePkg(root, 'tool-pmboard', { 'pmboard-common': 'workspace:*', 'pmboard-core': 'workspace:*' }, { 'intake/a.ts': "import { k } from '../kit/shared.js'\n" })
    const r = runChecker(root)
    expect(r.code).toBe(0)
  })
})
