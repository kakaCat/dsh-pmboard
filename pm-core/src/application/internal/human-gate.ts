/**
 * 人工门判据（REQ-261004065652-5c1c FR-5 · t1）。
 *
 * ## 病：把人等的事当成"没在跑"
 *
 * 2026-10-03 实测：REQ-261003203909-55f2 验收材料已提交、验收单 9 项全 `pending`，
 * 台账评论自己写着「Dive 连续唤醒回合均无新输入、agent 无待办」——驱动仍反复唤醒窗口。
 * 因为当时的唯一停手判据是"弹框在途"（内存态），**台账上的人等状态（待裁决/待确认/待批准）
 * 根本不是停手条件**。
 *
 * ## 语义边界（别把它做成"什么都停"）
 *
 * 门开 = "**这一步该由人做决定，agent 现在没有可做的事**"。所以：
 *   · 只认五道人工门对应的产物种类（`GATE_ARTIFACT_KINDS`）——
 *     `task_detail` / `task_output` 这类过程产物**不算**（否则实施阶段会被自己的汇报卡死）；
 *   · "材料都没提交"不算门开（那时 agent 该干活）；
 *   · 人工门是**正常等人**，不是故障：命中时**不写健康位、不改 activation**。
 *
 * 纯函数、零 I/O，入参只要判定所需的有界字段（结构类型，整条记录与窄投影都能传）。
 *
 * @module dsh-pmboard/application/internal/human-gate
 */

export type HumanGateReason = 'acceptance-pending' | 'artifact-unconfirmed' | 'plan-unapproved'

export interface HumanGate {
  open: boolean
  reason?: HumanGateReason
}

/** 五道人工门对应的产物种类（`plan` 的批准走 `plan.approvedAt`，不是产物确认）。 */
export const GATE_ARTIFACT_KINDS: readonly string[] = ['requirement', 'design', 'decomposition', 'verification', 'archive']

/** 验收单里"还没裁决"的状态（`unverified` 是历史遗留的未裁决值）。 */
const PENDING_ITEM_STATUSES: readonly string[] = ['pending', 'unverified']

export interface HumanGateShape {
  readonly status: string
  readonly artifacts?: readonly unknown[]
  readonly plan?: { readonly approvedAt?: number }
  readonly verification?: { readonly sheet?: { readonly items?: readonly unknown[] } }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

/** 是否"已登记但未落章"的门类产物。 */
function hasUnconfirmedGateArtifact(artifacts: readonly unknown[] | undefined): boolean {
  for (const raw of artifacts ?? []) {
    const a = asRecord(raw)
    if (a === undefined) continue
    const kind = typeof a['kind'] === 'string' ? a['kind'] : ''
    if (!GATE_ARTIFACT_KINDS.includes(kind)) continue
    if (a['confirmedAt'] === undefined) return true
  }
  return false
}

/**
 * 门是否开着。判定顺序（写成用例锁死）：
 *   ① `accepting` 且验收单存在未裁决项 → `acceptance-pending`
 *   ② `decomposing` 且计划已提交未批准 → `plan-unapproved`
 *   ③ 存在未确认的门类产物 → `artifact-unconfirmed`
 */
export function humanGateOf(req: HumanGateShape | undefined): HumanGate {
  if (req === undefined) return { open: false }

  if (req.status === 'accepting') {
    const items = req.verification?.sheet?.items ?? []
    const pending = items.some((raw) => {
      const item = asRecord(raw)
      const status = item !== undefined && typeof item['status'] === 'string' ? item['status'] : ''
      return PENDING_ITEM_STATUSES.includes(status)
    })
    if (pending) return { open: true, reason: 'acceptance-pending' }
  }

  if (req.status === 'decomposing' && req.plan !== undefined && req.plan.approvedAt === undefined) {
    return { open: true, reason: 'plan-unapproved' }
  }

  if (hasUnconfirmedGateArtifact(req.artifacts)) {
    return { open: true, reason: 'artifact-unconfirmed' }
  }

  return { open: false }
}
