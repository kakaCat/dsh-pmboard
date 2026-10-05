/**
 * 绑定改写留痕助手（REQ-261003222428-3556 FR-6 / N-2）——`sourceSessionId` 的**唯一改写入口**。
 *
 * 缺口（《自动链契约》§5 N-2，2026-10-02 实测）：需求的窗口绑定曾被改写而全仓 src
 * 无任何写入点（改写来自仓外脚本直写存储层），且台账**没有任何留痕**——
 * 谁在什么时候把绑定从哪个窗口改到哪个窗口，完全不可追溯。
 *
 * 纪律：自本模块起，需求绑定的新写/改写**必须**走 applyRebind（在 store.mutate 内调用）——
 * 每次变更留一条人读得懂的评论（actor/at/from/to）。仓外直写存储层仍防不住
 * （那不是代码能守的边界），但**仓内**任何新写入点都会被静态断言拦下
 * （tests/binding-trace.test.ts 扫 `.sourceSessionId =` 直接赋值，仅本文件豁免）。
 *
 * REQ-261004150249-731e FR-2 起本模块还有第二个入口 **handoffOwner**（交接：席位升降 + 绑定同步
 * + 留痕，一次写全）——它与 applyRebind 共用"豁免直写 sourceSessionId"的理由：
 * 两处都必须留痕，豁免范围**不再扩大**（新文件不允许出现直写，见 binding-trace 的静态断言）。
 *
 * 同一起（t-46d0d7）：**applyRebind 改为委托 handoffOwner**——改绑与交接本就是同一次写，
 * 一个只改绑定的入口会让两个权威（seats / sourceSessionId）各说各话，故入口保留、实现归一。
 *
 * @module dsh-pmboard/application/internal/binding-write
 */
// seatsOf 是本模块唯一的**读端口径**：交接必须先按读端看到的样子取原 owner
// （seats 有值以它为准；缺省则折算 sourceSessionId 的单 owner）——若在这里另写一套
// "seats 有才看 seats"的读法，无 seats 的存量记录就会被判成"没有原窗口"，
// 物化结果就少了 observer 那条（存量记录占多数，这不是边角）。
import { seatsOf } from './window.js'
import type { ActorRef, RequirementRecord, WindowSeat } from '../../shared/protocol.js'

export interface RebindInput {
  /** 目标窗口（改绑到谁）。 */
  toWindow: string
  /** 操作者（看板改绑 = human；创建即绑定 = agent/system 走各自创建路径，不经这里）。 */
  actor: ActorRef
  /** 变更时刻。 */
  at: number
  /** 评论 id 生成器。 */
  commentId: () => string
  /** 改绑原因（可选，人写的注记）。 */
  reason?: string
}

/**
 * 在 mutate 草稿上执行改绑并留痕（看板「改绑到本窗口」入口，human_gate）。
 * 返回 true = 绑定发生变化；false = 无操作（目标窗口已是 owner，不刷评论、不推高 revision）。
 *
 * REQ-261004150249-731e FR-2（t-46d0d7）：本函数改为**委托 handoffOwner**（同一文件内的写点）。
 * 为什么必须委托（事故出处）：改造前这里只写 `sourceSessionId`、席位一个字节不动——
 * 席位权威（seatOf / canWrite）于是判新窗口「未绑定」，看板回执却报 `rebound:true`，
 * 是**假成功**（design/data-model.md §INV-2：两个权威各说各话）。看板改绑在语义上
 * 就是一次合法接管：新窗口 owner、原窗口 observer（降级保留可见性，不是退席）、
 * `sourceSessionId` 同步、一条留痕——四件事同生同死，半截交接比不交接更难查。
 *
 * 口径：入参与返回语义不变（HTTP 路由与响应形状都不动，见 http/routers/requirements.ts）；
 * 幂等判定沿用 handoffOwner 的单点判据（**原 owner 已是目标窗** → false，不写评论）。
 * 刻意不做的事：不在这里另修 INV-2 的既存违例（席位 owner 已是目标窗而 `sourceSessionId`
 * 指别处）——本函数是「换人」，不是「一致性修复」（理由同 handoffOwner 的注释）。
 *
 * 迁移与回滚（本模块零迁移）：
 * - 存量记录（无 `seats`）**不预写、不迁移**：读端按折算看（`seatsOf`），物化只发生在
 *   第一次接管那一刻，由 handoffOwner 一次写完（`joinedAt` 取 `createdAt`，与折算语义等价）；
 * - 回滚 = 看板把绑定**改绑回原窗口**：原 owner 是现成的（降级后仍是 observer 席位，
 *   没有退席），再交一次即复原，且第二次调用幂等（返回 false、不刷评论）；
 * - **无任何后台自动行为**：改绑只在人点看板按钮时发生一次（组合根也不为此注册定时器/扫描）。
 */
export function applyRebind(req: RequirementRecord, input: RebindInput): boolean {
  return handoffOwner(req, {
    toWindow: input.toWindow,
    actor: input.actor,
    at: input.at,
    commentId: input.commentId,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  })
}

export interface HandoffWriteInput {
  /** 接管窗口（新 owner）。 */
  toWindow: string
  /** 留痕 actor（agent 带 sessionId / human）。 */
  actor: ActorRef
  /** 变更时刻。 */
  at: number
  /** 评论 id 生成器。 */
  commentId: () => string
  /** 交接原因（可选，建议写明水位与阶段）。 */
  reason?: string
}

/**
 * 交接写（REQ-261004150249-731e FR-2）：**一次 mutate 内**完成
 * ① 新窗口入席 owner ② 原 owner 降 observer（不是退席）③ `sourceSessionId` 同步
 * ④ 追一条留痕评论。返回 true = 确有变更；false = 幂等/无效输入，草稿一个字节都不动。
 *
 * 为什么要原子（事故出处）：改造前看板改绑只写 `sourceSessionId`、不动 `seats`
 * （design/data-model.md §INV-2）——席位权威说 A、会话标题栏流程图锚点说 B，
 * 于是"能推进但流程图不显示"或反之，回执却报 `rebound:true` 的假成功。
 * 三处（seats / sourceSessionId / 评论）必须同生同死：半截交接比不交接更难查。
 *
 * 三条不变量在这里落成：
 * - INV-1 不得产出空 owner：`seats` 缺省时**物化**成显式两条（owner=to、observer=from），
 *   物化后与折算语义等价（joinedAt 取 createdAt），所以任何读侧口径都不会看到"零 owner"；
 * - INV-2 `seats` 里的 owner 与 `sourceSessionId` 同指一窗：两者在下面同一段里赋值；
 * - INV-3 owner 恰好一个：其余 `role='owner'` 的席位一律降 observer（不止 from 那一个）。
 *
 * 刻意不做的事：**不抛异常**（判定保持中立，调用方按自己的错误码体系上报，同 canWrite）；
 * 也**不修 INV-2 的既存违例**（`from === to` 但 `sourceSessionId` 指别处）——
 * 本函数的语义是"换人"，不是"一致性修复"；给同窗交接编一条 `A → A` 的角色变化评论是假留痕。
 *
 * 席位表里原本没有 owner 的畸形记录（零 owner，见 tests/handoff-owner.test.ts 用例⑤）：
 * 选择**修好**而不是拒绝——此时 `to` 就是写入后唯一的 owner，INV-1 成立；
 * 拒绝等于把这条记录永久钉死在"对所有人不可见也不可写"（architecture.md §不变量的违反症状）。
 */
export function handoffOwner(req: RequirementRecord, input: HandoffWriteInput): boolean {
  const to = input.toWindow
  // 空目标 = 把 owner 交到"没有窗口"上，那正是 INV-1 的空 owner 形态；按幂等返回 false（不抛）。
  if (to.length === 0) return false
  const seats = seatsOf(req)
  // 原 owner = 读端口径看到的 owner（显式 seats 权威；缺省即 sourceSessionId 折算的那一个）。
  const from = seats.find((s) => s.role === 'owner')?.windowKey
  // 幂等：原 owner 已经是目标窗（含无 seats 时折算的单 owner 就是它）→ 不刷评论、不动 updatedAt。
  if (from === to) return false

  // ---- 以下全部是先构造、后赋值：任何一步不过关都不会留下半个交接 ----
  const existing = seats.find((s) => s.windowKey === to)
  const next: WindowSeat[] = []
  const seen = new Set<string>()
  const push = (seat: WindowSeat): void => {
    // 去重按 windowKey：畸形表里同一个窗口坐两席时，去重比"写进去两个 owner"更安全（INV-3）。
    if (seen.has(seat.windowKey)) return
    seen.add(seat.windowKey)
    next.push(seat)
  }
  // ① 新 owner 入席放在首位（物化形态的规范顺序）：它若原本已有席位（worker/observer），
  //    沿用原 joinedAt——入席时刻是事实，不因角色变化而改写。
  push({
    windowKey: to,
    role: 'owner',
    joinedAt: existing?.joinedAt ?? input.at,
    ...(existing?.lastSeenAt !== undefined ? { lastSeenAt: existing.lastSeenAt } : {}),
  })
  // ② 其余席位原样保留，唯 owner 降 observer（**不是退席**：降级保留可见性；要退席走 reqboard_bind(remove)）。
  //    保留 joinedAt/lastSeenAt 的理由同上——它们是历史事实，不是角色派生物。
  for (const seat of seats) {
    if (seat.windowKey === to) continue
    push(seat.role === 'owner' ? { ...seat, role: 'observer' } : seat)
  }
  const roleOfTo = existing?.role
  // 留痕正文：from/to + 两端的角色变化 + actor + ISO 时刻 + 原因（若有）。无原窗口时不编造
  // 「owner→observer」那半句——留痕只能说事实，不能为了句式整齐凭空写一条没发生的降级。
  const comment = {
    id: input.commentId(),
    body: '[交接] 窗口 ' + (from ?? '（无）') + ' → ' + to
      + (from !== undefined ? '（owner→observer）' : '')
      + '｜' + to + '：' + (roleOfTo ?? '（无席位）') + '→owner'
      + '（actor=' + input.actor.kind
      + (input.actor.kind === 'agent' && input.actor.sessionId !== undefined ? ':' + input.actor.sessionId : '')
      + '，at=' + new Date(input.at).toISOString() + '）'
      + (input.reason !== undefined && input.reason.length > 0 ? '：' + input.reason : ''),
    createdAt: input.at,
    createdBy: input.actor,
  }

  req.seats = next
  req.sourceSessionId = to
  req.updatedAt = input.at
  req.updatedBy = input.actor
  req.comments.push(comment)
  return true
}
