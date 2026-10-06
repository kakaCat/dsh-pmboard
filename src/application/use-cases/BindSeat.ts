/**
 * BindSeat 用例（REQ-261003215944-9e04 FR-2/FR-3）——**给一条需求加/减席位**。
 *
 * ## 它解决什么
 *
 * 改造前「一条需求 = 一个独占窗口」：另一个窗口想帮忙，只能自己去立一条新需求（工作被劈成两半）。
 * 有了席位，owner 可以把同一个需求的 **worker 席位**派给另一个窗口：那个窗口能看见这条需求、
 * 能领卡干活、能汇报，但推不动阶段、也把不了人工门（FR-3 的角色矩阵，判定在 `canWrite`）。
 *
 * ## 与 `seatsOf` 的关系（**读端折算 + 写端物化**）
 *
 * 存量记录没有 `seats`，读端 `seatsOf` 把它折算成「单 owner」。本用例第一次派席时会把这份折算
 * **物化**进台账（`seats` 从"缺省"变成"显式两条"）——这是有意的：席位一旦多于一，就没有折算可依据了。
 * owner 那一项**逐字取自折算结果**（`windowKey` = 原 `sourceSessionId`、`joinedAt` = 需求的 `createdAt`），
 * 因此"加席位"不会顺手动到 owner，也不会改写来源窗口。
 *
 * ## 三条边界（都来自 design/data-model.md 的约束表）
 *
 *   1. **owner 唯一且不可解绑**：解绑 owner → `REQBOARD_INVALID_INPUT`（换绑走另一条路）。
 *   2. **上限** `seats.length ≤ seats.max`（缺省 8，配置在组合根读）→ 超了 `REQBOARD_SEAT_LIMIT`。
 *   3. **不得写出空席位表**：这是 t-dd3067 复核时登记的边界——`seatsOf` 刻意不伪造 owner，
 *      一条记录的 `seats` 若成了 `[]`，它对**所有人**都不可见也不可写（包括 owner 自己）。
 *      故本用例：折算结果里没有 owner 时直接拒绝派席，且解绑永远不会带走 owner。
 *
 * @module dsh-pmboard/application/use-cases/BindSeat
 */
import type { UseCaseDeps } from '../ports.js'
import type { ActorRef, CommentRecord, WindowSeat } from '../../shared/protocol.js'
import { normalizeText } from '../../shared/protocol.js'
import { canWrite, firstWritableBound, seatOfSummary, seatsOf } from '../internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { requireSameProject, type SameProjectGuard } from '../internal/support.js'
import { requirementStoreOf, mutateIfPresent } from './queue-access.js'

/** 本工具能派的两种角色（owner 由立项/换绑产生，不经本工具）。 */
export type BindableRole = 'worker' | 'observer'

export interface BindSeatArgs {
  requirementId?: string
  windowKey?: string
  role?: unknown
  remove?: unknown
}

export interface BindSeatResult {
  success: true
  requirement_id: string
  /** 被派席/解绑的那个窗口 */
  window_key: string
  role: BindableRole
  removed: boolean
  /** false = 幂等（该窗口本来就是这个角色 / 本来就没有这个席位） */
  changed: boolean
  /** 变更后的**完整**席位表（与台账逐字一致） */
  seats: WindowSeat[]
  /**
   * 本次派席用的**判据来源**（REQ-261005141830-7a3b t6 · FR-9）：`project-id` = 两侧项目身份相等；
   * `path-fallback` = 任一侧缺身份、走路径口径（此时要如实标注「未归属」，不静默放行）。
   * `remove=true`（解绑，只做减法）不校验项目，故不返回本键。
   */
  project_source?: 'project-id' | 'path-fallback'
  /** 需求侧项目身份（有则给；未归属则缺省——缺失 ≠ 已确认未归属）。 */
  project_id?: string
}

/** 缺省上限，与 `plugin-config.seatsMaxSetting` 的缺省一致（组合根会传真值）。 */
const DEFAULT_SEATS_MAX = 8

function reject(msg: string, code: string): never {
  throw Object.assign(new Error(msg), { code })
}

/** 角色白名单（**不走 Config 枚举**：这是台账字段的契约，不是插件配置）。 */
function asBindableRole(raw: unknown): BindableRole {
  if (raw === 'worker' || raw === 'observer') return raw
  return reject(
    `reqboard_bind 未执行：role 只能是 worker 或 observer（实际 ${JSON.stringify(raw)}）——owner 由立项产生，不经本工具`,
    'REQBOARD_INVALID_INPUT',
  )
}

/**
 * 加/减一个席位。**只有 owner 席位可调用**（FR-3：派席＝对这条需求做主）。
 *
 * @param seatsMax 席位上限（组合根从 `seatsMaxSetting(config)` 取；缺省 8）
 */
export async function bindSeat(
  deps: UseCaseDeps,
  windowKey: string,
  args: BindSeatArgs,
  seatsMax: number = DEFAULT_SEATS_MAX,
): Promise<BindSeatResult> {
  const role = asBindableRole(args.role)
  const remove = args.remove === true
  // 席位窗口缺省 = 本窗口；显式给了就用它（把别的窗口请进来，是 FR-1 开窗之后的第二步）
  const explicitSeat = normalizeText(args.windowKey, 'windowKey', 64)
  const seatWindow = explicitSeat.length > 0 ? explicitSeat : windowKey
  if (seatWindow.length === 0) {
    return reject('reqboard_bind 未执行：无法确定席位窗口（本窗口标识为空，且未传 windowKey）', 'REQBOARD_INVALID_INPUT')
  }

  const store = requirementStoreOf(deps)
  const bound = await boundSummariesOf(store, windowKey)
  if (bound.length === 0) {
    return reject('reqboard_bind 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  }

  // 目标需求：显式给就必须是**本窗口能看见的**那条（跨需求派席一律拒，避免"凭空给别人派席"）。
  // 缺省取"第一条我确实坐着的"——`boundSummariesOf` 保证列表里每条都有我的席位，故这里用
  // `read` 动作表达"取第一条"（read 对任何角色都成立），**不写位置索引**：
  // 「第一条就是我的」正是 FR-3 要清掉的那个隐含假设，角色对不对由下面那句 canWrite 判。
  const explicitId = normalizeText(args.requirementId, 'requirementId', 64)
  const target = explicitId.length > 0
    ? bound.find(r => r.id === explicitId)
    : firstWritableBound(bound, windowKey, 'read')
  if (target === undefined) {
    return reject(
      `reqboard_bind 未执行：需求 ${explicitId.length > 0 ? explicitId : '(本窗口绑定需求)'} 不是本窗口绑定的进行中需求`,
      'REQBOARD_NOT_BOUND_TO_WINDOW',
    )
  }
  // 只有 owner 可派席：`move-requirement` 与 `confirm-gate` 同为 owner-only 动作，
  // 这里借它表达「你对这条需求做得了主」（不新开枚举值——动作表是设计的封闭集合）。
  const callerSeat = seatOfSummary(target, windowKey)
  const allowed = canWrite(callerSeat, 'move-requirement')
  if (!allowed.ok) {
    return reject(
      `reqboard_bind 未执行：本窗口在该需求上的席位不允许派席（${allowed.code}）——只有 owner 席位能加/减席位`,
      allowed.code,
    )
  }
  const targetId = target.id

  // REQ-261005141830-7a3b t6（FR-11）：**跨项目不得派席**——目标窗口必须与需求同项目，
  // 否则那个窗口随后就能替本项目写盘（多窗口不同项目串的一条合法入口）。
  // 判定发生在**任何写入之前** ⇒ 被拒时台账零改动；`remove=true`（只做减法）刻意不校验。
  const guard: SameProjectGuard | undefined = remove
    ? undefined
    : requireSameProject(deps, target, seatWindow, '派席')
  // 未归属（缺身份且无路径可比）→ 不静默放行：变更评论里如实标注判据（FR-9）。
  const unattributedNote = guard !== undefined && !guard.attributed ? '（判据：路径兜底，目标窗口未归属）' : ''

  // mutate 回调是同步契约：返回体需要的值在回调里捕获（`mutateIfPresent` 不回传变更器的自定义值）
  let nextSeats: WindowSeat[] | undefined
  let changed = false

  const result = await mutateIfPresent(store, targetId, (req) => {
    // 折算（无 seats 的存量 → 单 owner）后立即物化：下面所有分支都基于**同一份**席位表
    const current: WindowSeat[] = seatsOf(req).map((s) => ({ ...s }))
    const idx = current.findIndex((s) => s.windowKey === seatWindow)

    if (remove) {
      if (idx < 0) {
        // 幂等：本来就没有这个席位 → 不落盘、不报错（重复解绑不该失败）
        nextSeats = current
        changed = false
        return { changed: false }
      }
      if (current[idx]!.role === 'owner') {
        return reject('reqboard_bind 未执行：owner 席位不可解绑（只能换绑）', 'REQBOARD_INVALID_INPUT')
      }
      const removed = current.splice(idx, 1)[0]!
      nextSeats = current
      changed = true
      writeBack(req, deps, windowKey, current, `解绑席位：${removed.windowKey}（角色 ${removed.role}）` + unattributedNote)
      return { changed: true }
    }

    if (current.length === 0 || !current.some((s) => s.role === 'owner')) {
      // 不得写出无人拥有（或空）的席位表：那会让这条需求对所有人不可见也不可写（t-dd3067 复核④）
      return reject(
        `reqboard_bind 未执行：需求 ${targetId} 没有 owner 席位（既无 seats 也无 sourceSessionId），派席会让它无人拥有`,
        'REQBOARD_INVALID_INPUT',
      )
    }

    if (idx >= 0) {
      const existing = current[idx]!
      if (existing.role === 'owner') {
        // **owner 自降必须拒**（复核发现的洞）：席位是权威，一旦 owner 被改成 worker，
        // sourceSessionId 的折算就不再生效 ⇒ 这条需求**一个 owner 都不剩**：
        // 推阶段、把关人工门、派席全都做不了，等于把自己锁死在原地。
        // 与"解绑 owner"同一口径：owner 的位子只能换绑，不能经本工具降级。
        return reject(
          `reqboard_bind 未执行：${seatWindow} 是 owner 席位，不能改成 ${role}（owner 只能换绑；否则这条需求会一个 owner 都不剩）`,
          'REQBOARD_INVALID_INPUT',
        )
      }
      if (existing.role === role) {
        // 同窗同角色 → 幂等（不落盘、owner 项一字未动）
        nextSeats = current
        changed = false
        return { changed: false }
      }
      // 同窗换角色 → 就地改（否则"派错了"只能先解绑再派，中间那一刻席位表是错的）
      current[idx] = { ...existing, role }
      nextSeats = current
      changed = true
      writeBack(req, deps, windowKey, current, `席位角色变更：${seatWindow} ${existing.role} → ${role}` + unattributedNote)
      return { changed: true }
    }

    if (current.length >= seatsMax) {
      return reject(
        `reqboard_bind 未执行：席位已达上限 ${seatsMax}（当前 ${current.length} 个：${current.map(s => s.windowKey).join('、')}）（REQBOARD_SEAT_LIMIT）`,
        'REQBOARD_SEAT_LIMIT',
      )
    }

    current.push({
      windowKey: seatWindow,
      role,
      joinedAt: deps.clock.now(),
    })
    nextSeats = current
    changed = true
    writeBack(req, deps, windowKey, current, `新增席位：${seatWindow}（角色 ${role}）` + unattributedNote)
    return { changed: true }
  })

  if (result === undefined) {
    return reject('reqboard_bind 未执行：需求未找到或数据冲突', 'REQBOARD_MUTATION_FAILED')
  }
  // 写成功但没捕获到席位表 = 契约破了；响亮报出，不返回半份数据
  if (nextSeats === undefined) {
    return reject('reqboard_bind 未执行：变更已提交但未捕获席位表（内部不一致）', 'REQBOARD_MUTATION_FAILED')
  }

  return {
    success: true,
    requirement_id: targetId,
    window_key: seatWindow,
    role,
    removed: remove,
    changed,
    seats: nextSeats,
    // FR-9：判据说出来（解绑不校验项目 ⇒ 不返回本组键，缺失 ≠ 判据为空）。
    ...(guard === undefined
      ? {}
      : { project_source: guard.by, ...(guard.projectId !== undefined ? { project_id: guard.projectId } : {}) }),
  }
}

/** 写席位表 + 留痕（评论是审计线索：谁在什么时候把谁请进来/请出去）。 */
function writeBack(
  req: { seats?: WindowSeat[]; comments: CommentRecord[]; updatedAt: number; updatedBy: ActorRef },
  deps: UseCaseDeps,
  windowKey: string,
  seats: WindowSeat[],
  why: string,
): void {
  req.seats = seats
  const now = deps.clock.now()
  const actor = { kind: 'agent' as const, sessionId: windowKey }
  req.comments.push({
    id: deps.ids.comment(),
    body: `席位变更（reqboard_bind）：${why}；席位表现有 ${seats.length} 个`,
    createdAt: now,
    createdBy: actor,
  })
  req.updatedAt = now
  req.updatedBy = actor
}
