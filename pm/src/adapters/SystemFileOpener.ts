/**
 * 用**系统默认程序**打开一个文件（REQ-261004103330-005f，2026-10-04）。
 *
 * ## 为什么需要它（当时的事实）
 *
 * 看板原本用「官方右侧栏」打开文档：那条通道是给**工作区内**的产物用的，而
 * `~/.dsh/dsh-reqboard-system.json` **在工作区之外** —— `openResource` 直接失败，
 * 人点「打开配置文件」只看到一句"打不开"。
 *
 * ## 安全口径
 *
 * 1. **argv 直传**：`execFile('/usr/bin/open', [path])`，shell 不参与，没有注入面；
 * 2. **只跑 macOS 自带 `open`**，其它平台如实说"不支持"，不猜替代命令；
 * 3. **超时即杀**（默认 10 秒，`open` 只是把任务交给 LaunchServices，正常毫秒级返回）；
 * 4. **调用方负责白名单**——本适配器不判断路径该不该开；路由只用它打开**宿主自己解析出的**
 *    那两份配置文件（见 `settings-support.filePathsOf`），客户端传什么都进不来。
 *
 * @module dsh-pmboard/adapters/SystemFileOpener
 */

import { execFile } from 'node:child_process'

export type OpenFileOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export interface SystemFileOpenerPort {
  open(path: string): Promise<OpenFileOutcome>
}

export interface SystemFileOpenerOptions {
  /** 平台（缺省取 `process.platform`；测试注入用）。 */
  readonly platform?: string
  /** `open` 可执行文件路径（缺省 macOS 自带）。 */
  readonly openPath?: string
  readonly timeoutMs?: number
}

/** 生产实现：`execFile`（**不用 exec**，不经 shell）。 */
export function createSystemFileOpener(opts: SystemFileOpenerOptions = {}): SystemFileOpenerPort {
  const platform = opts.platform ?? process.platform
  const bin = opts.openPath ?? '/usr/bin/open'
  const timeoutMs = opts.timeoutMs ?? 10_000
  return {
    async open(path: string): Promise<OpenFileOutcome> {
      if (platform !== 'darwin') {
        return { ok: false, reason: '系统默认程序打开只在 macOS 可用（当前 ' + platform + '）' }
      }
      return await new Promise<OpenFileOutcome>((resolve) => {
        execFile(bin, [path], { timeout: timeoutMs, killSignal: 'SIGKILL' }, (err) => {
          resolve(err === null ? { ok: true } : { ok: false, reason: err.message })
        })
      })
    },
  }
}
