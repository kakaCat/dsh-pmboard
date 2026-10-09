/**
 * workspace_root / 落点判定的行为等价（REQ-261008020617-088f RF-5 · 设计 INV-5）。
 *
 * 为什么单独一份：这两处判定搬迁前用 `node:path.isAbsolute` + `node:fs.statSync`，搬迁后走
 * 纯函数 `isAbsolutePath` 与 `HostFsPort`。层门只看 import（越界消失），**行为是否等价没有任何
 * 机械判据**——本文件就是那条判据：口径逐例对照 node、两句错误文案逐句钉住、两个哨兵各钉一次。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { isAbsolute } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness } from './application/harness.js'
import { executeCreateRequirement } from '../src/application/use-cases/CreateRequirement.js'
import { isAbsolutePath } from '../src/application/internal/paths.js'
import { FileHostFs } from '../src/adapters/FileHostFs.js'

const W = 'session-caller'
const roots: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'wsroot-resolution-'))
  roots.push(d)
  return d
}

afterEach(() => {
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true })
})

function x(): ReturnType<typeof makeHarness> {
  const h = makeHarness({ requirements: [] })
  h.deps.ids = { requirement: () => 'REQ-261009999999-ffff', task: () => 't-1', comment: () => 'c-1' } as never
  return h
}

const create = (h: ReturnType<typeof makeHarness>, args: unknown): Promise<Record<string, unknown>> =>
  executeCreateRequirement(h.deps, args, { agent: { id: W } }) as Promise<Record<string, unknown>>

describe('isAbsolutePath：与 node:path.isAbsolute 逐例同口径', () => {
  it('样例集上两平台口径逐一相同', () => {
    const samples = [
      '/a', '/', '\\a', '\\\\srv\\share', 'C:\\a', 'C:/a', 'c:\\x\\y',
      'a', './a', '../a', 'docs/x', 'C:', 'C:a', '', '.', '..',
    ]
    for (const p of samples) {
      expect(isAbsolutePath(p), '口径不一致：' + JSON.stringify(p)).toBe(isAbsolute(p))
    }
  })
})

describe('reqboard_create 的 workspace_root：错误码与文案逐句不变', () => {
  it('非绝对路径 → REQBOARD_INVALID_WORKSPACE +「必须是绝对路径」', async () => {
    await expect(create(x(), { title: 't', category: 'feature', workspace_root: 'relative/path' }))
      .rejects.toThrowError(/workspace_root 必须是绝对路径.*REQBOARD_INVALID_WORKSPACE/)
  })

  it('路径在但不是目录 → 同码 +「目录不存在：」', async () => {
    const dir = tmp()
    const asFile = join(dir, 'not-a-dir.txt')
    writeFileSync(asFile, 'x')
    await expect(create(x(), { title: 't', category: 'feature', workspace_root: asFile }))
      .rejects.toThrowError(/workspace_root 指向的目录不存在：.*REQBOARD_INVALID_WORKSPACE/)
  })

  it('绝对路径但不存在 → 同码 +「目录不存在或不可读」', async () => {
    const dir = tmp()
    await expect(create(x(), { title: 't', category: 'feature', workspace_root: join(dir, 'nope') }))
      .rejects.toThrowError(/workspace_root 指向的目录不存在或不可读.*REQBOARD_INVALID_WORKSPACE/)
  })

  it('合法绝对目录 → 立项成功（不抛）', async () => {
    // 用 harness 自己的工作区根：任意临时目录会被**写盘守卫**按「项目根不可用」拒（那是另一道门，
    // 不是本用例要测的解析口径）。
    const h = x()
    const out = await create(h, { title: 't', category: 'feature', workspace_root: h.deps.docs.workspaceRoot() })
    expect(out.success).toBe(true)
  })
})

describe('哨兵的解析源就位（搬迁前是 process.cwd()）', () => {
  it('HostFsPort.cwd() 就是宿主进程 cwd —— capture 的「宿主默认工作区」哨兵据此解析', () => {
    expect(new FileHostFs().cwd()).toBe(process.cwd())
  })
})
