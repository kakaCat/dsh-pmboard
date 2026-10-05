/**
 * done 凭证门规约（REQ-47939a t3 / INV-4，REQ-2e9473 t06/W2，事故 C/D 的硬门）。
 *
 * 转 done 前的四重校验——规则从 host/agent-tools.ts 的 assertDoneEvidence 抽到 domain：
 *  ① 汇报前置：必须有 task_report 留痕（lastReport），且 completed/filesChanged 至少其一非空；
 *  ② 真实动作：开工（claimedAt）以来有干活类工具痕迹（edit/write/bash/run_code，弱信号），
 *     或汇报声明的文件真实存在且 mtime 新于开工（强信号）——25ms 速通两路都过不了；
 *  ③ 批量关闭节流：同需求 60s 内已有其他任务被 agent 关闭 → 拒（事故 C：一次调用关 4 个任务）；
 *  ④ 构建新鲜度：汇报改动涉及 packages/pages/<pkg>/src/ → 该包 lib/client.js 必须存在且
 *     新于最新 src 改动（事故 D：改了源码没构建，用户看到旧页面）。
 *
 * 纯决策：fs statSync / 工具痕迹统计等副作用留在 host 侧，算成布尔/数值后传入。
 * 消息文案与搬迁前逐字一致（硬约束），code 为工具层传输码（大写 REQBOARD_*）。
 */

/** 同需求、60s 内被 agent 关闭的其他任务（节流命中的清单项）。 */
import { fmt } from '../text/fmt.js'

export interface RecentDoneTaskLike {
  id: string
  title: string
}

interface TaskWithHistory {
  id: string
  title: string
  requirementId: string
  /**
   * 父卡 id（REQ-261001170807-06fd FR-1）：用于在节流判据里识别"本卡自己的子卡"。
   * 子卡关闭本身豁免节流，但它的 done 事件不该给**它的父卡**上弦——否则
   * "关完子卡 → 关父卡"这个唯一正确的收尾顺序必然被 60s 节流拒绝。
   */
  parentId?: string
  statusHistory?: readonly { status: string; by: { kind: string }; at: number }[]
}

/**
 * 批量关闭节流判定（事故 C）：同需求内、非本任务、且时间线里存在 agent 关闭的 done 事件
 * 且距 now 不足 throttleMs → 返回该任务。返回 undefined = 不节流。
 */
export function findRecentAgentDoneTask(
  tasks: readonly TaskWithHistory[],
  taskId: string,
  requirementId: string,
  now: number,
  throttleMs: number,
): RecentDoneTaskLike | undefined {
  const hit = tasks.find(t =>
    t.id !== taskId
    && t.requirementId === requirementId
    // FR-1：本卡自己的子卡不算"别人刚关过"——父子链收尾是正常动作，不是批量关闭滥用。
    && t.parentId !== taskId
    && (t.statusHistory ?? []).some(h => h.status === 'done' && h.by.kind === 'agent' && now - h.at < throttleMs),
  )
  return hit === undefined ? undefined : { id: hit.id, title: hit.title }
}

/**
 * 节流剩余等待毫秒（REQ-261001154450-b918 FR-4）：不节流 → 0；节流 → 还要等多久。
 *
 * 为什么需要它：旧拒绝文案只说"请稍后"，agent 只能猜——实测（REQ-8475）猜出的解法是
 * 连打 32 次 `sleep 62`，纯等待 33.1 分钟（占该需求墙钟 65%）。把剩余时间算出来，
 * 文案就能给人一个**确定的答复**。
 */
export function doneThrottleRemainingMs(
  tasks: readonly TaskWithHistory[],
  taskId: string,
  requirementId: string,
  now: number,
  throttleMs: number,
): number {
  let remaining = 0
  for (const t of tasks) {
    if (t.id === taskId || t.requirementId !== requirementId) continue
    if (t.parentId === taskId) continue // FR-1：父子链收尾不上弦（与 findRecentAgentDoneTask 同口径）
    for (const h of t.statusHistory ?? []) {
      if (h.status !== 'done' || h.by.kind !== 'agent') continue
      const left = throttleMs - (now - h.at)
      if (left > remaining) remaining = left
    }
  }
  return remaining > 0 ? remaining : 0
}

export interface DoneEvidenceInput {
  hasReport: boolean
  reportFilesChanged: readonly string[]
  reportCompleted: readonly string[]
  /** 开工以来本窗口有干活类工具痕迹（toolTrace 缺失或无 workLike → false）。 */
  hasTraceWork: boolean
  /** 汇报声明的改动文件真实存在且 mtime ≥ 开工时间（强信号）。 */
  fileEvidence: boolean
  /** 节流命中的其他任务（findRecentAgentDoneTask 的产物）。 */
  recentDoneTask?: RecentDoneTaskLike
  /** 节流剩余等待毫秒（doneThrottleRemainingMs 的产物）——用来把"还要等多久"写进拒绝文案。 */
  throttleRemainingMs?: number
  /** 汇报里 packages/pages/<pkg>/src/ 下的改动文件（构建新鲜度检查用）。 */
  pagesSrcFiles: readonly string[]
  clientBuildExists: boolean
  clientBuildMtime: number
  newestPagesSrcMtime: number
}

export type DoneEvidenceVerdict =
  | { ok: true }
  | { ok: false; code: string; reason: string }

/** done 凭证门：返回拒绝原因（ok=false）或放行（ok=true）。 */
export function checkDoneEvidence(input: DoneEvidenceInput): DoneEvidenceVerdict {
  // ① 汇报前置 + 证据非空
  if (!input.hasReport) {
    return {
      ok: false,
      code: 'REQBOARD_NO_REPORT',
      reason: fmt('reqboard_task_move 未执行：done 凭证门——该任务还没有 reqboard_task_report 汇报。先汇报（summary/completed/files_changed）再关闭（REQ-2e9473 W2，事故 C 修复）', {}),
    }
  }
  if (input.reportFilesChanged.length === 0 && input.reportCompleted.length === 0) {
    return {
      ok: false,
      code: 'REQBOARD_NO_REPORT',
      reason: 'reqboard_task_move 未执行：done 凭证门——汇报证据为空（completed 与 files_changed 至少其一非空），空汇报不算完工',
    }
  }
  // ② 真实动作：工具痕迹（弱信号）或文件证据（强信号）
  if (!input.hasTraceWork && !input.fileEvidence) {
    return {
      ok: false,
      code: 'REQBOARD_NO_EVIDENCE',
      reason: fmt('reqboard_task_move 未执行：done 凭证门——开工以来无干活类工具动作，且汇报声明的改动文件不存在或早于开工时间。凭证不足不能关闭（25ms 速通拦截）', {}),
    }
  }
  // ③ 批量关闭节流：同需求 60s 内已有其他任务被 agent 关闭
  if (input.recentDoneTask !== undefined) {
    return {
      ok: false,
      code: 'REQBOARD_BULK_CLOSE',
      reason: fmt(
        'reqboard_task_move 未执行：done 凭证门——刚关闭过任务 {id}（{title}），同需求 60 秒内不得再关第二张**非子卡**任务（事故 C）。{eta}。合规路径：① 等待后可继续（这是设计内的节流，不是故障）；② 子卡链不受此限（子卡走三项口径，可先推进子卡）；③ 批量收口交给自动链 reqboard_task_run，由链逐张关闭（REQ-261001154450-b918 FR-4：文案必须给出确定等待时间，禁止让 agent 靠试探/硬等找节奏）',
        {
          id: input.recentDoneTask.id,
          title: input.recentDoneTask.title,
          eta: (input.throttleRemainingMs ?? 0) > 0
            ? fmt('还需等待约 {sec} 秒', { sec: String(Math.ceil((input.throttleRemainingMs ?? 0) / 1000)) })
            : '请稍后重试',
        },
      ),
    }
  }
  // ④ 页面插件构建新鲜度（事故 D）
  if (input.pagesSrcFiles.length > 0) {
    const pkg = /^packages\/pages\/([^/]+)\//.exec(input.pagesSrcFiles[0] ?? '')?.[1] ?? ''
    if (!input.clientBuildExists) {
      return {
        ok: false,
        code: 'REQBOARD_STALE_BUILD',
        reason: fmt('reqboard_task_move 未执行：done 凭证门——页面插件任务未构建：packages/pages/{pkg}/lib/client.js 不存在。先 cd packages/pages/{pkg} && pnpm build:client（事故 D：改了源码 ≠ 已生效）', { pkg }),
      }
    }
    if (input.clientBuildMtime < input.newestPagesSrcMtime) {
      return {
        ok: false,
        code: 'REQBOARD_STALE_BUILD',
        reason: fmt('reqboard_task_move 未执行：done 凭证门——构建产物陈旧：packages/pages/{pkg}/lib/client.js 旧于 src 最新改动。先重新 pnpm build:client 再关任务（事故 D：改了源码 ≠ 已生效）', { pkg }),
      }
    }
  }
  return { ok: true }
}
