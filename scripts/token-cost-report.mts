/**
 * 同口径成本度量（REQ-261007100513-6749 t6「固化同口径成本度量命令」）。
 *
 * 把 `docs/reviews/REQ-261006130057-7a43-token-cost-diagnosis.md` 的人工分析口径固化成一条命令：
 *   数据来源：`~/.dsh/sessions/--<工作区路径转义>--/<会话 id>/session.v4.jsonl.zstd`（`zstd -dc` 解压）。
 *   口径：每会话只统计**自身**请求 —— 取该会话首行 `{"type":"session",...}` 的 `createdAt`，
 *        只算 `time >= createdAt` 的 `assistant/message` 事件（排除 subagent_fork 继承父历史造成的重复计数），
 *        四桶 = inputTokens(未命中) / cacheReadTokens(命中) / outputTokens，请求数 = 计数的条数。
 *   树归属：按会话首行 `parentSession` 建父子树，从根会话递归收全部后代。
 *   输出：① 汇总表（会话数/请求数/未命中/命中/输出/墙钟）② 缓存失效点清单（cacheRead<20000 且 input>40000，
 *        标注该请求前 60s 内是否有 `system/message` 事件）③ 口径说明一行。
 *
 * 跑法：
 *   pnpm cost:report --req REQ-261006130057-7a43      # 根会话 = 台账 sourceSessionId
 *   pnpm cost:report --root session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb
 *   pnpm cost:report                                  # 不指定 → 汇总该会话根目录下全部会话
 *   pnpm cost:report --req <REQ> --sessions-root <目录>   # 缺省 = ~/.dsh/sessions/--<工作区转义>--
 *   pnpm cost:report --req <REQ> --until 2026-10-07T10:01:51   # 只算该时刻（含）之前的请求：复现历史快照
 *
 * 注：`--until` 只是「按时间点回溯复现」的诊断开关（诊断文档写于 2026-10-07 10:02，之后会话仍在增长）；
 * 缺省不加 = 当前全量口径，脚本不会为了对齐历史数字而裁剪数据。
 *
 * @module dsh-pmboard/scripts/token-cost-report
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'

/** 失效点判据（与诊断文档 §6「复现命令」一致）。 */
const CACHE_HIT_FLOOR = 20_000
const UNCACHED_FLOOR = 40_000
/** `system/message` 前窗（毫秒）。 */
const SYSTEM_LOOKBACK_MS = 60_000
const USAGE_LINE = '口径：每会话只统计自身请求（event.time >= 首行 session.createdAt 的 assistant/message）；四桶 = inputTokens(未命中)/cacheReadTokens(命中)/outputTokens；按首行 parentSession 建树；失效点 = cacheReadTokens<20000 且 inputTokens>40000。'

interface Usage {
  readonly inputTokens?: number
  readonly cacheReadTokens?: number
  readonly outputTokens?: number
}

interface SessionEvent {
  readonly type?: string
  readonly time?: number
  readonly data?: {
    readonly turn?: number
    readonly step?: number
    readonly usage?: Usage
  }
}

interface SessionHeader {
  readonly type?: string
  readonly id?: string
  readonly createdAt?: number
  readonly parentSession?: string
  readonly cwd?: string
  readonly origin?: string
}

interface SessionRef {
  readonly uuid: string
  readonly file: string
  readonly header: SessionHeader
  readonly createdAt: number
}

interface FailurePoint {
  readonly time: number
  readonly turn: number | undefined
  readonly step: number | undefined
  readonly uncached: number
  readonly cache: number
  readonly systemWithinLookback: boolean
}

interface SessionStats {
  readonly ref: SessionRef
  requests: number
  uncached: number
  cache: number
  output: number
  firstEvent: number | null
  lastEvent: number | null
  readonly failures: FailurePoint[]
}

interface Args {
  readonly req: string | undefined
  readonly root: string | undefined
  readonly sessionsRoot: string | undefined
  readonly until: number | undefined
}

/** 报错退出（声明为函数声明，TS 才据 `never` 做控制流收窄）。 */
function FATAL(message: string): never {
  process.stderr.write(`✗ ${message}\n`)
  process.exit(1)
}

function usage(): string {
  return [
    '用法：tsx scripts/token-cost-report.mts [--req <REQ-id> | --root <sessionId>]',
    '       [--sessions-root <目录>] [--until <ISO 时刻>]',
    '  --req            需求 id；从 ~/.dsh/reqboard/requirements/<REQ>/record.json 读 sourceSessionId 作根会话',
    '  --root           直接给根会话 id（可带 / 不带 session- 前缀）',
    '  --sessions-root  会话目录（直接含 <会话 id>/session.v4.jsonl.zstd）；缺省 ~/.dsh/sessions/--<工作区转义>--',
    '  --until          只统计该时刻（含）之前的请求；缺省 = 全量（仅用于复现历史快照）',
    '两者都不给 → 汇总该会话目录下全部会话。',
  ].join('\n')
}

function parseArgs(argv: readonly string[]): Args {
  let req: string | undefined
  let root: string | undefined
  let sessionsRoot: string | undefined
  let until: number | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = (): string => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) FATAL(`${arg} 需要一个取值\n${usage()}`)
      i += 1
      return next
    }
    if (arg === '--req') req = value()
    else if (arg === '--root') root = value()
    else if (arg === '--sessions-root') sessionsRoot = value()
    else if (arg === '--until') {
      const raw = value()
      const asNumber = Number(raw)
      const parsed = Number.isFinite(asNumber) && raw.trim() !== '' ? asNumber : Date.parse(raw)
      if (!Number.isFinite(parsed)) FATAL(`--until 无法解析：${raw}（可用 epoch 毫秒或 ISO 时刻）`)
      until = parsed
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else FATAL(`未知参数：${arg}\n${usage()}`)
  }
  return { req, root, sessionsRoot, until }
}

/** zstd 可执行文件：优先本机 Homebrew 路径，其次 PATH。 */
function resolveZstd(): string {
  const override = process.env.DSH_ZSTD_BIN
  if (override !== undefined && override !== '') return override
  const candidates = ['/opt/homebrew/bin/zstd', '/usr/local/bin/zstd', '/usr/bin/zstd']
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return 'zstd'
}

const ZSTD = resolveZstd()

/** 工作区路径 → DSH 会话目录名：`/Users/x/y` → `--Users-x-y--`。 */
function escapeProjectPath(dir: string): string {
  const body = resolvePath(dir).replace(/^\/+/, '').split('/').join('-')
  return `--${body}--`
}

function expandHome(input: string): string {
  if (input === '~') return homedir()
  if (input.startsWith('~/')) return join(homedir(), input.slice(2))
  return input
}

/**
 * 会话根目录：缺省 `~/.dsh/sessions/--<当前工作区转义>--`；
 * `--sessions-root` 若指向 `~/.dsh/sessions` 这类「上一层」，则自动下钻到转义目录。
 */
function resolveSessionsRoot(given: string | undefined): string {
  const escaped = escapeProjectPath(process.cwd())
  if (given === undefined) return join(homedir(), '.dsh', 'sessions', escaped)
  const base = resolvePath(expandHome(given))
  const nested = join(base, escaped)
  if (existsSync(nested)) return nested
  return base
}

/** 会话 id ↔ 目录名：顶层会话 id 带 `session-` 前缀，子代理不带；两者都要认。 */
function uuidOf(sessionId: string): string {
  return sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : sessionId
}

/** 只读首行（读到第一个换行即 kill 子进程），用于扫描全部会话的 header 而不用整份解压。 */
function readFirstLine(file: string): Promise<string> {
  return new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(ZSTD, ['-dc', file], { stdio: ['ignore', 'pipe', 'ignore'] })
    let buffer = ''
    let settled = false
    const done = (line: string): void => {
      if (settled) return
      settled = true
      resolvePromise(line)
    }
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        child.kill()
        done(buffer.slice(0, newline))
      }
    })
    child.on('error', (error: Error) => {
      if (!settled) {
        settled = true
        rejectPromise(error)
      }
    })
    child.on('close', () => done(buffer.split('\n')[0] ?? ''))
  })
}

function readJsonl(file: string): SessionEvent[] {
  let text: string
  try {
    text = execFileSync(ZSTD, ['-dc', file], { maxBuffer: 1 << 30, encoding: 'utf8' })
  } catch (error) {
    FATAL(`解压失败：${file}（${(error as Error).message}）`)
  }
  const events: SessionEvent[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed === '""') continue
    try {
      events.push(JSON.parse(trimmed) as SessionEvent)
    } catch {
      // 截断的尾行：跳过（长会话边写边读时会出现）
    }
  }
  return events
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) return
      out[index] = await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

/** 扫描会话根下全部会话的 header（不整份解压）。 */
async function scanSessions(root: string): Promise<Map<string, SessionRef>> {
  if (!existsSync(root)) FATAL(`会话目录不存在：${root}`)
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const files: { dir: string; file: string }[] = []
  for (const dir of dirs) {
    const file = join(root, dir, 'session.v4.jsonl.zstd')
    if (existsSync(file)) files.push({ dir, file })
  }
  const refs = await mapLimit(files, 16, async ({ dir, file }) => {
    const first = await readFirstLine(file)
    if (first.trim() === '') return null
    let header: SessionHeader
    try {
      header = JSON.parse(first) as SessionHeader
    } catch {
      return null
    }
    if (header.type !== undefined && header.type !== 'session') return null
    const uuid = uuidOf(header.id ?? dir)
    return { uuid, file, header, createdAt: header.createdAt ?? 0 } satisfies SessionRef
  })
  const byUuid = new Map<string, SessionRef>()
  for (const ref of refs) if (ref !== null) byUuid.set(ref.uuid, ref)
  if (byUuid.size === 0) FATAL(`会话目录下没有 session.v4.jsonl.zstd：${root}`)
  return byUuid
}

function buildChildren(sessions: Map<string, SessionRef>): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const ref of sessions.values()) {
    const parent = ref.header.parentSession
    if (parent === undefined || parent === '') continue
    const key = uuidOf(parent)
    const list = children.get(key)
    if (list === undefined) children.set(key, [ref.uuid])
    else list.push(ref.uuid)
  }
  return children
}

function collectTree(rootUuid: string, children: Map<string, string[]>): Set<string> {
  const tree = new Set<string>()
  const stack = [rootUuid]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined || tree.has(current)) continue
    tree.add(current)
    for (const child of children.get(current) ?? []) stack.push(child)
  }
  return tree
}

function readRequirementRoot(reqId: string): string {
  const file = join(homedir(), '.dsh', 'reqboard', 'requirements', reqId, 'record.json')
  if (!existsSync(file)) FATAL(`台账记录不存在：${file}`)
  let record: { sourceSessionId?: string }
  try {
    record = JSON.parse(readFileSync(file, 'utf8')) as { sourceSessionId?: string }
  } catch (error) {
    FATAL(`台账记录无法解析：${file}（${(error as Error).message}）`)
  }
  const source = record.sourceSessionId
  if (source === undefined || source === '') FATAL(`台账记录没有 sourceSessionId：${file}`)
  return source
}

function analyzeSession(ref: SessionRef, until: number | undefined): SessionStats {
  const events = readJsonl(ref.file)
  const systemTimes: number[] = []
  for (const event of events) {
    if (event.type === 'system/message' && typeof event.time === 'number') systemTimes.push(event.time)
  }
  systemTimes.sort((a, b) => a - b)
  const stats: SessionStats = {
    ref,
    requests: 0,
    uncached: 0,
    cache: 0,
    output: 0,
    firstEvent: null,
    lastEvent: null,
    failures: [],
  }
  for (const event of events) {
    const time = event.time
    if (typeof time !== 'number' || time < ref.createdAt) continue
    if (until !== undefined && time > until) continue
    if (stats.firstEvent === null || time < stats.firstEvent) stats.firstEvent = time
    if (stats.lastEvent === null || time > stats.lastEvent) stats.lastEvent = time
    if (event.type !== 'assistant/message') continue
    const usage = event.data?.usage
    if (usage === undefined || usage === null) continue
    const uncached = usage.inputTokens ?? 0
    const cache = usage.cacheReadTokens ?? 0
    const output = usage.outputTokens ?? 0
    stats.requests += 1
    stats.uncached += uncached
    stats.cache += cache
    stats.output += output
    if (cache < CACHE_HIT_FLOOR && uncached > UNCACHED_FLOOR) {
      stats.failures.push({
        time,
        turn: event.data?.turn,
        step: event.data?.step,
        uncached,
        cache,
        systemWithinLookback: systemTimes.some(
          (systemTime) => systemTime >= time - SYSTEM_LOOKBACK_MS && systemTime <= time,
        ),
      })
    }
  }
  return stats
}

const int = new Intl.NumberFormat('en-US')
const n = (value: number): string => int.format(value)

function pad(text: string, width: number): string {
  // 中文按 2 列宽估算，够用即可（表头对齐用）
  let visual = 0
  for (const char of text) visual += /[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/.test(char) ? 2 : 1
  return text + ' '.repeat(Math.max(0, width - visual))
}

function fmtTime(ms: number): string {
  const date = new Date(ms)
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

function fmtHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function sum(stats: readonly SessionStats[]): { requests: number; uncached: number; cache: number; output: number } {
  return stats.reduce(
    (acc, item) => ({
      requests: acc.requests + item.requests,
      uncached: acc.uncached + item.uncached,
      cache: acc.cache + item.cache,
      output: acc.output + item.output,
    }),
    { requests: 0, uncached: 0, cache: 0, output: 0 },
  )
}

function span(stats: readonly SessionStats[]): { from: number; to: number } | null {
  let from: number | null = null
  let to: number | null = null
  for (const item of stats) {
    if (item.firstEvent !== null && (from === null || item.firstEvent < from)) from = item.firstEvent
    if (item.lastEvent !== null && (to === null || item.lastEvent > to)) to = item.lastEvent
  }
  return from === null || to === null ? null : { from, to }
}

function tableRow(label: string, count: number, totals: { requests: number; uncached: number; cache: number; output: number }, wall: string): string {
  return [
    pad(label, 22),
    String(count).padStart(6),
    n(totals.requests).padStart(9),
    n(totals.uncached).padStart(12),
    n(totals.cache).padStart(14),
    n(totals.output).padStart(11),
    wall.padStart(9),
  ].join('  ')
}

function tableHeader(): string {
  return [
    pad('范围', 22),
    '会话数'.padStart(6),
    '请求数'.padStart(9),
    '未命中输入'.padStart(12),
    '命中缓存输入'.padStart(14),
    '输出'.padStart(11),
    '墙钟'.padStart(9),
  ].join('  ')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const sessionsRoot = resolveSessionsRoot(args.sessionsRoot)
  const sessions = await scanSessions(sessionsRoot)
  const children = buildChildren(sessions)

  let rootUuid: string | undefined
  let label = '全量会话'
  let tableLabel = '全量会话'
  if (args.root !== undefined) {
    rootUuid = uuidOf(args.root)
    if (!sessions.has(rootUuid)) FATAL(`根会话不在 ${sessionsRoot} 下：${args.root}`)
    label = `树（根 ${args.root}）`
    tableLabel = '全树'
  } else if (args.req !== undefined) {
    const source = readRequirementRoot(args.req)
    rootUuid = uuidOf(source)
    if (!sessions.has(rootUuid)) FATAL(`台账 sourceSessionId 不在 ${sessionsRoot} 下：${source}`)
    label = `${args.req}`
    tableLabel = args.req
  }

  const tree = rootUuid === undefined ? new Set(sessions.keys()) : collectTree(rootUuid, children)
  const treeRefs = [...tree].map((uuid) => sessions.get(uuid)).filter((ref): ref is SessionRef => ref !== undefined)

  const stats = await mapLimit(treeRefs, 4, async (ref) => analyzeSession(ref, args.until))
  stats.sort((a, b) => (a.firstEvent ?? 0) - (b.firstEvent ?? 0))

  const overall = sum(stats)
  const wall = span(stats)
  const wallText = wall === null ? '-' : fmtHours(wall.to - wall.from)

  process.stdout.write(`\n成本度量（口径同 docs/reviews/REQ-261006130057-7a43-token-cost-diagnosis.md）\n`)
  process.stdout.write(`范围：${label}    会话目录：${sessionsRoot}\n`)
  process.stdout.write(
    `时间窗：${args.until === undefined ? '全量' : `截至 ${fmtTime(args.until)}（--until 快照）`}${
      wall === null ? '' : `    首末事件：${fmtTime(wall.from)} → ${fmtTime(wall.to)}`
    }\n\n`,
  )

  process.stdout.write(`① 汇总\n${tableHeader()}\n`)
  process.stdout.write(`${tableRow(tableLabel, stats.length, overall, wallText)}\n`)
  if (rootUuid !== undefined) {
    const main = stats.filter((item) => item.ref.uuid === rootUuid)
    const subs = stats.filter((item) => item.ref.uuid !== rootUuid)
    const mainWall = span(main)
    const subWall = span(subs)
    process.stdout.write(
      `${tableRow('  ├ 主窗口（根会话）', main.length, sum(main), mainWall === null ? '-' : fmtHours(mainWall.to - mainWall.from))}\n`,
    )
    process.stdout.write(
      `${tableRow('  └ 子代理', subs.length, sum(subs), subWall === null ? '-' : fmtHours(subWall.to - subWall.from))}\n`,
    )
  }

  const failures = stats
    .flatMap((item) => item.failures.map((failure) => ({ failure, uuid: item.ref.uuid })))
    .sort((a, b) => a.failure.time - b.failure.time)
  const failureUncached = failures.reduce((acc, item) => acc + item.failure.uncached, 0)

  process.stdout.write(
    `\n② 缓存失效点（cacheReadTokens < ${n(CACHE_HIT_FLOOR)} 且 inputTokens > ${n(UNCACHED_FLOOR)}）：共 ${failures.length} 条，合计未命中 ${n(failureUncached)}${
      overall.uncached === 0 ? '' : `（占全树未命中 ${((failureUncached / overall.uncached) * 100).toFixed(1)}%）`
    }\n`,
  )
  if (failures.length === 0) {
    process.stdout.write('  （无）\n')
  } else {
    process.stdout.write(
      `  ${'时间'.padEnd(17)}${'会话'.padEnd(10)}${'turn/step'.padEnd(11)}${'未命中'.padStart(10)}${'命中'.padStart(10)}  前60s内 system/message\n`,
    )
    for (const { failure, uuid } of failures) {
      const turnStep = `t${failure.turn ?? '?'} s${failure.step ?? '?'}`
      process.stdout.write(
        `  ${fmtTime(failure.time).padEnd(17)}${uuid.slice(0, 8).padEnd(10)}${turnStep.padEnd(11)}${n(failure.uncached).padStart(10)}${n(failure.cache).padStart(10)}  ${
          failure.systemWithinLookback ? '是' : '否'
        }\n`,
      )
    }
  }

  process.stdout.write(`\n③ ${USAGE_LINE}\n\n`)
}

await main()
