/**
 * **团队派发假件**（子卡执行面）——2026-10-11 退役 workflow 引擎后的统一测试替身。
 *
 * 背景：引擎适配器（`pm-workflow`）与其端口（`UseCaseDeps.workflow`）已删；子卡执行只剩
 * 一条真实路径 = **Agent Teams 派发**（`ExecuteTask` → `runSubtaskViaTeam`）。原先各测试里
 * 用"假引擎 + FakeRunner(outcome)"表达"这一次执行产出什么"，现在统一改成团队端口：
 *
 *   · `installTeamProducer(h, {filesChanged, completed})` → Worker 在 `waitForChange` 里把产出
 *     写回台账（`lastReport`），链读回来 → 与引擎时代下游**逐字同形**（解析/落账/凭证门不变）；
 *   · 传 `undefined` / 返回 undefined ⇒ Worker 什么都不写 = 执行失败（凭证门不过）；
 *   · `installTeamUnavailable(h)` → `available()=false` = 执行面不可用（如实拒绝）。
 *
 * 逐卡 gating（并行组/锁/心跳类用例）用**回调形式**：`(subtaskId) => payload | undefined`。
 *
 * 【已知限制（2026-10-11 实测）】团队端口的等待口 `waitForChange()` **不带 id**，故本假件靠
 * "最近一次 `getTask` 轮询的 team task" 判断这次该收口哪张卡。若要**并行挂起**多张卡
 * （例如用 gate 造重叠执行），放行后必须**回钉**一次 `getTask(caller, 本卡 team task id)` 再等，
 * 否则兄弟卡的轮询会改写这个指针、产出写错卡（`advance-parallel` 用例里有同款回钉，可参考）。
 *
 * @module tests/application/teams-fake
 */
import type {
  AgentTeamsPort,
  SpawnWorkerInput,
  TeamMemberViewLike,
  TeamTaskCreateInput,
  TeamTaskUpdateInput,
  TeamTaskViewLike,
} from 'pm-core/application/ports.js'
import type { Harness } from 'tests/application/harness.js'

/** Worker 写回的产出（字段与 `reqboard_task_report` 的入参同形）。 */
export interface SubtaskReportPayload {
  filesChanged?: string[]
  completed?: string[]
  evidence?: string[]
}

/** 产出策略：对象 = 一律这么写；函数 = 按子卡 id 决定（不写 = 返回 undefined）。 */
export type SubtaskProduce = SubtaskReportPayload | ((subtaskId: string) => SubtaskReportPayload | undefined)

function member(name: string, status: TeamMemberViewLike['status']): TeamMemberViewLike {
  return { id: 'sess-' + name, name, role: 'teammate', status, diagnostics: [] }
}

function view(id: string, status: TeamTaskViewLike['status']): TeamTaskViewLike {
  return {
    id, revision: 1, subject: 's', description: 'd', status,
    blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [],
  }
}

/**
 * 从建队任务的描述里取台账子卡 id（`SubtaskTeamRun` 保证描述里带 id）。
 *
 * 必须按**显式标记**取，不能裸扫 `t-…`：描述首段是父卡标记 `[reqboard:parent=t-p]`，
 * 裸正则先命中它 ⇒ 假件把产出写到父卡，本卡恒 `team_report_missing`（2026-10-11 实测）。
 */
export function subtaskIdOfDescription(description: string): string | undefined {
  return /【reqboard 台账子卡 id】(t-[A-Za-z0-9-]+)/.exec(description)?.[1]
}

/**
 * 假团队：`createTask` 记账；`waitForChange` 里让"Worker"写台账并把团队任务推 completed。
 * （与 DSH 真实时序同形：派卡 → 等变更 → Worker 经 `reqboard_task_report` 回写。）
 */
export class FakeTeams implements AgentTeamsPort {
  created: TeamTaskCreateInput[] = []
  spawns: SpawnWorkerInput[] = []
  members: TeamMemberViewLike[] = []
  sent: { target: string; content: string }[] = []
  updates: { taskId: string; action: string; expectedRevision: number }[] = []
  availableFlag = true
  failCreate = false
  private seq = 0
  /** team task id → 台账子卡 id（`createTask` 时按描述登记）。 */
  private readonly subtaskByTeamTask = new Map<string, string>()
  /**
   * team task id → 状态，**按卡记账**。
   *
   * 不能用一个全局单值：一队多卡是**一次性建全队**（`ensureParentTeamTasks`），若状态全局共享，
   * 第一张卡 completed 后第二张卡的 `getTask` 直接返回 completed ⇒ `waitForChange` 不再被调 ⇒
   * 第二张起的卡全部 `team_report_missing`（2026-10-11 实测）。
   */
  private readonly statusByTeamTask = new Map<string, TeamTaskViewLike['status']>()
  /** 最近一次被 `getTask` 轮询的 team task id = 链当前在等的那张卡（`waitForChange` 无 id 参数）。 */
  private polled: string | undefined

  constructor(
    private readonly h: Harness,
    private readonly produce: SubtaskProduce | undefined,
  ) {}

  available(): boolean { return this.availableFlag }

  async spawnWorker(_c: unknown, i: SpawnWorkerInput): Promise<TeamMemberViewLike> {
    this.spawns.push(i)
    const m = member(i.name, 'running')
    this.members.push(m)
    return m
  }

  listMembers(): readonly TeamMemberViewLike[] { return this.members }

  async createTask(_c: unknown, i: TeamTaskCreateInput): Promise<TeamTaskViewLike> {
    if (this.failCreate) throw Object.assign(new Error('teams boom'), { code: 'DSH_TEAMS_UNAVAILABLE' })
    this.created.push(i)
    this.seq += 1
    const teamTaskId = 'tt-' + this.seq
    const id = subtaskIdOfDescription(i.description)
    if (id !== undefined) this.subtaskByTeamTask.set(teamTaskId, id)
    this.statusByTeamTask.set(teamTaskId, 'pending')
    return view(teamTaskId, 'pending')
  }

  listTasks(): readonly TeamTaskViewLike[] { return [] }

  getTask(_c: unknown, id: string): TeamTaskViewLike {
    this.polled = id
    return view(id, this.statusByTeamTask.get(id) ?? 'pending')
  }

  async updateTask(_c: unknown, i: TeamTaskUpdateInput): Promise<TeamTaskViewLike> {
    this.updates.push({ taskId: i.taskId, action: i.action, expectedRevision: i.expectedRevision })
    const next: TeamTaskViewLike['status'] = i.action === 'reopen' ? 'pending' : 'completed'
    this.statusByTeamTask.set(i.taskId, next)
    return view(i.taskId, next)
  }

  /** 等变更：这里就是"Worker 干活的时间"——给**链当前在等的那张卡**按策略写台账产出。 */
  async waitForChange(): Promise<{ timedOut: boolean }> {
    const teamTaskId = this.polled ?? this.lastCreatedTeamTaskId()
    const subtaskId = (teamTaskId === undefined ? undefined : this.subtaskByTeamTask.get(teamTaskId)) ?? 't-s'
    const payload = typeof this.produce === 'function' ? this.produce(subtaskId) : this.produce
    if (payload !== undefined) {
      await this.h.setTaskFields(subtaskId, {
        lastReport: {
          at: this.h.clock.t,
          reportIndex: 1,
          filesChanged: payload.filesChanged ?? [],
          completed: payload.completed ?? [],
          ...(payload.evidence === undefined ? {} : { evidence: payload.evidence }),
        },
      })
    }
    if (teamTaskId !== undefined) this.statusByTeamTask.set(teamTaskId, 'completed')
    return { timedOut: false }
  }

  async sendMessage(_c: unknown, i: { target: string; content: string }): Promise<{ messageId: string; status: string }> {
    this.sent.push(i)
    return { messageId: 'msg-1', status: 'accepted' }
  }

  interrupt(): { previousStatus: string } { return { previousStatus: 'running' } }

  private lastCreatedTeamTaskId(): string | undefined {
    const ids = [...this.subtaskByTeamTask.keys()]
    return ids[ids.length - 1]
  }
}

/** 装上"团队可用 + Worker 按策略写产出"的假件。 */
export function installTeamProducer(h: Harness, produce: SubtaskProduce | undefined): FakeTeams {
  const teams = new FakeTeams(h, produce)
  h.deps.teams = teams
  return teams
}

/** 装上"团队服务明确不可用"的假件（执行面不可用的那条路）。 */
export function installTeamUnavailable(h: Harness): FakeTeams {
  const teams = new FakeTeams(h, undefined)
  teams.availableFlag = false
  h.deps.teams = teams
  return teams
}
