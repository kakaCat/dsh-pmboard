/**
 * CLI 与用例同源测试（REQ-261004174324-4195 t3）。
 *
 * 断言两件事：① **同一份实现**——CLI 跑出来的产物与直接调用用例逐字节相等；
 * ② **门禁语义不变**——`--check` 有漂移退 1、补写后退 0，且源码改动后 `--write` 会真的重算。
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileDocRepository } from '../src/adapters/FileDocRepository.ts'
import { ensureKnowledgeLayer } from '../src/application/use-cases/EnsureKnowledgeLayer.ts'
import { KB_PAGE_PATHS, KB_PATHS } from '../src/domain/knowledge/types.ts'

const ROOT = process.cwd()
const ARTIFACTS = [KB_PATHS.index, KB_PATHS.symbols, KB_PAGE_PATHS['code-map'], KB_PAGE_PATHS.tokens, KB_PATHS.classes]

/** 造一个最小项目（含一个模块文件与一个样式分片）。 */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-cli-'))
  mkdirSync(join(root, 'src/client/styles'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), 'export function alpha(): void {}\n', 'utf8')
  writeFileSync(join(root, 'src/client/styles/base.ts'), '.dsh-pm-x { color: #abcdef }\n', 'utf8')
  return root
}

function runCli(root: string, mode: '--write' | '--check'): { code: number; out: string } {
  const r = spawnSync('npx', ['tsx', 'scripts/kb-build.mts', mode, '--root', root], { cwd: ROOT, encoding: 'utf8' })
  return { code: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

describe('CLI 与用例同源', () => {
  it('CLI --write 与直接调用用例：同 fixture 产物逐字节相等', async () => {
    const cliRoot = makeProject()
    const useCaseRoot = makeProject()
    const cli = runCli(cliRoot, '--write')
    expect(cli.code).toBe(0)
    expect(cli.out).toContain('[write]')
    await ensureKnowledgeLayer({ docs: new FileDocRepository({ workspaceRoot: useCaseRoot }) })
    for (const p of ARTIFACTS) {
      expect(readFileSync(join(cliRoot, p), 'utf8')).toBe(readFileSync(join(useCaseRoot, p), 'utf8'))
    }
  }, 120_000)

  it('--check 零漂移退 0；源码改动后报漂移退 1；--write 重算后回到 0', () => {
    const root = makeProject()
    expect(runCli(root, '--write').code).toBe(0)
    const clean = runCli(root, '--check')
    expect(clean.code).toBe(0)
    expect(clean.out).toContain('[verify] 生成物与库内一致')

    // 加一个导出符号 → 代码地图与符号表必然漂移
    writeFileSync(join(root, 'src/a.ts'), 'export function alpha(): void {}\nexport function beta(): number { return 2 }\n', 'utf8')
    const drifted = runCli(root, '--check')
    expect(drifted.code).toBe(1)
    expect(drifted.out).toContain('[drift]')
    expect(drifted.out).toContain(KB_PATHS.symbols)

    expect(runCli(root, '--write').code).toBe(0)
    expect(readFileSync(join(root, KB_PATHS.symbols), 'utf8')).toContain('beta')
    expect(runCli(root, '--check').code).toBe(0)
  }, 180_000)
})
