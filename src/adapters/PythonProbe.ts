/**
 * 解释器探测适配器（REQ-261005122347-e07a FR-5）。
 *
 * **全插件唯一碰 `node:child_process` 的点之一**（与 `adapters/SystemFileOpener`、
 * `adapters/StoragePathPicker` 同层）：application 只拿探测结果，不碰进程与环境。
 *
 * 顺序 `python3` → `python` → `py -3`。全缺**不是失败**——投放照常完成，回执里
 * `python.found=false`，由主 agent 把「本轮未做数据库检索」如实转达（诚实降级，
 * 与上游 SKILL.md 自带的「Never present a 0-result search as if it returned data」同一条纪律）。
 *
 * @module dsh-pmboard/adapters/PythonProbe
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { PythonProbeResult, SkillInstallPort } from '../application/ports.js'

interface Candidate {
  readonly name: string
  readonly args: readonly string[]
}

/** 探测顺序即优先级：`python3` 优先（本机实测 `python`/`py` 缺失）。 */
const CANDIDATES: readonly Candidate[] = [
  { name: 'python3', args: ['--version'] },
  { name: 'python', args: ['--version'] },
  { name: 'py', args: ['-3', '--version'] },
]

const PROBE_TIMEOUT_MS = 5000

export interface PythonProbeOptions {
  /** 注入环境（测试可给空 PATH 模拟"没有解释器"）。 */
  readonly env?: NodeJS.ProcessEnv
}

export class PythonProbe implements Pick<SkillInstallPort, 'probePython'> {
  private readonly env: NodeJS.ProcessEnv

  constructor(options: PythonProbeOptions = {}) {
    this.env = options.env ?? process.env
  }

  async probePython(): Promise<PythonProbeResult> {
    for (const candidate of CANDIDATES) {
      const abs = resolveOnPath(candidate.name, this.env)
      if (abs === undefined) continue
      const result = await run(abs, candidate.args)
      if (!result.ok) continue
      const version = parseVersion(result.stdout + '\n' + result.stderr)
      return {
        found: true,
        name: candidate.name,
        path: abs,
        // 拿不到版本不因此判"没找到"：能执行就是能用，版本只是回执里给人看的。
        ...(version === undefined ? {} : { version }),
      }
    }
    return { found: false }
  }
}

/** 在 PATH 里找可执行文件（不跑进程；找不到 → undefined）。 */
function resolveOnPath(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const path = env['PATH']
  if (path === undefined || path.length === 0) return undefined
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

function run(file: string, args: readonly string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: err === null, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

/** `Python 3.8.10` → `3.8.10`（旧版 Python 2 把版本写到 stderr，故两路都看）。 */
export function parseVersion(text: string): string | undefined {
  const m = /Python\s+(\d+\.\d+(?:\.\d+)?)/.exec(text)
  return m === null ? undefined : m[1]
}
