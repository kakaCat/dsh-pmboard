/**
 * `OsascriptStoragePathPicker`（REQ-261004103330-005f）。
 *
 * 这是**唯一真正起子进程**的地方，也是最容易被"错误形状"坑到的地方：平台不是 macOS、
 * osascript 不在、人取消（非 0 退出 + stderr `User canceled`）、超时被杀、别的失败。
 * 每一种都必须落到**确定的三态之一**上——界面会据此说不同的话。
 *
 * 另外钉住两条硬纪律：**脚本是常量**（不含任何外部输入）、**不经 shell**（`execFile` + argv）。
 */
import { describe, it, expect } from 'vitest'
import { OsascriptStoragePathPicker, PICK_PATH_SCRIPT, type RunResult } from '../src/adapters/StoragePathPicker.js'

const ok = (stdout: string): RunResult => ({ stdout, stderr: '', code: 0, killed: false })

describe('OsascriptStoragePathPicker', () => {
  it('选中：返回去空白的绝对路径', async () => {
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true,
      run: async () => ok('/Users/mac/.dsh/reqboard.sqlite\n'),
    })
    expect(await port.pick()).toEqual({ kind: 'picked', path: '/Users/mac/.dsh/reqboard.sqlite' })
  })

  it('人取消（非 0 + stderr User canceled）→ cancelled（**不是不可用**）', async () => {
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true,
      run: async () => ({ stdout: '', stderr: 'execution error: User canceled. (-128)', code: 1, killed: false }),
    })
    expect(await port.pick()).toEqual({ kind: 'cancelled' })
  })

  it('超时被杀 → unavailable（并说明已关闭窗口）', async () => {
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true, timeoutMs: 1000,
      run: async () => ({ stdout: '', stderr: '', code: null, killed: true }),
    })
    const out = await port.pick()
    expect(out.kind).toBe('unavailable')
    if (out.kind === 'unavailable') expect(out.reason).toContain('超时')
  })

  it('非 macOS → unavailable（不假装能弹窗）', async () => {
    const port = new OsascriptStoragePathPicker({ platform: 'linux', exists: () => true, run: async () => ok('/x') })
    const out = await port.pick()
    expect(out.kind).toBe('unavailable')
    if (out.kind === 'unavailable') expect(out.reason).toContain('linux')
  })

  it('osascript 不在 → unavailable', async () => {
    const port = new OsascriptStoragePathPicker({ platform: 'darwin', exists: () => false, run: async () => ok('/x') })
    const out = await port.pick()
    expect(out.kind).toBe('unavailable')
    if (out.kind === 'unavailable') expect(out.reason).toContain('/usr/bin/osascript')
  })

  it('别的失败（stderr 有内容）→ unavailable 且带上最后一行原因', async () => {
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true,
      run: async () => ({ stdout: '', stderr: 'line1\nnot allowed to send keystrokes', code: 1, killed: false }),
    })
    const out = await port.pick()
    expect(out.kind).toBe('unavailable')
    if (out.kind === 'unavailable') expect(out.reason).toContain('not allowed to send keystrokes')
  })

  it('执行器抛异常 → unavailable（不让宿主内部问题冒成 500）', async () => {
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true,
      run: async () => { throw new Error('spawn EACCES') },
    })
    const out = await port.pick()
    expect(out.kind).toBe('unavailable')
  })

  it('**脚本是常量、参数只走 argv**：无论调用多少次，脚本一字不变且不含 shell', async () => {
    const seen: readonly string[][] = []
    const port = new OsascriptStoragePathPicker({
      platform: 'darwin', exists: () => true,
      run: async (args) => { (seen as string[][]).push([...args]); return ok('/tmp/x.sqlite') },
    })
    await port.pick()
    await port.pick()
    expect(seen).toHaveLength(2)
    for (const args of seen) {
      expect(args).toEqual(['-e', PICK_PATH_SCRIPT])   // 唯一参数就是那段固定脚本
    }
    expect(PICK_PATH_SCRIPT).toContain('choose file name')
    expect(PICK_PATH_SCRIPT).not.toMatch(/do shell script|&|;|\$\(/)   // 不是 shell 拼接
  })
})
