/**
 * 验收 Tab 查询（REQ-261006130057-7a43 · t-a85893 · design/interfaces.md §VerifyPanelResponse）。
 *
 * 七段装配（全部可选，缺省 = 无该来源，禁 0 冒充）：
 *  ① `sheet` / ② `history`：整份照抄 `req.verification.sheet` / `sheetHistory`
 *     （与 docs 面板的 `verificationOf` 同源——不重排字段，多一处重排就是多一处漂移点）；
 *  ③ `tracking`：`readRTM` 读 `rtm-accepting.yml` 的 `acceptance_tracking`
 *     （形状复用 vendor 的 `AcceptanceTracking`，不另造）；
 *  ④ `coverage`：复用 `stage-overview/assembler` 的 `assembleTraceability()` 推导每 FR 三态布尔
 *     （design=fr∈fr_to_design、tasks=fr∈fr_to_tasks、tests=fr∈fr_to_tests）；
 *  ⑤ `frMap`（D-10 返工）：同一次装配的 `fr_to_design / fr_to_tasks / fr_to_tests` **原样透出**
 *     ——按 FR 成行的 join 归前端做，服务端只搬不 join；
 *  ⑥ `materials`：`req.verification` 的提交材料（summary + evidence）；
 *  ⑦ `pendingCount`：sheet 逐项 status 为 `pending` + `unverified` 的计数
 *     （与 `tabCounts.verify` / `outcome.pendingItems` 同口径——单点 `pendingCountOf`）；
 *  ⑧ `frNames`（D-10 返工）：需求文档里 `- **FR-N: 名称**——…` 的 **FR 号 → 名称**表
 *     （原型 `#tab-verify` 的 FR 列是「编号 + 名称」，名称这一半来自文档；见 `frNamesOf`）。
 *
 * 两源对齐：sheet 逐项与 tracking 的对齐键是 `rtmTraceIdOf(source)`
 * （domain/workflow/AcceptanceSheetSpec.ts 既有单点函数）——本端点只把两源**原样**给出，
 * 归组 join 在前端做；判据一致性由 tests/query-verify.test.ts 的 T-20 钉住
 * （每个 sheet 项的 `rtmTraceIdOf(source)` 都能对上 tracking 的 `fr_id`）。
 *
 * **降级纪律（FR-9，RTM 是增强层）**：rtm-*.yml 缺失 / YAML 解析失败 / 工作区根不可得，
 * `tracking` / `coverage` / `frMap` 一律**缺省**——绝不抛、绝不把端点打成 500。台账读不到才降级
 * （`ledger-unreadable`），需求不存在抛 `code='not_found'`（路由层转 404，与 queryDocs 同款）。
 *
 * **FR 名称（D-10 返工）同一条降级纪律**：`frNames` 读的是需求文档正文，文档读端口未装配 /
 * 候选根都读不到 / 文档里没有 FR 标题行，一律**缺省**（前端退回「只渲染编号」）——
 * 绝不编名称兜底（编出来的名称比没有名称更坏：读者无从分辨）。
 *
 * @module dsh-pmboard/application/query/QueryVerify
 */
import { fmt } from '../../domain/text/fmt.js'
import type {
  Degrade,
  RequirementRecord,
  TraceabilityProjection,
  VerificationSheet,
  VerifyPanelResponse,
} from '../../shared/protocol.js'
import type { AcceptanceTracking } from '../../../vendor/reqboard/src/types/rtm.js'
import { getRTMPath, readRTM, requirementsDir } from '../../../vendor/reqboard/src/rtm/file-io.js'
import { assembleTraceability } from '../../stage-overview/assembler.js'
// 需求文档位置（唯一解析点，2026-10-06）：FR 名称就在这份 requirement.md 里。
// 写死 `docs/requirements/<id>/requirement.md` 会让换过文档位置的需求一个名称都读不到。
import { requirementDocPathOf } from '../../domain/requirement/DocLocation.js'
import type { DocRepository } from '../ports.js'
import type { PanelQueryDeps, PanelQueryInput, QueryVerify } from './contracts.js'

/** 降级信封（与兄弟查询同一拼法）。 */
function degrade(reason: Degrade['reason'], note: string): Degrade {
  return { available: false, reason, note }
}

/** 需求不存在 → 抛 `code='not_found'`（路由层转 404；与 QueryDocs 的 notFound 同口径）。 */
function notFound(id: string): Error {
  return Object.assign(new Error(fmt('需求不存在：{id}', { id })), { code: 'not_found' })
}

/** 异常取文本（进降级 note；不把 Error 对象塞进响应）。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 待裁决项数（`pending` + `unverified`）的**唯一计数点**。
 *
 * 三个消费方必须同值：本响应的 `pendingCount`、首屏 `tabCounts.verify`（QueryReport）、
 * `outcome.pendingItems`（QueryReport 的 outcomeOf 同口径手写，值相等）。无验收单 → `undefined`
 * （缺省，不是 0——「还没验收」与「0 项待裁决」是两句话）。
 */
export function pendingCountOf(sheet: VerificationSheet | undefined): number | undefined {
  if (sheet === undefined) return undefined
  return (sheet.items ?? []).filter(i => i.status === 'pending' || i.status === 'unverified').length
}

/**
 * `acceptance_tracking` 的宽容读取：只留形状像样的行（`acceptance_id` / `fr_id` 都是字符串）。
 * 脏数据（null / 缺键行）**不放大进响应**；全部不像样 → `undefined`（与"没有 RTM"同一缺省）。
 */
function trackingOf(raw: unknown): AcceptanceTracking[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter(
    (r): r is AcceptanceTracking =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as { acceptance_id?: unknown }).acceptance_id === 'string' &&
      typeof (r as { fr_id?: unknown }).fr_id === 'string',
  )
  return rows.length > 0 ? rows : undefined
}

/**
 * 覆盖链推导（design/interfaces.md §VerifyPanelResponse）：FR 并集 → 每 FR 三态布尔。
 * 输入是**已装配好的**追溯投影（一次读盘，与 `frMapOf` 同源同一次装配）。
 * 空投影 = 无 RTM 数据 = 缺省（覆盖链列整体不渲染），不产出一页全 false 的假覆盖。
 */
function coverageOf(t: TraceabilityProjection | undefined): VerifyPanelResponse['coverage'] | undefined {
  if (t === undefined) return undefined
  const frDesign = t.fr_to_design ?? {}
  const frTasks = t.fr_to_tasks ?? {}
  const frTests = t.fr_to_tests ?? {}
  const frs = [...new Set([...Object.keys(frDesign), ...Object.keys(frTasks), ...Object.keys(frTests)])].sort()
  if (frs.length === 0) return undefined
  const coverage: NonNullable<VerifyPanelResponse['coverage']> = {}
  for (const fr of frs) {
    coverage[fr] = {
      design: Object.hasOwn(frDesign, fr),
      tasks: Object.hasOwn(frTasks, fr),
      tests: Object.hasOwn(frTests, fr),
    }
  }
  return coverage
}

/**
 * 追溯三映射原样透出（D-10 返工 / design/interfaces.md §VerifyPanelResponse `frMap`）。
 *
 * **只搬不 join**：客户端要按「每 FR 一行」成行（行键 = FR 号），但"哪条逐项属于哪个 FR"
 * 的 join 放在渲染层做——服务端多一次 join 就是多一个会漂移的判据点。这里逐键照抄，
 * 三张映射一张都没有 → 缺省（与 coverage 同一次降级，前端退回逐项平铺）。
 */
function frMapOf(t: TraceabilityProjection | undefined): VerifyPanelResponse['frMap'] | undefined {
  if (t === undefined) return undefined
  const map: NonNullable<VerifyPanelResponse['frMap']> = {
    ...(t.fr_to_design !== undefined ? { fr_to_design: t.fr_to_design } : {}),
    ...(t.fr_to_tasks !== undefined ? { fr_to_tasks: t.fr_to_tasks } : {}),
    ...(t.fr_to_tests !== undefined ? { fr_to_tests: t.fr_to_tests } : {}),
  }
  return Object.keys(map).length > 0 ? map : undefined
}

/**
 * 需求文档里 FR 标题行的形状：`- **FR-1: 头部信息分层与操作区聚类**——标识行…`。
 *
 * 逐段说明（都是"为什么这么写"）：
 *  - 行首的列表符 `- `/`* ` **可选**（需求文档现在是列表项，将来改成粗体段也不该读不到）；
 *  - `FR-<数>` 与冒号之间允许空白，半角/全角冒号都认（人写文档，两种都在现实里出现）；
 *  - 名称 = 冒号后到**第一个 `**`** 之间的内容（`[^*]` 保证不越过粗体收尾符）；
 *    `——` 之后是**说明**不是名称，由 `parseFrNames` 再截一刀。
 */
const FR_NAME_RE = /^[ \t]*(?:[-*][ \t]+)?\*\*[ \t]*(FR-\d+)[ \t]*[:：][ \t]*([^*]+?)[ \t]*\*\*/gm

/**
 * 需求文档正文 → **FR 号 → 名称**表（纯函数，`frNamesOf` 的解析半边，单测直接打它）。
 *
 * 规则只有三条：
 *  ① 只认 `- **FR-N: 名称**` 这种标题行（认不出的行一律不当名称——正则外的一律不算）；
 *  ② 名称剥掉尾部 `——…` 说明与两侧空白；**剥完是空串就不收**（空名称等于没名称，不收比收空串诚实）；
 *  ③ 同一个 FR 出现多次 → **首次为准**（后来的重复标题不改写前面那条，读侧不因文档重复而漂）。
 *
 * 一条都解析不出 → `undefined`（**不是空对象**：调用方据此整体缺省该键，见 `VerifyPanelResponse.frNames`）。
 */
export function parseFrNames(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(FR_NAME_RE)) {
    const fr = m[1]!
    if (Object.hasOwn(out, fr)) continue
    const raw = m[2]!.trim()
    const cut = raw.indexOf('——')
    const name = (cut >= 0 ? raw.slice(0, cut) : raw).trim()
    if (name.length === 0) continue
    out[fr] = name
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 本次请求的**候选文档读端**（按序）：候选根各一份（`docRootsOf` + `docsAt`，两口齐备时），
 * 末尾再缀上 `deps.docs`（旧单根接线 / 会话根那一份）。
 *
 * 为什么逐个试而不是只认一个：需求声明根排第一（跨工作区查看时 requirement.md 在需求自己的根下），
 * 会话根只说明"谁在看"——只用会话根会让换过工作区的需求一个名称都读不到（与 QueryDocs 的
 * 候选根同一条理由）；缀上 `deps.docs` 是防"候选根表为空"时把一份**能读**的端口白扔掉
 * （读不到自然降级，读到就是真名称，不编）。
 */
function docReposOf(deps: PanelQueryDeps, req: RequirementRecord): DocRepository[] {
  const repos: DocRepository[] = []
  if (deps.docRootsOf !== undefined && deps.docsAt !== undefined) {
    let roots: readonly string[] = []
    try {
      const raw: unknown = deps.docRootsOf(req)
      if (Array.isArray(raw)) roots = raw as string[]
    } catch {
      roots = [] // 根探测本身出问题 → 退回 deps.docs 那条路（不把端点打成 500）
    }
    for (const root of roots) {
      if (typeof root !== 'string' || root.length === 0) continue
      repos.push(deps.docsAt(root))
    }
  }
  if (deps.docs !== undefined) repos.push(deps.docs)
  return repos
}

/**
 * 读需求文档 → FR 名称表（D-10 返工；design/interfaces.md §VerifyPanelResponse `frNames`）。
 *
 * **降级纪律（与 RTM 增强层同款，绝不抛）**：文档读端口未装配 / 候选根逐个都读不到 /
 * 文档里没有 FR 标题行 —— 四件事在这里是**同一个结果**：`undefined`（前端只渲染编号）。
 * 绝不编名称：名称错一个字，读者比"没有名称"更难发现自己在读假数据。
 *
 * 读失败单独 warn 留痕（这不是"文档里没有名称"，而是"读不动"，排查时能分辨）。
 */
export async function frNamesOf(
  deps: PanelQueryDeps,
  req: RequirementRecord,
): Promise<VerifyPanelResponse['frNames']> {
  try {
    const path = requirementDocPathOf(req)
    if (path.length === 0) return undefined
    for (const docs of docReposOf(deps, req)) {
      try {
        const names = parseFrNames(await docs.read(path))
        if (names !== undefined) return names
      } catch (err) {
        console.warn('[QueryVerify] requirement.md 读取失败：换下一个候选根（FR 名称缺省不编）', path, err)
      }
    }
    return undefined
  } catch (err) {
    // requirementDocPathOf 对脏台账（docBasePath 不是字符串等）可能抛：整段兜住，端点不受影响
    console.warn('[QueryVerify] FR 名称解析异常：frNames 缺省（D-10 返工）', req.id, err)
    return undefined
  }
}

/**
 * `GET /requirements/:id/verify`：验收单 + RTM 验收追踪 + 覆盖链 + 提交材料 + 待裁决计数。
 *
 * 只 await 注入端口（`store`）；RTM 读盘复用 vendor/host 既有装配器（与 QueryStageDetail 同一路径，
 * application 层不 import node:——IO 都在那两个既有模块里）。
 */
export const queryVerify: QueryVerify = async (deps: PanelQueryDeps, input: PanelQueryInput) => {
  // ① 台账（sheet / history / materials / pendingCount 的唯一来源）。
  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    return degrade('ledger-unreadable', fmt('读不到台账：{msg}', { msg: errText(err) }))
  }
  if (req === undefined) throw notFound(input.requirementId)

  const verification = req.verification
  const sheet = verification?.sheet
  const history = verification?.sheetHistory

  // ② RTM 增强层（FR-9）：根不可得 / 文件缺失 / 解析失败 → tracking/coverage/frMap 缺省，**绝不抛**。
  let tracking: AcceptanceTracking[] | undefined
  let coverage: VerifyPanelResponse['coverage'] | undefined
  let frMap: VerifyPanelResponse['frMap'] | undefined
  // 取根候选序：需求声明根排第一（多项目跨窗口查看时 rtm-*.yml 在需求自己的根下；
  // 只用会话根会静默缺 RTM 列——复核 P1-1），会话根兜底。
  const root = (typeof req.workspaceRoot === 'string' && req.workspaceRoot.length > 0)
    ? req.workspaceRoot
    : deps.workspaceRoot
  if (typeof root === 'string' && root.length > 0) {
    try {
      // readRTM 自身"失败返回 null"；try 兜的是requirementsDir/getRTMPath 的异常路径（双保险）
      const accepting = readRTM<{ acceptance_tracking?: unknown }>(
        getRTMPath(requirementsDir(root, req.id), 'rtm-accepting.yml'),
      )
      tracking = trackingOf(accepting?.acceptance_tracking)
    } catch (err) {
      console.warn('[QueryVerify] rtm-accepting.yml 读取异常：tracking 缺省（增强层降级）', req.id, err)
    }
    try {
      // 追溯投影只装配一次：coverage 与 frMap 是同一次读盘的两个视图（两段分别读会把
      // "同一次装配"变成两次，留下两处不一致的可能）。
      const trace = assembleTraceability(root, req.id).traceability
      coverage = coverageOf(trace)
      frMap = frMapOf(trace)
    } catch (err) {
      // assembleTraceability 已自带降级；这里再兜一层——增强层任何异常都不得打断端点
      console.warn('[QueryVerify] 追溯装配异常：coverage/frMap 缺省（增强层降级）', req.id, err)
    }
  }

  // ③ 七段装配（逐段条件注入：缺哪段缺哪段，不写空壳冒充）。
  //    FR 名称（D-10 返工）单独一支：读需求文档正文抽 `- **FR-N: 名称**`，读不到即缺省
  //    （`frNamesOf` 自己绝不抛——这里不包 try，免得把"绝不抛"变成两处各兜一半）。
  const frNames = await frNamesOf(deps, req)
  const pendingCount = pendingCountOf(sheet)
  const response: VerifyPanelResponse = {
    ...(sheet !== undefined ? { sheet } : {}),
    ...(history !== undefined && history.length > 0 ? { history: [...history] } : {}),
    ...(tracking !== undefined ? { tracking } : {}),
    ...(coverage !== undefined ? { coverage } : {}),
    ...(frMap !== undefined ? { frMap } : {}),
    ...(frNames !== undefined ? { frNames } : {}),
    ...(verification !== undefined
      ? {
        materials: {
          // 坏台账防护（复核 P2-3）：summary 类型上必填，但手写/损坏 JSON 可能缺——
          // RTM 支路防得密，台账支路不能裸奔（TypeError 穿出 = 500）。
          ...(typeof verification.summary === 'string' && verification.summary.trim().length > 0
            ? { summary: verification.summary }
            : {}),
          evidence: [...(Array.isArray(verification.evidence) ? verification.evidence : [])],
        },
      }
      : {}),
    ...(pendingCount !== undefined ? { pendingCount } : {}),
  }
  return response
}
