/**
 * goal 驱动回合的**契约**（REQ-261010200257-7e2d · 以 goal 为基础重写的驱动）。
 *
 * 【与旧 `pm-round-driver` 的分工】旧驱动以 `dive.*` 状态为核心；本包以 **goal** 为核心：
 * 驱动拍只回答三件事——① 该窗口立项了吗 ② 现在该不该跑（闸） ③ 跑什么（goal）/ 跑完了判 stage。
 * 停手纪律（闭锁/退避/上游闸）与投递纪律（预留→投递→准入）**照旧迁入**，不重发明。
 *
 * 【为什么决策是纯函数】六道闸 + goal/stage 分支必须能被穷举单测（本仓一贯做法：
 * `domain/dive/transition.ts`、`pm-goal/fold.ts` 同款）。I/O 全在端口后面。
 *
 * @module dsh-pmboard/goal-round/types
 */
import type { GoalPhase } from 'pm-goal'

/** 需求侧窄投影（驱动拍要读的**有界**事实）。 */
export interface RoundRequirementFacts {
  readonly id: string
  /** 立项绑定：本窗口是不是这条需求的 owner（undefined = 未绑定）。 */
  readonly sourceSessionId?: string
  /** 人的意图 + 运行时健康（旧驱动的两套判据，原样保留）。 */
  readonly drivable: boolean
  /** 里程/推进告警（如 advance.pausedReason 存在 ⇒ 不驱动）。 */
  readonly advancePausedReason?: string
}

/** 闸判据的当拍事实（全部由端口注入；缺失 = 该闸未启用）。 */
export interface GateFacts {
  /** ① 内存闭锁（当拍可信，先于一切台账判据）。 */
  readonly latchOpen?: boolean
  /** ② 退避期内（不早于该时刻才允许起轮）。 */
  readonly backoffUntil?: number
  /** ③ 进程级上游闸。 */
  readonly providerLatchOpen?: boolean
  /** ④ 人工门（台账态：待裁决/待确认/待批准）。 */
  readonly humanGateOpen?: boolean
  readonly humanGateReason?: string
  /** ④' 弹框在途（内存态：有人正站在框前）。 */
  readonly dialogInFlight?: boolean
  /** ⑤ 起链预算闸。 */
  readonly chainBudgetAllowed?: boolean
  readonly chainBudgetReason?: string
}

/** 目标侧当拍事实。 */
export interface GoalFacts {
  /** ⑥ goal 相位；undefined = 本阶段还没有 goal。 */
  readonly phase?: GoalPhase
  /** 本阶段（L1）是否已全部达成 ⇒ 该收口/请人判。 */
  readonly stageReadyToClose?: boolean
  /** 当前阶段是否还有 ready 卡（决定"没完成时能不能再建 goal"）。 */
  readonly hasReadyTask?: boolean
  /** 下一个 goal 的挂载卡（ready 卡集合里的第一张；无则 undefined）。 */
  readonly nextTaskId?: string
  /** 该卡的 acceptance（建 goal 的 objective 缺省来源，D-1）。 */
  readonly nextTaskAcceptance?: string
  /** 立案绑定窗口键（ownership 判定用）。 */
  readonly windowKey?: string
}

/** 一次驱动拍的全部输入（纯数据，便于穷举单测）。 */
export interface DecideInput {
  readonly now: number
  readonly requirement?: RoundRequirementFacts
  readonly gates?: GateFacts
  readonly goal?: GoalFacts
}

/** 驱动拍的结论（**穷尽**五态：跑 / 建 goal 再跑 / 停手等人 / 触发弹框 / 什么都不做）。 */
export type RoundDecision =
  /** 起轮：把提示词投给窗口（goal 已是 active）。 */
  | { readonly kind: 'drive'; readonly requirementId: string }
  /** 先建 goal（本阶段还有 ready 卡）→ 下一拍即可 drive。 */
  | { readonly kind: 'create-goal'; readonly requirementId: string; readonly taskId: string; readonly objective: string }
  /** 停手等人（人工门 / 弹框在途）——不写健康位、不改人的意图。 */
  | { readonly kind: 'wait-human'; readonly requirementId: string; readonly reason: string }
  /** 阶段判据都满足 ⇒ 触发弹框请人裁决（不起轮）。 */
  | { readonly kind: 'ask-stage-done'; readonly requirementId: string }
  /** 全部阶段达成 ⇒ 触发收口弹框。 */
  | { readonly kind: 'ask-close'; readonly requirementId: string }
  /** 停手（闸拦下 / 无立项 / 无可跑之事）——reason 必填，进诊断面。 */
  | { readonly kind: 'hold'; readonly reason: string; readonly requirementId?: string }
