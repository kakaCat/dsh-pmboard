/**
 * 「选择…」的宿主实现：用 macOS 原生「存储为」窗口取一个**文件路径**（REQ-261004103330-005f）。
 *
 * ## 为什么必须在宿主进程里做
 *
 * 看板跑在浏览器里，而**浏览器拿不到真实绝对路径**（安全边界：`<input type=file>` 只给 `fakepath`）。
 * 所以"像操作系统那样弹窗选地址"只能由宿主（Node）侧执行；浏览器只负责把回来的字符串填进输入框。
 *
 * ## 为什么是 `choose file name`（而不是选目录）
 *
 * 这里要的是**SQLite 库文件路径**（含文件名），不是目录。macOS 的
 * `choose file name` 就是"存储为"式窗口：能选目录、能起文件名，返回**绝对 POSIX 路径**。
 *
 * ## 两条硬纪律
 *
 * 1. **脚本是常量**：`-e` 的文本里**不含任何请求内容**（不拼字符串、不用 `exec`）——
 *    参数从 `execFile` 的 argv 进，shell 根本不参与，因此没有注入面（有用例钉住这一点）；
 * 2. **超时即杀**：`execFile` 的 `timeout` + `killSignal: SIGKILL`。人在窗口里可能想很久（默认 10 分钟），
 *    但没人理的对话框不能把 HTTP 请求挂到天荒地老。
 *
 * @module dsh-pmboard/adapters/StoragePathPicker
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { StoragePathPickOutcome, StoragePathPickerPort } from '../application/ports.js'

/**
 * 固定脚本（**不含任何外部输入**）。`POSIX path of` 把 AppleScript 的 HFS 路径转成 `/a/b/c` 形式；
 * 人点取消时 osascript 以非 0 退出并在 stderr 写 `User canceled`。
 */
export const PICK_PATH_SCRIPT =
  'POSIX path of (choose file name with prompt "选择 SQLite 库文件位置" default name "reqboard.sqlite")'

/** 默认 osascript 位置（macOS 自带）。 */
const DEFAULT_OSASCRIPT = '/usr/bin/osascript'

/** 人在窗口里可能想很久：默认给 10 分钟，超时才杀。 */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/** 跑一次子进程的结果（`killed` = 我们因超时杀的）。 */
export interface RunResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number | null
  readonly killed: boolean
}

/** 可注入的执行器（测试用它覆盖三态，不必真的起进程）。 */
export type RunOsascript = (args: readonly string[], timeoutMs: number) => Promise<RunResult>

/** 生产执行器：`execFile`（**不用 exec**，不经 shell）。 */
const runOsascript: RunOsascript = (args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      DEFAULT_OSASCRIPT,
      [...args],
      { timeout: timeoutMs, killSignal: 'SIGKILL', windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean; signal?: string }) | null
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: e === null ? 0 : (typeof e.code === 'number' ? e.code : null),
          killed: e?.killed === true || e?.signal === 'SIGKILL',
        })
      },
    )
  })

export interface StoragePathPickerOptions {
  /** 平台（默认 `process.platform`）；非 darwin → 直接不可用。 */
  readonly platform?: string
  /** osascript 路径（默认 `/usr/bin/osascript`）。 */
  readonly osascriptPath?: string
  /** 是否存在该可执行文件（默认 `existsSync`；测试可注入）。 */
  readonly exists?: (path: string) => boolean
  /** 超时毫秒（默认 10 分钟）。 */
  readonly timeoutMs?: number
  /** 执行器（默认 `execFile`；测试注入假实现）。 */
  readonly run?: RunOsascript
}

/**
 * 用 macOS 原生「存储为」窗口取文件路径。
 *
 * 三态（**没有第四态**）：选中 / 人取消（不是错误）/ 不可用（平台、缺 osascript、超时、其它失败——
 * 全部归到"拿不到系统选择窗口"，界面据此提示手输，绝不含糊）。
 */
export class OsascriptStoragePathPicker implements StoragePathPickerPort {
  constructor(private readonly opts: StoragePathPickerOptions = {}) {}

  async pick(): Promise<StoragePathPickOutcome> {
    const platform = this.opts.platform ?? process.platform
    if (platform !== 'darwin') {
      return { kind: 'unavailable', reason: '当前平台是 ' + platform + '，没有 macOS 的「存储为」窗口' }
    }
    const bin = this.opts.osascriptPath ?? DEFAULT_OSASCRIPT
    const exists = this.opts.exists ?? existsSync
    if (!exists(bin)) {
      return { kind: 'unavailable', reason: '找不到 ' + bin + '（macOS 自带，若被移除需重装命令行工具）' }
    }

    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const run = this.opts.run ?? runOsascript
    let result: RunResult
    try {
      result = await run(['-e', PICK_PATH_SCRIPT], timeoutMs)
    } catch (err) {
      return { kind: 'unavailable', reason: (err as { message?: string } | undefined)?.message ?? String(err) }
    }

    if (result.killed) {
      return { kind: 'unavailable', reason: '等待选择超时（' + String(Math.round(timeoutMs / 1000)) + ' 秒），已关闭窗口' }
    }
    // **取消不是错误**：osascript 以非 0 退出 + stderr 含 User canceled
    if (result.code !== 0 && /User canceled/i.test(result.stderr)) return { kind: 'cancelled' }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').slice(-1)[0] ?? ''
      return { kind: 'unavailable', reason: '选择窗口未能完成' + (detail.length > 0 ? '：' + detail : '') }
    }
    const path = result.stdout.trim()
    return path.length === 0 ? { kind: 'cancelled' } : { kind: 'picked', path }
  }
}
