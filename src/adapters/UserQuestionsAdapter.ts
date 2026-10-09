/**
 * 弹框通道适配器（REQ-47939a t5 / ports.ts UserQuestionPort）——`deps.userQuestions` 接缝。
 *
 * reqboard_ask_confirm / accept_sheet / 立项弹框 需要向用户弹框；服务可能未注入
 * （子代理 / 无 UI / 服务缺失）。available() 给出可用性判定，ask() 在不可用时抛带 code 的错误
 * （调用方据此返回 fallback=board）。
 *
 * REQ-e3b6a0 t7：原先的「自动继续」桩（onAnswered 回调 + opts.autoContinue）**已删除**——
 * 该能力现在由装饰器 `GateAwareQuestions` 统一织入（拿着 `opts.gate` 登记后置链），
 * 故本适配器回归「只做通道」的单一职责，不再夹带业务语义。
 *
 * ── ⚠️ 硬约束：发出去的请求必须**可无损 JSON 往返**（REQ-261008103718-f1ea FR-1）──────────
 * 本文件是弹框请求进入 host→client remote 事件的**唯一出口**，所以这条约束由本层兜底。
 *
 * **为什么**（2026-10-08 事故，立项弹框连续"失效"）：
 *  `buildCaptureIntentQuestions` 的选项曾写成 `description: i === 0 ? '…' : undefined`
 *  ——键**存在**且值为 `undefined`。宿主的 `projectRemoteEventRequest` 把 `agent`/`signal`
 *  之外的所有 own key 原样复制，再交 `isRemoteJsonValue` 校验；该判据遍历**所有** own key，
 *  而 `undefined` 不是合法 JSON 值 ⇒ 抛
 *  `api gateway: Remote event request is not lossless JSON data` ⇒ **整条请求被拒收**——
 *  浏览器侧根本收不到请求，弹框当然不出现（现象酷似"UI 坏了"，但客户端完全无辜）。
 *
 * **为什么后果被放大**：该错误**没有 code**，而当时的 catch 只认
 *  `DELEGATED_CALLER`/`CALLER_NOT_LIVE`，于是落进"用户取消"分支 → 回执谎报「用户未作答
 * （取消 / 暂离）」+ 记一条 cancel 留痕 → 连续三次触发 30 分钟"取消粘滞"不再弹框。
 *  **通道故障被写成了人的选择**，这是本次排查最大的弯路（错误码必须落文件才看见，
 *  故本文件所有关键分支都走 `captureDiag`）。
 *
 * **判据出处**（DSH 侧，改口径要同步看）：`packages/typert/protocol/src/json-value.ts`
 *  的 `visitJsonValue`——`undefined`、`NaN`、`Infinity`、`-0`、循环引用、非 plain 对象
 *  （类实例）全部非法；`null` 合法。
 *
 * **本层做法**：`ask` / `askTimed` 发送前一律 `stripUndefinedDeep`（剔 undefined 键与数组项、
 *  保留 null、不碰类实例），并对 `agent` / `signal` 用**条件展开**——`{signal: undefined}`
 *  同样是非法请求。上游构造处（如 capture-mapping）仍应写对，这里只是最后一道防线；
 *  清洗真的删掉东西时会记一条 `[UI-2]` 诊断，说明上游还有 undefined 可治理。
 *
 * **别再把这类错误说成"用户取消"**：无 code 的通道故障必须如实上报（见 CaptureRequirement
 *  的 `[UI-5]` 分支），否则"弹框弹不出来"会被永久固化成"用户不想用弹框"。
 *
 * @module dsh-pmboard/adapters/UserQuestionsAdapter
 */
import type { AskAnswer, AskQuestion, AskTimedResult, UserQuestionPort } from '../application/ports.js'
import { racePortAsk } from '../application/internal/ask-timed.js'
import { captureDiag } from '../application/internal/diag-log.js'
import { stripChangedAnything, stripUndefinedDeep } from '../application/internal/lossless-json.js'
import type { GateId } from '../domain/gate/GateSpec.js'

interface RawQuestionService {
  ask?: (req: unknown) => Promise<{ answers?: AskAnswer[] }>
  /**
   * 宿主限时等待（REQ-261007223647-da5d t3 · FR-1）：窗口内作答 → 答案；到期 → pending 结果。
   * 宿主实现见 `@deepseek-ai/dsh-user-questions` 的 `askTimed(request, callId, timeoutMs)`：
   * 「Client 倒计时归零 → ASK_TIMED_OUT → 宿主映射为 pending 结果，卡片仍可作答」。
   * 可选：宿主没有这个面就退回本地竞速（同一超时口径，见 application/internal/ask-timed）。
   */
  askTimed?: (req: unknown, callId?: unknown, timeoutMs?: unknown) => Promise<unknown>
}

export class UserQuestionsAdapter implements UserQuestionPort {
  private readonly resolve: () => unknown

  constructor(resolve: () => unknown) {
    this.resolve = resolve
  }

  available(): boolean {
    const svc = this.resolve() as RawQuestionService | undefined
    const result = typeof svc?.ask === 'function'
    // 可靠诊断（2026-10-08）：stdout 在桌面宿主里读不到，可用性判定必须落文件，
    // 否则「通道不可用」与「没人接单」两类故障在回执上长得一模一样。
    captureDiag(`reqboard-capture [UI-1]: available() svc=${svc !== undefined} ask=${typeof svc?.ask} → ${result}`)
    return result
  }

  async ask(
    questions: readonly AskQuestion[],
    opts: { agent?: unknown; signal?: unknown; gate?: string },
  ): Promise<readonly AskAnswer[]> {
    captureDiag(
      `reqboard-capture [UI-2]: ask() 调用 questions=${questions.length} `
      + `agent=${opts.agent !== undefined} signal=${opts.signal !== undefined} gate=${String(opts.gate)}`,
    )
    const svc = this.resolve() as RawQuestionService | undefined
    if (typeof svc?.ask !== 'function') {
      captureDiag('reqboard-capture [UI-2]: 通道不可用（服务缺失）→ REQBOARD_NO_UI')
      throw Object.assign(new Error('弹框通道不可用（userQuestions 服务缺失）'), { code: 'REQBOARD_NO_UI' })
    }
    try {
      // 无损 JSON 关口（REQ-261008103718-f1ea FR-1）：这条请求要走 host→client 的 remote
      // 事件，宿主 api gateway 要求可无损 JSON 往返。值为 undefined 的键/项会让整条请求被
      // 拒收（`not lossless JSON data`）——2026-10-08 立项弹框失效的真因就是这个。
      const wireQuestions = stripUndefinedDeep(questions)
      if (stripChangedAnything(questions, wireQuestions)) {
        captureDiag(
          'reqboard-capture [UI-2]: questions 含 undefined 键/项，已在通道边界清洗'
          + '（否则 remote 网关会以 not lossless JSON data 拒收）',
        )
      }
      const result = await svc.ask({
        questions: wireQuestions,
        ...(opts.agent === undefined ? {} : { agent: opts.agent }),
        // signal 同样只在有值时才设键：`{ signal: undefined }` 也是不可无损的。
        ...(opts.signal === undefined ? {} : { signal: opts.signal }),
      })
      captureDiag(`reqboard-capture [UI-3]: svc.ask() 返回 answers=${result?.answers?.length ?? 0}`)
      return result.answers ?? []
    } catch (err) {
      // 宿主真实错误码必须落文件：此前只进 console（读不到），于是 NO_PROVIDER 这类
      // 「没有 answerer 接单」的通道故障被上层误报成「用户取消了弹框」并记取消留痕。
      const code = (err as { code?: string } | undefined)?.code ?? '<none>'
      const message = (err as Error | undefined)?.message ?? String(err)
      captureDiag(`reqboard-capture [UI-3]: svc.ask() 抛错 code=${code} message=${message}`)
      throw err
    }
  }

  /**
   * 限时等待（IF-3）：**一律走本地竞速自家 `ask()`**——超时返回 pending、底层等待不取消
   * （卡片仍可答）。返回形状与宿主原生 timed 一致，调用方（`askWithBudget`）不需要知道差别。
   *
   * ⚠️ 为什么不透传宿主 `svc.askTimed`（REQ-261008103718-f1ea，2026-10-08 实测）：
   * 宿主签名的第二参是 **`callId`（tool call id）**，打包版注释原文
   * "Timed requests include the tool call…"。我们此前固定传 `undefined`，而该值会进入
   * remote 请求体 ⇒ 宿主 `isRemoteJsonValue` 判定 `undefined` 非法 ⇒ 抛
   * `api gateway: Remote event request is not lossless JSON data` ⇒ **整条弹框请求被拒收**。
   * 现象极具迷惑性：`available()` 为真、服务在场，却"什么都没发生"（且错误无 code，
   * 一度被误报成「用户取消」）。而**官方工具 `tool-ask-user` 走的正是 `ask()` 这条路**
   * （`ctx.userQuestions.ask({ questions, agent, signal })`），是已知可用的形状 ⇒ 我们对齐它。
   *
   * 若将来确实需要宿主的原生倒计时 / `attachWait`，正确做法是：在 `UserQuestionPort.askTimed`
   * 上补一个**真实 callId**（`exec.callId`）并在宿主侧确认约定——**不要再传 `undefined`**。
   */
  async askTimed(
    questions: readonly AskQuestion[],
    opts: { agent?: unknown; signal?: unknown; gate?: GateId; timeoutMs: number },
  ): Promise<AskTimedResult> {
    const svc = this.resolve() as RawQuestionService | undefined
    if (typeof svc?.ask !== 'function') {
      captureDiag('reqboard-capture [UI-4]: askTimed() 通道不可用（服务缺失）→ REQBOARD_NO_UI')
      throw Object.assign(new Error('弹框通道不可用（userQuestions 服务缺失）'), { code: 'REQBOARD_NO_UI' })
    }
    // 留着这条诊断：宿主 askTimed 一旦变成可用形状，这里会告诉我们它确实在场。
    captureDiag(
      `reqboard-capture [UI-4]: askTimed() 走本地竞速（宿主 askTimed=${typeof svc.askTimed}，`
      + `不透传：其 callId 参数缺失会让请求不可无损 JSON）timeoutMs=${opts.timeoutMs}`,
    )
    return racePortAsk(this, questions, opts, opts.timeoutMs)
  }
}
