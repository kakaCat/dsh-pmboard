/**
 * 验收 Tab 查询（REQ-261006130057-7a43 · t-a85893 · design/interfaces.md §VerifyPanelResponse）。
 *
 * 六段装配（全部可选，缺省 = 无该来源，禁 0 冒充）：
 *  ① `sheet` / ② `history`：整份照抄 `req.verification.sheet` / `sheetHistory`
 *     （与 docs 面板的 `verificationOf` 同源——不重排字段，多一处重排就是多一处漂移点）；
 *  ③ `tracking`：`readRTM` 读 `rtm-accepting.yml` 的 `acceptance_tracking`
 *     （形状复用 vendor 的 `AcceptanceTracking`，不另造）；
 *  ④ `coverage`：复用 `stage-overview/assembler` 的 `assembleTraceability()` 推导每 FR 三态布尔
 *     （design=fr∈fr_to_design、tasks=fr∈fr_to_tasks、tests=fr∈fr_to_tests）；
 *  ⑤ `materials`：`req.verification` 的提交材料（summary + evidence）；
 *  ⑥ `pendingCount`：sheet 逐项 status 为 `pending` + `unverified` 的计数
 *     （与 `tabCounts.verify` / `outcome.pendingItems` 同口径——单点 `pendingCountOf`）。
 *
 * 两源对齐：sheet 逐项与 tracking 的对齐键是 `rtmTraceIdOf(source)`
 * （domain/workflow/AcceptanceSheetSpec.ts 既有单点函数）——本端点只把两源**原样**给出，
 * 归组 join 在前端做；判据一致性由 tests/query-verify.test.ts 的 T-20 钉住
 * （每个 sheet 项的 `rtmTraceIdOf(source)` 都能对上 tracking 的 `fr_id`）。
 *
 * **降级纪律（FR-9，RTM 是增强层）**：rtm-*.yml 缺失 / YAML 解析失败 / 工作区根不可得，
 * `tracking` 与 `coverage` 一律**缺省**——绝不抛、绝不把端点打成 500。台账读不到才降级
 * （`ledger-unreadable`），需求不存在抛 `code='not_found'`（路由层转 404，与 queryDocs 同款）。
 *
 * @module dsh-pmboard/application/query/QueryVerify
 */
import { fmt } from '../../domain/text/fmt.js'
import type {
  Degrade,
  RequirementRecord,
  VerificationSheet,
  VerifyPanelResponse,
} from '../../shared/protocol.js'
import type { AcceptanceTracking } from '../../../vendor/reqboard/src/types/rtm.js'
import { getRTMPath, readRTM, requirementsDir } from '../../../vendor/reqboard/src/rtm/file-io.js'
import { assembleTraceability } from '../../stage-overview/assembler.js'
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
 * `assembleTraceability` 自身已是"失败返回空投影"（FR-9），这里只在**有映射数据**时才产出
 * coverage——空投影 = 无 RTM 数据 = 缺省（覆盖链列整体不渲染），不产出一页全 false 的假覆盖。
 */
function coverageOf(root: string, reqId: string): VerifyPanelResponse['coverage'] | undefined {
  const t = assembleTraceability(root, reqId).traceability
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

  // ② RTM 增强层（FR-9）：根不可得 / 文件缺失 / 解析失败 → tracking/coverage 缺省，**绝不抛**。
  let tracking: AcceptanceTracking[] | undefined
  let coverage: VerifyPanelResponse['coverage'] | undefined
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
      coverage = coverageOf(root, req.id)
    } catch (err) {
      // assembleTraceability 已自带降级；这里再兜一层——增强层任何异常都不得打断端点
      console.warn('[QueryVerify] 追溯装配异常：coverage 缺省（增强层降级）', req.id, err)
    }
  }

  // ③ 六段装配（逐段条件注入：缺哪段缺哪段，不写空壳冒充）。
  const pendingCount = pendingCountOf(sheet)
  const response: VerifyPanelResponse = {
    ...(sheet !== undefined ? { sheet } : {}),
    ...(history !== undefined && history.length > 0 ? { history: [...history] } : {}),
    ...(tracking !== undefined ? { tracking } : {}),
    ...(coverage !== undefined ? { coverage } : {}),
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
