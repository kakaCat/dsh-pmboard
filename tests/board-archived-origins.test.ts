/**
 * `/state` 派生来源三态（REQ-261006201841-944d t8 · serves: FR-7）。
 *
 * ## 这个用例在防什么
 *
 * 看板归档条要能分清「目录在本仓 / 在别处 / 归属未知」。判据若落在客户端，就得比路径字符串
 * （D-4 红线）；若落在路由里，就不好单测、且离被复制只差一次顺手。故判据收在
 * `application/internal/requirement-origins.ts` 一处，路由只做协议转换。本文件钉住四件事：
 *
 *   ① 记录的根 == 当前 docs 根 → `local`；
 *   ② 根指向另一个项目 → `elsewhere` + `projectName`（该根末段名）+ `root`；
 *   ③ 既无 `projectId` 也无 `workspaceRoot` → `unknown` 且**不带 `root` 键**（不冒充本仓）；
 *   ④ `origins` 只对**本页** requirements 计算（键数 ≤ 本页条数，不下发全量）；
 *   ⑤ 静态断言：`src/http/routers/stages.ts` 里没有 `startsWith` / 路径字面量相等形态的项目判定。
 *
 * 夹具姿态照抄 `tests/project-identity.e2e.test.ts`（同款 `rec()` 播种 + 假 req/res 直连
 * `createReqboardHandler`，不起真服务器）。
 *
 * @module dsh-pmboard/tests/board-archived-origins
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { createReqboardHandler } from '../src/http/routes.js'
import type { ProjectEntry } from '../src/application/ports.js'
import {
  requirementOriginOf,
  requirementOriginsOf,
  type RequirementOrigin,
} from '../src/application/internal/requirement-origins.js'
import type { ReportResponse, RequirementRecord } from '../src/shared/protocol.js'
// REQ-261006201841-944d t9：本文件下半段钉**客户端渲染**（归档条三态 + 详情提示块）。
// 判据口径 = design/frontend.md §前端用例与判据 U-1…U-12（全部为纯函数调用，零 DOM）。
import {
  ARCHIVED_CHIPS_MAX,
  renderArchivedBar,
  renderArchivedSourceHint,
  toTerminalCards,
} from '../src/client/views/board.js'
import { buildReqDetail } from '../src/client/views/stage-detail.js'
import { buildReportShell } from '../src/client/views/report-tabs.js'
import type { BoardState, RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'

const REQ_LOCAL = 'REQ-261006000001-aaaa'
const REQ_ELSEWHERE = 'REQ-261006000002-bbbb'
const REQ_UNKNOWN = 'REQ-261006000003-cccc'

const P_OTHER = 'w-other'

let dirHost: string
let dirOther: string
let dirQueue: string

beforeEach(() => {
  dirHost = mkdtempSync(join(tmpdir(), 'pmboard-origins-host-'))
  dirOther = mkdtempSync(join(tmpdir(), 'pmboard-origins-other-'))
  dirQueue = mkdtempSync(join(tmpdir(), 'pmboard-origins-queue-'))
})
afterEach(() => {
  for (const d of [dirHost, dirOther, dirQueue]) rmSync(d, { recursive: true, force: true })
})

/** 播种用的最小需求记录（形状照抄 `project-identity.e2e.test.ts` 的 `rec`）。 */
function rec(id: string, opts: { projectId?: string; workspaceRoot?: string } = {}): RequirementRecord {
  return {
    id,
    title: id,
    description: '',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...opts,
  } as unknown as RequirementRecord
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  return res
}

async function get(
  handler: (req: unknown, res: unknown) => Promise<void>,
  url: string,
): Promise<any> {
  const req = new EventEmitter() as any
  req.url = '/dashboard/api/reqboard' + url
  req.method = 'GET'
  req[Symbol.asyncIterator] = async function* () { /* GET 无体 */ }
  const res = fakeRes()
  await handler(req, res)
  return res.payload
}

// ---------------------------------------------------------------------------
// 判据 ①②③：三态派生（纯函数 = 判据单点）
// ---------------------------------------------------------------------------

describe('判据①②③：三态派生（纯函数，判据单点在 application/internal）', () => {
  it('① 记录的根等于当前 docs 根 → local，且 root 就是该根', () => {
    const origin = requirementOriginOf({ docs: {} }, rec(REQ_LOCAL, { workspaceRoot: dirHost }), dirHost)
    expect(origin.kind).toBe('local')
    expect(origin.root).toBe(dirHost)
    expect(origin.by).toBe('path-fallback')
  })

  it('② 根指向另一个项目 → elsewhere，projectName = 该根末段名、root = 该根', () => {
    const origin = requirementOriginOf({ docs: {} }, rec(REQ_ELSEWHERE, { workspaceRoot: dirOther }), dirHost)
    expect(origin.kind).toBe('elsewhere')
    expect(origin.projectName).toBe(basename(dirOther))
    expect(origin.root).toBe(dirOther)
    // 路径兜底 = 如实标注（没有项目表命中就不得冒充项目身份）
    expect(origin.by).toBe('path-fallback')
    expect(origin.projectId).toBeUndefined()
  })

  it('③ 既无 projectId 也无 workspaceRoot → unknown，且**不带 root 键**', () => {
    const origin = requirementOriginOf({ docs: {} }, rec(REQ_UNKNOWN), dirHost)
    expect(origin.kind).toBe('unknown')
    expect(origin.by).toBe('unknown')
    expect('root' in origin, 'unknown 不得下发 root（编不出根就不编）').toBe(false)
    expect('projectName' in origin).toBe(false)
    expect(origin.kind, 'unknown 不得冒充 local').not.toBe('local')
  })

  it('③ 附带：有 projectId 但项目表未装配、且无 workspaceRoot → 仍 unknown（不猜）', () => {
    const origin = requirementOriginOf({ docs: {} }, rec(REQ_UNKNOWN, { projectId: P_OTHER }), dirHost)
    expect(origin.kind).toBe('unknown')
    expect('root' in origin).toBe(false)
  })

  it('项目表命中时按身份取根并带 projectId（记录里过期的路径不作数）', () => {
    const entries: ProjectEntry[] = [{ id: P_OTHER, path: dirOther, sessionIds: [] }]
    const deps = { docs: {}, projectRegistry: { list: () => entries } }
    const origin = requirementOriginOf(deps, rec(REQ_ELSEWHERE, { projectId: P_OTHER, workspaceRoot: dirHost }), dirHost)
    expect(origin.kind).toBe('elsewhere')
    expect(origin.by).toBe('project-id')
    expect(origin.projectId).toBe(P_OTHER)
    expect(origin.root).toBe(dirOther)
    expect(origin.projectName).toBe(basename(dirOther))
  })

  it('批量派生：键 = 入参 id，一条不落（unknown 也出键，不是"缺键降级"）', () => {
    const origins = requirementOriginsOf(
      { docs: {} },
      [rec(REQ_LOCAL, { workspaceRoot: dirHost }), rec(REQ_UNKNOWN)],
      dirHost,
    )
    expect(Object.keys(origins).sort()).toEqual([REQ_LOCAL, REQ_UNKNOWN].sort())
    expect(origins[REQ_UNKNOWN]?.kind).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// 判据 ①②③④：走真路由（`GET /state`）——载荷里真的多了 origins，且只算本页
// ---------------------------------------------------------------------------

describe('判据①②③④：GET /state 载荷（真路由）', () => {
  function makeHandler(store: ReturnType<typeof makeTestStore>) {
    return createReqboardHandler({
      requirementStore: store,
      taskStore: taskStoreAt(dirQueue),
      now: () => 1000,
      cwd: dirHost, // 无 ?session= → 读根回落 legacy cwd（= 本仓参照点）
    }) as unknown as (req: unknown, res: unknown) => Promise<void>
  }

  it('三态齐活：payload.origins 逐条给出 local / elsewhere / unknown', async () => {
    const store = makeTestStore({
      requirements: [
        rec(REQ_LOCAL, { workspaceRoot: dirHost }),
        rec(REQ_ELSEWHERE, { workspaceRoot: dirOther }),
        rec(REQ_UNKNOWN),
      ],
    })
    const payload = await get(makeHandler(store), '/state')
    expect(payload.success).toBe(true)
    const origins = payload.data.origins as Record<string, RequirementOrigin>
    const roots: Record<string, string> = { [REQ_LOCAL]: dirHost, [REQ_ELSEWHERE]: dirOther }

    expect(origins[REQ_LOCAL]?.kind).toBe('local')
    expect(origins[REQ_LOCAL]?.root).toBe(roots[REQ_LOCAL])
    expect(origins[REQ_ELSEWHERE]?.kind).toBe('elsewhere')
    expect(origins[REQ_ELSEWHERE]?.root).toBe(roots[REQ_ELSEWHERE])
    expect(origins[REQ_ELSEWHERE]?.projectName).toBe(basename(dirOther))
    expect(origins[REQ_UNKNOWN]?.kind).toBe('unknown')
    expect('root' in (origins[REQ_UNKNOWN] ?? {})).toBe(false)
  })

  it('④ 只对本页 requirements 计算：limit=1 时键数 = 1（全量 3 条不下发）', async () => {
    const store = makeTestStore({
      requirements: [
        rec(REQ_LOCAL, { workspaceRoot: dirHost }),
        rec(REQ_ELSEWHERE, { workspaceRoot: dirOther }),
        rec(REQ_UNKNOWN),
      ],
    })
    const payload = await get(makeHandler(store), '/state?limit=1')
    const pageIds = payload.data.requirements.map((r: { id: string }) => r.id)
    const originKeys = Object.keys(payload.data.origins)

    expect(pageIds).toHaveLength(1)
    expect(originKeys).toEqual(pageIds) // 键集 = 本页 id 集（不是整册）
    expect(originKeys.length).toBeLessThanOrEqual(pageIds.length)
    // 未进本页的两条**不得**出现（否则"只算本页"就是空话）
    for (const id of [REQ_LOCAL, REQ_ELSEWHERE, REQ_UNKNOWN]) {
      if (!pageIds.includes(id)) expect(payload.data.origins[id]).toBeUndefined()
    }
  })

  it('项目表在位时：身份判据真的生效（by=project-id）——路由确实把项目表喂给了判据单点', async () => {
    const SESSION = 'session-origins'
    const entries: ProjectEntry[] = [{ id: P_OTHER, path: dirHost, sessionIds: [SESSION] }]
    const store = makeTestStore({
      requirements: [
        rec(REQ_LOCAL, { projectId: P_OTHER, workspaceRoot: dirHost }),
        rec(REQ_UNKNOWN),
      ],
    })
    const handler = createReqboardHandler({
      requirementStore: store,
      taskStore: taskStoreAt(dirQueue),
      now: () => 1000,
      applicationDeps: { store, projectRegistry: { list: () => entries } } as never,
      sessionProject: (sid: string | undefined) => (sid === SESSION ? { projectId: P_OTHER, root: dirHost } : undefined),
    }) as unknown as (req: unknown, res: unknown) => Promise<void>

    const payload = await get(handler, '/state?session=' + SESSION)
    const origin = payload.data.origins[REQ_LOCAL] as RequirementOrigin
    expect(origin.kind).toBe('local')
    expect(origin.by).toBe('project-id') // 身份判据（不是路径兜底）
    expect(origin.projectId).toBe(P_OTHER)
    expect(origin.root).toBe(dirHost)
    // 未归属的存量记录仍如实报「归属未知」，不因本项目有身份就被算成本项目
    expect((payload.data.origins[REQ_UNKNOWN] as RequirementOrigin).kind).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// 判据 ⑤：静态断言——判据不落在路由里
// ---------------------------------------------------------------------------

/** 去注释（块注释 + 行注释）：门禁扫的是**代码形态**，注释里提到 `startsWith` 不算犯规。 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/** 路径字面量（含 `/` 或 `\`）紧邻比较运算符 = 路径字符串相等形态的项目判定。 */
const PATH_EQ = [
  /(===|!==|==|!=)\s*['"`][^'"`]*[\\/][^'"`]*['"`]/,
  /['"`][^'"`]*[\\/][^'"`]*['"`]\s*(===|!==|==|!=)/,
]
const CALLS_STARTS_WITH = /\.startsWith\s*\(/

function offendersOf(code: string): string[] {
  return code
    .split('\n')
    .filter((line) => CALLS_STARTS_WITH.test(line) || PATH_EQ.some((re) => re.test(line)))
}

describe('判据⑤：静态断言（src/http/routers/stages.ts 无新增路径字符串判定）', () => {
  const raw = readFileSync(new URL('../src/http/routers/stages.ts', import.meta.url), 'utf8')
  const code = stripComments(raw)

  it('没有 startsWith / 路径字面量相等形态（改动前为 0，故断言 0 —— 新增即红）', () => {
    expect(offendersOf(code), '路由里出现了路径字符串判定（应改为调用判据单点）').toEqual([])
  })

  it('判据单点：路由只调用派生函数，自己不引 sameProjectRoot / 不做路径比较', () => {
    expect(/requirementOriginsOf\s*\(/.test(code), '路由必须调用判据单点').toBe(true)
    expect(/sameProjectRoot/.test(code), '同项目判定必须留在 application 层').toBe(false)
  })

  it('守卫自身的守卫：注入两种犯规形态时扫描器会响（防假绿）', () => {
    const injectedStart = code + '\nconst kind = root.startsWith(\'/tmp/\') ? \'local\' : \'elsewhere\'\n'
    expect(offendersOf(injectedStart)).toHaveLength(1)
    const injectedEq = code + '\nconst kind = root === \'/tmp/other-project\' ? \'local\' : \'elsewhere\'\n'
    expect(offendersOf(injectedEq)).toHaveLength(1)
  })

  it('去注释有效性自检：被注释掉的犯规形态不算犯规', () => {
    expect(offendersOf(stripComments('// root.startsWith("/tmp")\n/* a === "/b/c" */\nconst x = 1\n'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 判据 ①~⑤：客户端渲染 —— 归档条 chip 三态（U-1…U-8，design/frontend.md）
// ---------------------------------------------------------------------------

const T1 = 1_700_000_000_000
const CID = 'REQ-261006000009-9999'
const CTITLE = '归档条三态渲染'

/** 单条终态需求的最小 BoardState（chip 渲染只读 id/title/status/tasks） */
function boardWith(id: string, title: string, status: 'archived' | 'canceled' = 'archived'): BoardState {
  return {
    revision: 1,
    requirements: [{ ...rec(id), title, status }],
    tasks: [],
    ready: {},
  } as unknown as BoardState
}

/** 一条 chip 的产物（`origins` 缺省 = 旧服务端形态）。 */
function chipHtml(origins?: Record<string, RequirementOrigin>): string {
  return renderArchivedBar(toTerminalCards(boardWith(CID, CTITLE)), ARCHIVED_CHIPS_MAX, origins)
}

describe('判据①~⑤：归档条 chip 三态渲染（客户端字符串，零 DOM）', () => {
  it('① kind=local → data-src="local" + 「本仓」，title 逐字不追加后缀（U-3）', () => {
    const html = chipHtml({ [CID]: { kind: 'local', root: '/w/host' } })
    expect(html).toContain('data-src="local"')
    expect(html).toContain('<span class="dsh-pm-archived-src" data-src="local">本仓</span>')
    expect(html).toContain('title="' + CTITLE + '"')
    expect(html).not.toContain('别处')
    expect(html).not.toContain('归属未知')
  })

  it('② kind=elsewhere → 「别处」+ 项目名，data-project 等于项目名，title 追加（项目名）（U-4）', () => {
    const html = chipHtml({
      [CID]: { kind: 'elsewhere', projectId: 'p1', projectName: 'dsh-notice-webhook', by: 'project-id', root: '/w/other/dsh-notice-webhook' },
    })
    expect(html).toContain('data-src="elsewhere"')
    expect(html).toContain('data-project="dsh-notice-webhook"')
    expect(html).toContain('别处·<span class="dsh-pm-archived-src-name">dsh-notice-webhook</span>')
    expect(html).toContain('title="' + CTITLE + '（dsh-notice-webhook）"')
    expect(html).not.toContain('本仓')
  })

  it('② 附带：elsewhere 缺 projectName → 「未命名项目」且**不输出** data-project（S-5，不编名字）', () => {
    const html = chipHtml({ [CID]: { kind: 'elsewhere', by: 'path-fallback' } })
    expect(html).toContain('data-src="elsewhere"')
    expect(html).toContain('别处·<span class="dsh-pm-archived-src-name">未命名项目</span>')
    expect(html).toContain('title="' + CTITLE + '（未命名项目）"')
    expect(html).not.toContain('data-project')
  })

  it('③ kind=unknown → 「归属未知」且**不含**「本仓」字样（U-6 / D-6）', () => {
    const html = chipHtml({ [CID]: { kind: 'unknown', by: 'unknown' } })
    expect(html).toContain('data-src="unknown"')
    expect(html).toContain('<span class="dsh-pm-archived-src" data-src="unknown">归属未知</span>')
    expect(html).not.toContain('本仓')
    expect(html).not.toContain('data-project')
    expect(html).toContain('title="' + CTITLE + '（归属未知）"')
  })

  it('③ 附带：`kind` 值域外（第 4 值）按 unknown 渲染，不静默当本仓（U-7）', () => {
    const html = chipHtml({ [CID]: { kind: 'orbit' } as unknown as RequirementOrigin })
    expect(html).toContain('data-src="unknown"')
    expect(html).toContain('归属未知')
    expect(html).not.toContain('本仓')
    expect(html).not.toContain('data-src="orbit"')
  })

  it('④ 缺该 req 键 / 整参缺省 / origins 为空表 → 不含 dsh-pm-archived-src，逐字等价旧行为（U-1）', () => {
    const noArg = chipHtml()
    const emptyMap = chipHtml({})
    const otherKey = chipHtml({ 'REQ-261006000010-0000': { kind: 'elsewhere', projectName: 'x' } })
    for (const html of [noArg, emptyMap, otherKey]) {
      expect(html).not.toContain('dsh-pm-archived-src')   // 整段短路，不是「渲染空 span」
      expect(html).not.toContain('data-src=')
      expect(html).toContain('title="' + CTITLE + '"')
    }
    // 缺键 = 逐字等价（不是「渲染空标注」）
    expect(emptyMap).toBe(noArg)
    expect(otherKey).toBe(noArg)
  })

  it('④ 附带：逐条降级——一条缺键不拖累另一条（U-2）', () => {
    const state = {
      revision: 1,
      requirements: [
        { ...rec(CID), title: CTITLE, status: 'archived', updatedAt: 2 },
        { ...rec('REQ-261006000011-1111'), title: '别处的需求', status: 'archived', updatedAt: 1 },
      ],
      tasks: [],
      ready: {},
    } as unknown as BoardState
    const html = renderArchivedBar(toTerminalCards(state), ARCHIVED_CHIPS_MAX, {
      'REQ-261006000011-1111': { kind: 'elsewhere', projectName: 'dsh-notice-webhook' },
    })
    expect(html).toContain('data-req="' + CID + '"')
    expect(html).toContain('data-project="dsh-notice-webhook"')
    // 缺键的那条（本条）不渲染标注：摘要区间里不得出现 src 分片
    const head = html.slice(0, html.indexOf('data-req="REQ-261006000011-1111"'))
    expect(head).not.toContain('dsh-pm-archived-src')
  })

  it('⑤ 三态下既有 data-action / data-req / data-status / 计数逐字保留（U-8）', () => {
    const origins: RequirementOrigin[] = [
      { kind: 'local' },
      { kind: 'elsewhere', projectName: 'dsh-notice-webhook' },
      { kind: 'unknown' },
    ]
    for (const origin of origins) {
      const html = chipHtml({ [CID]: origin })
      expect(html).toContain('data-action="open-req" data-req="' + CID + '" data-status="archived"')
      expect(html).toContain('data-req="' + CID + '"')
      expect(html).toContain('data-status="archived"')
      expect(html).toContain('<span class="dsh-pm-archived-count">0/0</span>')
      expect(html).toContain('<span class="dsh-pm-archived-text">' + CTITLE + '</span>')
      // 折叠态不因标注而展开（既有语义）
      expect(/<details[^>]*>/.exec(html)?.[0] ?? '').not.toMatch(/\sopen(\s|=|>)/)
    }
  })

  it('⑤ 附带：客户端不比较路径字符串派生 kind（D-4）——root 只在同 kind 下原样透传，不参与判定', () => {
    // 同一个 root 值，kind 由入参决定（若客户端自己比路径，两条产物会一致）
    const asLocal = chipHtml({ [CID]: { kind: 'local', root: '/w/other/dsh-notice-webhook' } })
    const asElsewhere = chipHtml({ [CID]: { kind: 'elsewhere', projectName: 'dsh-notice-webhook', root: '/w/other/dsh-notice-webhook' } })
    expect(asLocal).toContain('data-src="local"')
    expect(asElsewhere).toContain('data-src="elsewhere"')
    expect(asLocal).not.toBe(asElsewhere)
    // 源码静态断言：board.ts 里没有 startsWith / 路径字面量相等形态
    const code = stripComments(readFileSync(new URL('../src/client/views/board.ts', import.meta.url), 'utf8'))
    expect(offendersOf(code), '客户端出现了路径字符串判定（kind 只许从 origins 读）').toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 判据 ⑥：详情「在别处 / 归属未知」提示块 + 缺省逐字节降级（U-9…U-12）
// ---------------------------------------------------------------------------

/** 详情渲染用的最小需求记录（客户端投影口径：标题进产物，便于认读）。 */
const DETAIL_REQ: ClientRequirementRecord = { ...rec(CID), title: '详情提示块' } as unknown as ClientRequirementRecord

const ORIGIN_ELSEWHERE: RequirementOrigin = {
  kind: 'elsewhere',
  projectId: 'p-other',
  projectName: 'dsh-notice-webhook',
  by: 'project-id',
  root: '/w/other/dsh-notice-webhook',
}

/** 最小报告摘要（口径照 tests/report-tabs.test.ts 的标本，只填壳读到的字段）。 */
function makeReport(id: string = CID): ReportResponse {
  return {
    head: {
      id,
      title: '详情提示块',
      category: 'feature',
      promptDifficulty: 'standard',
      status: 'archived',
      blocked: false,
      createdAt: T1 - 86_400_000,
      updatedAt: T1,
      seats: [{ windowKey: 'session-owner-1', role: 'owner', joinedAt: T1 - 86_400_000 }],
      sessionJump: [{ windowKey: 'session-owner-1', archived: false }],
    },
    progress: {
      stageEnteredAt: T1 - 60_000,
      stageStayedMs: 60_000,
      sinceUpdateMs: 1_000,
      tasks: { total: 1, done: 1, running: 0, todo: 0, subChainDone: 0, subChainTotal: 0 },
    },
    verdictLine: '已归档',
    waitingHuman: 0,
    gaps: [],
    actions: [],
  }
}

describe('判据⑥：详情来源提示块（U-9 / U-10 / U-11）', () => {
  it('U-11 A 态 / 缺省 → 提示块是不占位的空串', () => {
    expect(renderArchivedSourceHint(CID)).toBe('')
    expect(renderArchivedSourceHint(CID, { kind: 'local', root: '/w/host' })).toBe('')
  })

  it('U-9 elsewhere → 提示块出现：项目名 / 判据 / 服务端下发的需求根 / 不越界声明', () => {
    const hint = renderArchivedSourceHint(CID, ORIGIN_ELSEWHERE)
    expect(hint).toContain('data-archived-source-hint')
    expect(hint).toContain('data-src="elsewhere"')
    expect(hint).toContain('data-req="' + CID + '"')
    expect(hint).toContain('<b>在别处</b>')
    expect(hint).toContain('dsh-notice-webhook')
    expect(hint).toContain('/w/other/dsh-notice-webhook')      // root 有就显示（K-3）
    expect(hint).toContain('project-id')
    expect(hint).toContain('不越界读')
    expect(hint).toContain('docs/requirements/' + CID + '/archive.md')
    // 零新增选择器：容器复用既有注记块语汇（K-2）
    expect(hint).toContain('class="dsh-pm-cprog-panel-note"')
    expect(hint).toContain('</div>')
    expect(renderArchivedSourceHint(CID, { kind: 'elsewhere', projectName: 'x' })).not.toContain('需求根')
  })

  it('U-10 unknown → 「归属未知」+ 原因（projectId / workspaceRoot）+ 不越界声明（D-6）', () => {
    const hint = renderArchivedSourceHint(CID, { kind: 'unknown', by: 'unknown' })
    expect(hint).toContain('data-archived-source-hint')
    expect(hint).toContain('data-src="unknown"')
    expect(hint).toContain('<b>归属未知</b>')
    expect(hint).toContain('projectId')
    expect(hint).toContain('workspaceRoot')
    expect(hint).toContain('不越界读')
    expect(hint).toContain('class="dsh-pm-cprog-panel-note"')
  })

  it('U-9/U-10 接线：buildReqDetail 只在 B/C 态插块，A 态不插（FR-7 流程 2）', () => {
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined, ORIGIN_ELSEWHERE))
      .toContain(renderArchivedSourceHint(CID, ORIGIN_ELSEWHERE))
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined, { kind: 'unknown' }))
      .toContain('<b>归属未知</b>')
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined, { kind: 'local' }))
      .not.toContain('data-archived-source-hint')
    // 值域外（第 4 值）按 C 态渲染（S-7：不静默放行、更不冒充本仓）
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined, { kind: 'orbit' } as unknown as RequirementOrigin))
      .toContain('<b>归属未知</b>')
  })
})

describe('判据⑥：缺省路径逐字节降级（U-12）', () => {
  it('U-12 stage-detail：不传新参 == 传 undefined == 传 local，且提示块是**唯一**差异', () => {
    const base = buildReqDetail(DETAIL_REQ, [], T1)
    expect(base).not.toContain('data-archived-source-hint')
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined)).toBe(base)
    expect(buildReqDetail(DETAIL_REQ, [], T1, undefined, { kind: 'local' })).toBe(base)

    const hint = renderArchivedSourceHint(CID, ORIGIN_ELSEWHERE)
    expect(hint.length).toBeGreaterThan(0)
    const withHint = buildReqDetail(DETAIL_REQ, [], T1, undefined, ORIGIN_ELSEWHERE)
    // 抽掉提示块后与缺省产物**逐字节**相同（拼接处不引入任何其它字符）
    expect(withHint.replace(hint, '')).toBe(base)
    // 位置：紧跟头部段的收尾 </div>，且在操作条之前（头部之后 = 与新旧两条详情路径同位）
    expect(withHint).toContain('</div>' + hint + '\n      <div class="dsh-pm-action-bar"')
    expect(withHint.indexOf(hint)).toBeLessThan(withHint.indexOf('dsh-pm-action-bar'))
  })

  it('U-12 report-tabs：不传 opts.origin / 传 local == 缺省，提示块是唯一差异且落在 head 段内', () => {
    const report = makeReport()
    const base = buildReportShell(report, 'trunk')
    expect(base).not.toContain('data-archived-source-hint')
    expect(buildReportShell(report, 'trunk', {})).toBe(base)
    expect(buildReportShell(report, 'trunk', { origin: { kind: 'local', root: '/w/host' } })).toBe(base)

    const hint = renderArchivedSourceHint(report.head.id, ORIGIN_ELSEWHERE)
    const withHint = buildReportShell(report, 'trunk', { origin: ORIGIN_ELSEWHERE })
    expect(withHint.replace(hint, '')).toBe(base)
    expect(withHint).toContain('<b>在别处</b>')
    // 位置：head 段内（头部之后、状态带之前）
    expect(withHint.indexOf(hint)).toBeGreaterThan(withHint.indexOf('data-report-seg="head"'))
    expect(withHint.indexOf(hint)).toBeLessThan(withHint.indexOf('data-report-seg="band"'))
  })
})
