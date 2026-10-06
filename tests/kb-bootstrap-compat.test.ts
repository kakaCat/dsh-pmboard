/**
 * 迁移、兼容与回退测试（REQ-261004174324-4195 t6 / FR-6、FR-7）。
 *
 * 四件事：① 三态开关（不写配置 / autoBootstrap=false / enabled=false）；
 * ② 已有知识层的项目**零写入**（连 mtime 都不变）；③ 两种读根各作用于自己的根（不跨根写）；
 * ④ 老路径（手动 kb:build）在关闭自举后仍可用。
 */
import { existsSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KnowledgeBootstrap } from '../src/application/internal/knowledge-bootstrap.ts'
import { FileDocRepository } from '../src/adapters/FileDocRepository.ts'
import { ensureKnowledgeLayer } from '../src/application/use-cases/EnsureKnowledgeLayer.ts'
import { knowledgeSettings } from '../src/plugin-config.ts'

const REPO = process.cwd()

/** 造一个最小空项目（只有 src）。 */
function emptyProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-compat-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), 'export function a(): void {}\n', 'utf8')
  return root
}

/** 造一个「已有知识层」的项目：把本仓 docs/knowledge 复制过去。 */
function projectWithLayer(): string {
  const root = emptyProject()
  const srcDir = join(REPO, 'docs/knowledge')
  const dstDir = join(root, 'docs/knowledge')
  mkdirSync(join(dstDir, 'entries'), { recursive: true })
  for (const name of readdirSync(srcDir)) {
    const from = join(srcDir, name)
    if (statSync(from).isFile()) copyFileSync(from, join(dstDir, name))
  }
  return root
}

function snapshot(dir: string): Map<string, { text: string; mtime: number }> {
  const out = new Map<string, { text: string; mtime: number }>()
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isFile()) out.set(name, { text: readFileSync(p, 'utf8'), mtime: statSync(p).mtimeMs })
  }
  return out
}

describe('三态开关', () => {
  it('不写配置 → 自举开启，空项目长出知识层', async () => {
    const settings = knowledgeSettings(undefined)
    expect(settings.autoBootstrap).toBe(true)
    const root = emptyProject()
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: root }), enabled: settings.enabled && settings.autoBootstrap })
    const res = await bootstrap.run(root)
    expect(res.status).toBe('created')
    expect(existsSync(join(root, 'docs/knowledge/INDEX.md'))).toBe(true)
  })

  it('autoBootstrap=false → 目录零变化', async () => {
    const settings = knowledgeSettings({ knowledge: { autoBootstrap: false } })
    const root = emptyProject()
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: root }), enabled: settings.enabled && settings.autoBootstrap })
    const res = await bootstrap.run(root)
    expect(res.reason).toBe('disabled')
    expect(existsSync(join(root, 'docs'))).toBe(false)
  })

  it('enabled=false 优先：即使 autoBootstrap=true 也不自举', async () => {
    const settings = knowledgeSettings({ knowledge: { enabled: false, autoBootstrap: true } })
    expect(settings.enabled && settings.autoBootstrap).toBe(false)
    const root = emptyProject()
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: root }), enabled: settings.enabled && settings.autoBootstrap })
    expect((await bootstrap.run(root)).reason).toBe('disabled')
    expect(existsSync(join(root, 'docs'))).toBe(false)
  })
})

describe('已有知识层：零写入', () => {
  it('影子副本自举 → skipped(index-exists)，全部文件内容与 mtime 不变', async () => {
    const root = projectWithLayer()
    const before = snapshot(join(root, 'docs/knowledge'))
    const res = await ensureKnowledgeLayer({ docs: new FileDocRepository({ workspaceRoot: root }) })
    expect(res.status).toBe('skipped')
    expect(res.reason).toBe('index-exists')
    const after = snapshot(join(root, 'docs/knowledge'))
    expect(after).toEqual(before)
  })

  it('强制重算（= pnpm kb:build 的路径）时，手写页与 INDEX 手写行逐字不变', async () => {
    const root = projectWithLayer()
    const archPath = join(root, 'docs/knowledge/architecture.md')
    writeFileSync(archPath, '# 架构（人写的，别动）\n', 'utf8')
    const indexPath = join(root, 'docs/knowledge/INDEX.md')
    writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('# 项目知识索引', '# 项目知识索引\n\n> 手写摘要：别动我'), 'utf8')
    // 影子副本的 src 只有 src/a.ts，与仓内生成物本来就不同 → 生成物会被重算，这是预期行为
    const res = await ensureKnowledgeLayer({ docs: new FileDocRepository({ workspaceRoot: root }) }, { force: true })
    expect(res.status).toBe('created')
    expect(readFileSync(archPath, 'utf8')).toBe('# 架构（人写的，别动）\n')
    expect(readFileSync(indexPath, 'utf8')).toContain('> 手写摘要：别动我')
  })
})

describe('两种读根：各作用于自己的根，不跨根写', () => {
  it('session 根传入时写的是会话根，宿主根一个字节不加', async () => {
    const hostRoot = emptyProject()
    const sessionRoot = emptyProject()
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: hostRoot }), docsFor: (r) => new FileDocRepository({ workspaceRoot: r }), enabled: true })
    const res = await bootstrap.run(sessionRoot)
    expect(res.status).toBe('created')
    expect(existsSync(join(sessionRoot, 'docs/knowledge/INDEX.md'))).toBe(true)
    expect(existsSync(join(hostRoot, 'docs'))).toBe(false)
  })

  it('不传根 → 用仓储当前根（legacy-cwd 语义）', async () => {
    const hostRoot = emptyProject()
    const bootstrap = new KnowledgeBootstrap({ docs: new FileDocRepository({ workspaceRoot: hostRoot }), docsFor: (r) => new FileDocRepository({ workspaceRoot: r }), enabled: true })
    expect((await bootstrap.run()).status).toBe('created')
    expect(existsSync(join(hostRoot, 'docs/knowledge/INDEX.md'))).toBe(true)
  })
})

describe('去重键按项目身份（REQ-261005141830-7a3b t5 · FR-6）：同一项目多窗口只自举一次', () => {
  it('同一 projectId、两个窗口各自解析出的根 → 只自举一次；另一个 projectId → 各一次', async () => {
    const host = emptyProject()
    const rootA = emptyProject()
    const rootA2 = emptyProject() // 同项目的另一个窗口解析出的根（写法不同，身份相同）
    const rootB = emptyProject()
    const made: string[] = []
    const bootstrap = new KnowledgeBootstrap({
      docs: new FileDocRepository({ workspaceRoot: host }),
      docsFor: (r) => { made.push(r); return new FileDocRepository({ workspaceRoot: r }) },
      enabled: true,
    })

    // 窗口 1 与窗口 2 同属 w-1：第二次必须命中同一条（**按身份去重，不按路径**——按路径这里会跑两遍）
    await bootstrap.run(rootA, { projectId: 'w-1' })
    await bootstrap.run(rootA2, { projectId: 'w-1' })
    expect(made.filter((r) => r === rootA).length).toBe(1)
    expect(made.filter((r) => r === rootA2).length, '同项目的第二个窗口不该再自举一次').toBe(0)

    // 另一个项目：独立一次
    await bootstrap.run(rootB, { projectId: 'w-2' })
    expect(made.filter((r) => r === rootB).length).toBe(1)
  })

  it('不给 projectId（存量未归属）→ 回落按归一路径去重，老行为不变', async () => {
    const host = emptyProject()
    const root = emptyProject()
    const made: string[] = []
    const bootstrap = new KnowledgeBootstrap({
      docs: new FileDocRepository({ workspaceRoot: host }),
      docsFor: (r) => { made.push(r); return new FileDocRepository({ workspaceRoot: r }) },
      enabled: true,
    })
    await bootstrap.run(root)
    await bootstrap.run(root + '/') // 尾斜杠：归一后同一根
    expect(made.filter((r) => r === root).length).toBe(1)
  })
})

describe('回退路径：关掉自举后手动命令仍可用', () => {
  it('autoBootstrap=false 的项目，直接调用用例（= pnpm kb:build 的路径）照样能生成', async () => {
    const settings = knowledgeSettings({ knowledge: { autoBootstrap: false } })
    const root = emptyProject()
    expect(settings.autoBootstrap).toBe(false)
    expect(existsSync(join(root, 'docs'))).toBe(false)
    const res = await ensureKnowledgeLayer({ docs: new FileDocRepository({ workspaceRoot: root }) }, { force: true })
    expect(res.status).toBe('created')
    expect(existsSync(join(root, 'docs/knowledge/INDEX.md'))).toBe(true)
  })
})
