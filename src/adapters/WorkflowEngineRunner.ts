/**
 * WorkflowRunner 端口的**唯一实现**（REQ-4842fe t4 / FR-4）：直接消费已加载的
 * `ctx.workflowEngine`，不经过被禁用的 `tool-workflow` 模型侧工具。
 *
 * 契约要点（design/workflow-engine-contract §3）：
 *  - `start()` 同步抛错 = 请求无法开始（meta 非法 / 脚本解析失败）→ 翻译为 ok:false；
 *  - `run.result` **永不 reject**：失败以 stopReason(error/cancelled) 表达；
 *  - 调用方必须 `dispose()`（幂等）；此处 finally 兜底，保证子卡链走完后 worker 不悬挂。
 *
 * @module dsh-pmboard/adapters/WorkflowEngineRunner
 */
import type { WorkflowRunOutcome, WorkflowRunner, WorkflowStartInput } from '../application/ports.js'

/** 引擎的最小结构（不 import @deepseek-ai/dsh-workflow，保持 adapter 只桥接形状）。 */
export interface WorkflowRunLike {
  result: Promise<{ value?: unknown; stopReason?: string; error?: string }>
  cancel?: (reason?: string) => void
  dispose?: () => Promise<void>
}

export interface WorkflowEngineLike {
  start(request: {
    script: string
    meta: { name: string; description: string; phases?: string[] }
    args?: unknown
    parent: unknown
    signal?: unknown
  }): WorkflowRunLike
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * 引擎不可达的**结构化错误码**（2026-10-03）。
 *
 * 为什么另立码、不再只回 `engine_unavailable`：后者把"**按设计不可达**"说成像是瞬时故障。
 * DSH 的 agent preset 用 `isolate: { workflowEngine: true }`
 * （`packages/bundle/web-app/presets/cordis.patch.yml`）把引擎圈在 agent 的 delegation 组内，
 * profile 级插件**永远**取不到它——实测子卡链连挂 4 次（见
 * docs/requirements/REQ-261003191948-e94a/advance-log.md），每次都得到一句无法行动的原因，
 * 诱使操作者反复重试。
 *
 * `LEGACY_ENGINE_CODE` 仍拼在 reason 末尾：`application/internal/failure-handling.ts` 的失败
 * 分类器按 `reason.includes('engine_unavailable')` 归类，保留该子串 ⇒ 分类不变，
 * 而人读的**主码**已换成可行动的 {@link ENGINE_UNREACHABLE_CODE}。
 */
export const ENGINE_UNREACHABLE_CODE = 'subtask_engine_unreachable'

/** 旧码（仅用于失败分类兼容与 grep 兼容；不再单独作为主 reason）。 */
const LEGACY_ENGINE_CODE = 'engine_unavailable'

/** 结构化行动指引：说清"不会静默成功"与两条出路。 */
const UNREACHABLE_GUIDANCE =
  '子卡执行**不会静默成功**。两条出路：'
  + '① 改由本窗口自证过凭证门——reqboard_task_report 写 filesChanged（写入族：至少一个文件真实存在且 mtime ≥ 链出身）'
  + '或 completed（结论族），凭证门在没有成功 run 时即按此口径放行；'
  + '② 让 workflowEngine 在本插件可见的作用域可达（当前 profile 下按设计不可达，**重试无解**）。'

/**
 * 引擎不可达时的描述与留痕通道（缺省 = 只给结构化主码，不附加细节）。
 *
 * 两个钩子都由装配方（`src/index.ts`）注入——adapter 不认识 cordis 上下文，
 * 也不该 import 诊断模块（保持它"只桥接形状"的既有定位）。
 */
export interface EngineUnavailableHooks {
  /**
   * 用一句话说清"这个上下文为什么拿不到引擎"（通常是服务可达性探针的输出）。
   * 返回 undefined / 空串 = 不附加描述。
   */
  describeUnavailable?: () => string | undefined
  /** 文件化诊断通道（缺省不写；写失败不影响主流程）。 */
  diag?: (line: string) => void
}

/**
 * `engine` 以 thunk 形式注入：服务工作区尚未就绪、或**按作用域隔离不可达**时返回 undefined，
 * 此时 start() **显式失败**——不静默成功，且失败原因必须可行动（见 {@link ENGINE_UNREACHABLE_CODE}）。
 */
export class WorkflowEngineRunner implements WorkflowRunner {
  constructor(
    private readonly engine: () => WorkflowEngineLike | undefined,
    private readonly hooks: EngineUnavailableHooks = {},
  ) {}

  /** FR-10 探针：thunk 拿得到引擎即可达（与 start() 的判据同源，不另立一套）。 */
  reachable(): boolean {
    try { return this.engine() !== undefined } catch { return false }
  }

  async start(input: WorkflowStartInput): Promise<WorkflowRunOutcome> {
    const engine = this.engine()
    if (engine === undefined) return this.unreachable()
    let run: WorkflowRunLike
    try {
      run = engine.start({
        script: input.script,
        meta: input.meta,
        args: input.args,
        parent: input.parent,
        signal: input.signal,
      })
    } catch (err) {
      // 同步抛错 = 请求无法开始（META_INVALID / SCRIPT_PARSE 等）。
      return { ok: false, reason: 'start_failed: ' + describe(err) }
    }
    try {
      const settled = await run.result
      if (settled === undefined || settled.stopReason !== 'completed') {
        return { ok: false, reason: (settled?.stopReason ?? 'error') + (settled?.error !== undefined ? ': ' + settled.error : '') }
      }
      return { ok: true, value: settled.value }
    } catch (err) {
      // 契约规定 result 不 reject；防御性兜底，宁可判失败也不静默成功。
      return { ok: false, reason: 'result_rejected: ' + describe(err) }
    } finally {
      if (typeof run.dispose === 'function') {
        try {
          await run.dispose()
        } catch {
          // dispose 失败不改变已定结果（worker 回收是尽力而为）。
        }
      }
    }
  }

  /**
   * 引擎不可达：**响亮**——结构化 reason（含可达性探针输出 + 两条出路）+ 诊断一行。
   *
   * 刻意仍返回 `ok:false`（不伪造成功、不静默降级为"看起来跑过了"）；
   * 真正的兜底在凭证门一侧：没有成功的 run 时，`lastReport` 可以充当执行证据。
   */
  private unreachable(): WorkflowRunOutcome {
    // 探针与诊断都**不得**把"优雅失败"变成异常：2026-10-03 实测过一次同类回归——
    // 探针里读 `ctx.workflowEngine` 被 cordis 守卫抛错，于是 runner 的 ok:false 变成
    // run 异常（advance-log 11:45:13）。故两处各自 try/catch，探针抛错也要**响亮但安全**。
    let detail: string | undefined
    try {
      detail = this.hooks.describeUnavailable?.()
    } catch (err) {
      detail = '可达性探针自身抛错（已忽略，不影响判定）：' + describe(err)
    }
    const reason = ENGINE_UNREACHABLE_CODE + '：子卡执行引擎不可达'
      + (typeof detail === 'string' && detail.length > 0 ? '（' + detail + '）' : '')
      + '。' + UNREACHABLE_GUIDANCE
      + '（legacy code: ' + LEGACY_ENGINE_CODE + '）'
    try {
      this.hooks.diag?.('reqboard-capture [SUBTASK-ENGINE-UNREACHABLE]: ' + reason)
    } catch {
      // 诊断通道绝不反过来影响主流程（同 diag-log 的容错纪律）
    }
    return { ok: false, reason }
  }
}
