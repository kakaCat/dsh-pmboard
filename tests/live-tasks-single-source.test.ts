/**
 * 反面断言：手写活卡判定的字面量基线与「新增即红」（REQ-261005193546-1b1a t-e827bd / FR-4 / TC-6）。
 *
 * 契源：design/interfaces.md §8（字面量基线与「新增即红」）· design/architecture.md §防漂移设计（第 2 层）
 *       · design/backend.md §断言域文件清单 · design/test-cases.md TC-6 /「假红防线 7」。
 *
 * 本需求要修的第二种病是**口径漂移**：同一句「这张卡是不是活卡」被抄成手写比较
 * （`status !== 'canceled'` / `status === 'canceled'`）散在消费点里。判据单点落地后（`Predicates.ts`），
 * 剩下能悄悄退回去的路只有一条：**有人把某个收编点改回手写**。
 *
 * 这份用例就是拦住那条路的三张网：
 *   ① 新增即红  —— 全仓（排除 `tests/`）实测命中集合 ⊆ 清单里的 `baseline`；任何基线之外的新命中
 *      点名「文件 + 行号 + 行原文」即红（**不要求全仓零手写**：写侧守卫与需求级 `req.status` 判定按设计
 *      §8 登记为基线）。
 *   ② 收编点复读 —— `collected` 逐个 (file, symbol) 断言：该函数体内**零手写比较**且**含单点调用**
 *      （含「把收编点改回手写」这一形态）。
 *   ③ 清单方向钉死 —— `baseline` 里的条目必须在 `hits ∪ collected` 里仍存在（删掉一条 `baseline` 即红），
 *      而不是只做单向 ⊆（单向意味着「删掉一条基线」永远绿）。
 *
 * **独立用例**（裁定 8 / 假红防线 7）：**不挂进 `tests/layer-boundary.test.ts`** —— 那条用例在本工作树
 * 当前本就是红的（`application/` 越界 import 15 处等），挂进去等于把这张新网埋在已知失败里。
 *
 * 命中键 = **「文件 + 去首尾空白后的行原文」**，不按行号（行号会漂移；见清单 `_note`）。
 * 基础事实（写稿时实测）：`src/` 命中 39 行 / 25 文件；收编点 18 处（§4.1 八处 + §3/§8 依赖判定四处，去重）。
 *
 * 逆验证（三条各自必红，逐字节还原后 md5 见任务汇报）：
 *   ① `QueryStageDetail.ts` 的 `assemble()` 里插一行 `t.status !== 'canceled'`；
 *   ② `protocol.ts` 的 `readyTasks` 里插一行手写 `doneIds.has(dep)`；
 *   ③ 从清单文件删掉一条 `baseline` 条目。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { liveCountOf, liveTasksOf } from '../src/domain/status/Predicates.js'

// ── 路径与清单 ────────────────────────────────────────────────────────────

/** 扫描根：全仓 `src/`（**排除 `tests/`** —— 用例面自证用字面量数卡，不是判据的消费点）。 */
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const MANIFEST_PATH = fileURLToPath(new URL('./fixtures/canceled-literal-baseline.json', import.meta.url))

/** 命中的比较式形态（清单与用例共用同一个正则；行原文去首尾空白后匹配）。 */
const CANCELED_LITERAL = /status\s*(?:!==|===)\s*['"]canceled['"]/

/**
 * 收编点可用的单点调用（domain/status/Predicates.ts 的导出面；`layerInputOf` 是分层剪边单点）。
 * 允许值里**不含**任何 `status …'canceled'` 形态 —— 这正是「改回手写」会被 ② 抓到的地方。
 */
const SINGLE_POINT_CALLS = [
  'isLiveTask(',
  'liveTasksOf(',
  'liveCountOf(',
  'isReadyTask(',
  'isDependencySatisfied(',
  'liveReadyTasks(',
  'layerInputOf(',
  'liveLayers(',
  'splitDependencyEdges(',
] as const

const REASONS = ['req-status', 'write-side-guard', 'status-label', 'definition-site'] as const

interface CollectedEntry {
  /** 工作区相对路径。 */
  file: string
  /** 收编点所在符号（`Class.method` 或函数名）。 */
  symbol: string
  /** **改前**那一行的原文（实施后已删）。改回手写 ⇒ 该原文重新出现在命中集合里。 */
  line: string
  /** 实施后该收编点里**应存在**的单点调用形态。 */
  current: string
  /** `current` 里必须出现的 marker（用于「含单点调用」断言，比泛泛扫 `liveTasksOf(` 更钉得住）。 */
  marker: string
}
interface BaselineEntry {
  file: string
  /** 命中的**行原文**（去首尾空白）。 */
  line: string
  reason: (typeof REASONS)[number]
  /** `code` = 真的比较式；`comment` = 命中行是注释（扫描器按行原文采集，注释行也在命中集合内）。 */
  lineKind: 'code' | 'comment'
}
interface Manifest {
  collected: CollectedEntry[]
  baseline: BaselineEntry[]
}
const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  _note: string
  collected: (Omit<CollectedEntry, 'lineKind'> & { reason?: string })[]
  baseline: { file: string; line: string; reason: string; line_kind?: string }[]
}
const MANIFEST: Manifest = {
  collected: raw.collected.map((c) => ({
    file: c.file,
    symbol: c.symbol,
    line: c.line,
    current: c.current,
    marker: c.marker,
  })),
  baseline: raw.baseline.map((b) => ({
    file: b.file,
    line: b.line,
    reason: b.reason as BaselineEntry['reason'],
    lineKind: b.line_kind === 'comment' ? 'comment' : 'code',
  })),
}

// ── 扫描器：逐行命中 + 注释判定（不猜、不引入依赖） ───────────────────────

/** 该位置是否落在行注释 / 块注释里（字符串内的 `//` 会误判，但只会把「代码行」误标成注释，不会反向）。 */
function inComment(text: string, pos: number): boolean {
  let lineComment = -1
  let blockComment = -1
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== '/') continue
    const next = text[i + 1]
    if (next === '/') {
      lineComment = i
      break
    }
    if (next === '*' && blockComment < 0) blockComment = i
  }
  if (lineComment >= 0 && pos > lineComment) return true
  if (blockComment >= 0 && pos > blockComment) return true
  return false
}

interface Hit {
  file: string
  line: number
  /** 去首尾空白后的行原文（= 清单匹配键）。 */
  text: string
  kind: 'code' | 'comment'
}

/** 只扫 `src/`（契约要求排除 `tests/`），逐文件逐行。 */
function scanTree(dir: string): Hit[] {
  const hits: Hit[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const abs = `${d}/${entry.name}`
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/)
      lines.forEach((rawline, i) => {
        const m = CANCELED_LITERAL.exec(rawline)
        if (m === null) return
        hits.push({
          file: abs,
          line: i + 1,
          text: rawline.trim(),
          kind: inComment(rawline, m.index) ? 'comment' : 'code',
        })
      })
    }
  }
  walk(dir)
  return hits
}

const HITS = scanTree(SRC)
const REL = (abs: string): string => abs.slice(SRC.length - 3) // `.../src` → `src/...`

// ── 函数体抽取（按花括号配平；够本用例用，不引第三方 parser） ──────────────

/**
 * 取出 `file` 里 `symbol` 的函数/方法体源码。
 *
 * 匹配形态：`function name(`、`async function name(`、`const name = (`（含 `export` 前缀）、
 * 以及类方法 `name(`。取第一个 `{` 之后配平到配对的 `}`。找不到 ⇒ 返回 undefined（用例据此点名报错）。
 */
function bodyOf(file: string, symbol: string): string | undefined {
  const text = readFileSync(file, 'utf8')
  // 符号的**声明**形态（最后一次出现优先：同名 helper 在前、真实声明在后时会取到后者）
  const dot = symbol.lastIndexOf('.')
  const name = dot >= 0 ? symbol.slice(dot + 1) : symbol
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*(?:<[^>]*>)?\\s*\\(`
      + `|(?:export\\s+)?(?:const|let)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(`
      + `|(?:^|\\n)\\s*(?:public\\s+|protected\\s+|private\\s+)?(?:abstract\\s+)?(?:async\\s+)?${escaped}\\s*(?:<[^>]*>)?\\s*\\(`,
    'g',
  )
  let m: RegExpExecArray | null
  let last: RegExpExecArray | null = null
  while ((m = re.exec(text)) !== null) last = m
  if (last === null) return undefined
  const open = text.indexOf('{', last.index + last[0].length - 1)
  if (open < 0) return undefined
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(open, i + 1)
    }
  }
  return undefined
}

const collectedBodies = MANIFEST.collected.map((point) => ({
  point,
  body: bodyOf(point.file, point.symbol),
}))

// ── 清单自洽（读盘即验）：形状 / 枚举 / 空清单都不许静默通过 ────────────────

describe('① 清单自洽：形状、枚举、方向钉死的前提', () => {
  it('清单文件可读、collected / baseline 均非空', () => {
    expect(existsSync(MANIFEST_PATH), `清单文件缺失：${MANIFEST_PATH}`).toBe(true)
    expect(MANIFEST.baseline.length).toBeGreaterThan(0)
    expect(MANIFEST.collected.length).toBeGreaterThan(0)
  })

  it('每条 baseline 都带合法 reason（∈ 四类枚举）', () => {
    for (const b of MANIFEST.baseline) {
      expect(REASONS as readonly string[], `reason 非法/缺失：${b.file} :: ${b.line}`).toContain(b.reason)
    }
    const dist = new Map<string, number>()
    for (const b of MANIFEST.baseline) dist.set(b.reason, (dist.get(b.reason) ?? 0) + 1)
    // 四类都要用上：某一类为 0 往往意味着有人把该类的条目「顺手删了」（删条目由 ⑤ 兜底，这里只固化形状）
    for (const r of REASONS) expect(dist.get(r) ?? 0, `reason=${r} 一条都没有——清单被削过？`).toBeGreaterThan(0)
  })

  it('每条 collected 都必须是真的「改前手写行」：行原文命中比较式正则', () => {
    for (const c of MANIFEST.collected) {
      expect(
        CANCELED_LITERAL.test(c.line) && CANCELED_LITERAL.test(c.line.trim()),
        `collected 的 line 必须命中 ${String(CANCELED_LITERAL)}（改回手写才落进「新增」分支）：${c.file} :: ${c.symbol}`,
      ).toBe(true)
      expect(c.marker.length, `collected 缺 marker：${c.file} :: ${c.symbol}`).toBeGreaterThan(0)
      expect(c.current.length, `collected 缺 current：${c.file} :: ${c.symbol}`).toBeGreaterThan(0)
    }
  })

  it('收编点文件可读、不存在重复的 (file, symbol) 或 (file, line) 条目', () => {
    for (const c of MANIFEST.collected) {
      expect(existsSync(fileURLToPath(new URL('../' + c.file, import.meta.url))), `收编点文件不存在：${c.file}`).toBe(true)
    }
    expect(new Set(MANIFEST.collected.map((c) => `${c.file}#${c.symbol}`)).size).toBe(MANIFEST.collected.length)
    expect(new Set(MANIFEST.baseline.map((b) => `${b.file}#${b.line}`)).size).toBe(MANIFEST.baseline.length)
  })
})

// ── ② 收编点逐个断言：零手写 + 含单点调用（把复用改回手写即此处必红） ────────

describe('② 收编点：函数体内零手写比较且含单点调用', () => {
  it('每个收编点都能定位到函数体（路径/符号写错即红——防假绿）', () => {
    for (const { point, body } of collectedBodies) {
      expect(body, `抽不到函数体：${point.file} 的 ${point.symbol}（符号名或路径写错？）`).toBeTypeOf('string')
      expect(body!.length, `函数体为空：${point.file} 的 ${point.symbol}`).toBeGreaterThan(0)
    }
  })

  it('每个收编点体内：零手写 canceled 比较、且含其 marker 指定的单点调用', () => {
    const problems: string[] = []
    for (const { point, body } of collectedBodies) {
      const text = body!
      const lines = text.split(/\r?\n/)
      lines.forEach((l, i) => {
        const m = CANCELED_LITERAL.exec(l)
        if (m !== null && !inComment(l, m.index)) {
          problems.push(`${point.file} 的 ${point.symbol} 体内仍有手写比较（+${i + 1} 行相对）：${l.trim()}`)
        }
      })
      if (!text.includes(point.marker)) {
        problems.push(`${point.file} 的 ${point.symbol} 体内不含 ${point.marker}（单点调用被删/被改回手写？）`)
      }
      if (!text.includes(point.current)) {
        problems.push(`${point.file} 的 ${point.symbol} 体内不含收编后的调用行：${point.current}`)
      }
      if (!SINGLE_POINT_CALLS.some((call) => text.includes(call))) {
        problems.push(`${point.file} 的 ${point.symbol} 体内没有任何判据单点调用`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})

// ── ③ 三条就绪实现 + V-5 + 两个 RTM 入口（防「只改一处」） ─────────────────

describe('③ 依赖判定与 RTM 入口的单点调用（漏一处即红）', () => {
  it('三处 ready 实现都走单点（queue-access / topology / shared.protocol）', () => {
    // 符号集合必须含 `liveReadyTasks(`：`shared/protocol.ts` 的 `readyTasks` 收敛后**只**出现
    // `liveReadyTasks(`，不含 `isReadyTask(` —— 只 grep 后者会漏这一处（t2 实测）。
    const expectations: [string, string, string][] = [
      ['src/application/use-cases/queue-access.ts', 'readyTasksOf', 'isReadyTask('],
      ['src/domain/queue/topology.ts', 'computeReady', 'isReadyTask('],
      ['src/shared/protocol.ts', 'readyTasks', 'liveReadyTasks('],
    ]
    for (const [file, symbol, marker] of expectations) {
      const body = bodyOf(file, symbol)
      expect(body, `抽不到函数体：${file} 的 ${symbol}`).toBeTypeOf('string')
      expect(body!, `${file} 的 ${symbol} 体内不含 ${marker}`).toContain(marker)
    }
  })

  it('V-5（validateQueue.validateQueueFile）体内含 isDependencySatisfied(', () => {
    const body = bodyOf('src/domain/queue/validateQueue.ts', 'validateQueueFile')
    expect(body, '抽不到 validateQueueFile 的函数体').toBeTypeOf('string')
    expect(body!, 'V-5 判据未与单点同源（写路径会被自己拒掉）').toContain('isDependencySatisfied(')
  })

  it('四处就绪判定的函数体内不得出现手写就绪式（doneIds.has / 旧 done 比较）', () => {
    // 逆验证②实测（本卡）：光扫 `status …'canceled'` 抓不到「把复用改回手写 `doneIds.has(dep)`」——
    // 那种退化**不含任何 canceled 字面量**（只认 done），正是缺陷 1 第 2/3 处口径漂移的原始形态。
    // 故在「新增即红」之外，对四处就绪实现额外禁掉手写就绪式：
    //   ① `.has(` —— **白名单外**的集合判定（正常实现用的是 `readyIds` / `byId` / `cache` 这类索引）；
    //   ② `status === 'done'` / `status !== 'done'` —— 旧口径「只认 done」的两半。
    // 注释行不算（判据说明里会引用旧写法，如 `readyTasks` 的文档注释）。
    // 白名单 = 这四处实现里**既有**的正当索引集合（审查界面上看得见，加名即改动本文件）；
    // 不在名单里的 `.has(` 一律点名 —— 把复用改回 `doneIds.has(dep)` 就是靠这条响的。
    const ALLOWED_HAS_RECEIVERS = new Set([
      'readyIds', 'readySet', 'byId', 'layerOf', 'cache', 'ids', 'liveIds', 'seen', 'color',
      'dupTitles', 'candidatesByKey', 'titleIndex',
    ])
    const targets: [string, string][] = [
      ['src/application/use-cases/queue-access.ts', 'readyTasksOf'],
      ['src/domain/queue/topology.ts', 'computeReady'],
      ['src/shared/protocol.ts', 'readyTasks'],
      ['src/domain/queue/validateQueue.ts', 'validateQueueFile'],
    ]
    const problems: string[] = []
    for (const [file, symbol] of targets) {
      const body = bodyOf(file, symbol)
      expect(body, `抽不到函数体：${file} 的 ${symbol}`).toBeTypeOf('string')
      body!.split(/\r?\n/).forEach((rawline, i) => {
        const has = /([A-Za-z_$][\w$]*)\.has\(/.exec(rawline)
        if (has !== null && !ALLOWED_HAS_RECEIVERS.has(has[1]!) && !inComment(rawline, has.index)) {
          problems.push(`${file} 的 ${symbol} 体内出现手写就绪索引判定（+${i + 1} 行相对）：${rawline.trim()}`)
        }
        const cmp = /status\s*(?:===|!==)\s*'done'/.exec(rawline)
        if (cmp !== null && !inComment(rawline, cmp.index)) {
          problems.push(`${file} 的 ${symbol} 体内退回「只认 done」旧口径（+${i + 1} 行相对）：${rawline.trim()}`)
        }
      })
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('两个 RTM 公开入口函数体都含 liveTasksOf（只给一个接线即红）', () => {
    for (const symbol of ['syncRTMYaml', 'syncRTMYamlWithSnapshot']) {
      const body = bodyOf('src/application/internal/rtm-yaml.ts', symbol)
      expect(body, `抽不到函数体：rtm-yaml.ts 的 ${symbol}`).toBeTypeOf('string')
      expect(body!, `${symbol} 入口未收敛为活卡（覆盖度分母会含取消卡）`).toContain('liveTasksOf(')
    }
  })
})

// ── ④ 范围自检（防假绿）：清单里每个文件都被读到，且该文件确实有 status 字样 ──

describe('④ 范围自检：扫描器真的读到了清单里的文件', () => {
  it('清单每个文件必须存在、被读到内容、且 status 字样命中数 > 0', () => {
    const files = [...new Set([...MANIFEST.baseline.map((b) => b.file), ...MANIFEST.collected.map((c) => c.file)])]
    expect(files.length, '清单文件集合为空').toBeGreaterThan(0)
    const problems: string[] = []
    for (const rel of files) {
      const abs = fileURLToPath(new URL('../' + rel, import.meta.url))
      if (!existsSync(abs)) {
        problems.push(`文件不存在（路径写错 ⇒ 该文件的命中永远不会被检查）：${rel}`)
        continue
      }
      const text = readFileSync(abs, 'utf8')
      if (text.length === 0) problems.push(`文件读到空内容：${rel}`)
      const statusHits = (text.match(/status/g) ?? []).length
      if (statusHits === 0) problems.push(`文件内 status 字样命中 0（扫描范围/路径可疑）：${rel}`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('扫描根就是 src/、且命中集合非空（路径写错即红）', () => {
    expect(SRC.endsWith('/src'), `扫描根可疑：${SRC}`).toBe(true)
    expect(HITS.length, `扫描根 ${SRC} 下 0 命中——路径写错或清单口径失效`).toBeGreaterThan(0)
    for (const h of HITS) expect(REL(h.file).startsWith('src/'), `扫描越界到 ${REL(h.file)}`).toBe(true)
  })
})

// ── ⑤ 新增即红 + 删条目即红（双向钉死） ───────────────────────────────────

describe('⑤ 新增即红：实测命中集合 ⊆ baseline', () => {
  it('基线之外的新手写命中 === 0（失败时点名 文件 + 行号 + 行原文）', () => {
    const allowed = new Set(MANIFEST.baseline.map((b) => `${b.file}#${b.line}`))
    const fresh = HITS.filter((h) => !allowed.has(`${REL(h.file)}#${h.text}`))
    const detail = fresh
      .map((h) => `  ${REL(h.file)}:${h.line}  ${h.text}`)
      .join('\n')
    expect(
      fresh.length,
      fresh.length === 0
        ? ''
        : '检测到基线之外的新手写活卡判定（新增即红）；'
          + '请改调 `domain/status/Predicates.ts` 的单点，或在清单里登记基线条目并写明 reason：\n'
          + detail
          + `\n\n清单：${MANIFEST_PATH}\n复核命令：npx vitest run tests/live-tasks-single-source.test.ts`,
    ).toBe(0)
  })

  it('命中集合与清单口径一致：baseline 无重复、且每条仍带 reason', () => {
    const seen = new Set<string>()
    for (const b of MANIFEST.baseline) {
      const key = `${b.file}#${b.line}`
      expect(seen.has(key), `baseline 重复条目：${key}`).toBe(false)
      seen.add(key)
      expect(b.reason.length, `baseline 缺 reason：${key}`).toBeGreaterThan(0)
    }
  })
})

describe('⑥ 删条目 / 漏判据即红：baseline ⊆ hits ∪ collected', () => {
  it('清单里每条 baseline 都能在「实测命中 ∪ 收编点原行」里找到（删掉一条即红）', () => {
    const present = new Set([
      ...HITS.map((h) => `${REL(h.file)}#${h.text}`),
      ...MANIFEST.collected.map((c) => `${c.file}#${c.line}`),
    ])
    const missing = MANIFEST.baseline
      .map((b) => `${b.file}#${b.line}`)
      .filter((key) => !present.has(key))
    expect(
      missing.length,
      missing.length === 0 ? '' : '清单条目在源码里已不存在（条目失效 / 清单被削 / 判据被删）：\n  ' + missing.join('\n  '),
    ).toBe(0)
  })

  it('收编点的「改前行原文」不得重新出现在实测命中集合里（改回手写即红）', () => {
    const hits = new Set(HITS.map((h) => `${REL(h.file)}#${h.text}`))
    const reverted = MANIFEST.collected
      .map((c) => `${c.file}#${c.line}`)
      .filter((key) => hits.has(key))
    expect(
      reverted.length,
      reverted.length === 0 ? '' : '收编点被改回手写（原行原文重新出现在命中集合里）：\n  ' + reverted.join('\n  '),
    ).toBe(0)
  })
})

// ── ⑦ 等值断言：计数器不得自成一套（INV-1/INV-5 的机器化的一半） ────────────

describe('⑦ liveCountOf 与 liveTasksOf 同源', () => {
  it('liveCountOf(t) === liveTasksOf(t).length（遍历 status × 依赖形态的组合）', () => {
    const statuses = ['todo', 'in_progress', 'integrating', 'testing', 'in_review', 'done', 'canceled']
    const specimens: { status: string; id: string; dependsOn?: string[] }[][] = []
    // ① 单卡矩阵：7 个状态各一张
    specimens.push(statuses.map((status, i) => ({ status, id: `s${i}` })))
    // ② 混排 + 依赖形态：活卡依赖取消卡 / done 卡 / 缺席卡
    specimens.push([
      { status: 'todo', id: 'a', dependsOn: ['c1'] },
      { status: 'canceled', id: 'c1' },
      { status: 'todo', id: 'b', dependsOn: ['d1'] },
      { status: 'done', id: 'd1' },
      { status: 'todo', id: 'e', dependsOn: ['ghost'] },
      { status: 'in_review', id: 'f', dependsOn: [] },
    ])
    // ③ 边界：空集合 / 全取消
    specimens.push([])
    specimens.push([
      { status: 'canceled', id: 'x1' },
      { status: 'canceled', id: 'x2' },
      { status: 'canceled', id: 'x3' },
    ])
    for (const [i, tasks] of specimens.entries()) {
      expect(liveCountOf(tasks), `标本 ${i}：计数器与集合判据不同源`).toBe(liveTasksOf(tasks).length)
    }
  })
})
