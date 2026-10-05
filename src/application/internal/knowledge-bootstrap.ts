/**
 * 知识层自举协调器（REQ-261004174324-4195 t4 / design/architecture.md「触发链」）。
 *
 * 职责只有两件：**每个根只跑一次**（并发合并成同一个 promise）、**失败不再自动重试**。
 * 生成逻辑一律在用例里（`EnsureKnowledgeLayer`），本模块不读不写文件。
 *
 * 为什么需要它：宿主有三个「根确定了」的时刻（激活 / 用例根校正 / 看板按会话解析根），
 * 三处都必须能触发，但不能因此跑三遍或互相覆盖。
 *
 * @module dsh-pmboard/application/internal/knowledge-bootstrap
 */
import type { DocRepository } from '../ports.js'
import { ensureKnowledgeLayer, type KbEnsureResult } from '../use-cases/EnsureKnowledgeLayer.js'

/** 通知点只需这一个方法（见 design/interfaces.md：三处只做「通知根已确定」）。 */
export interface KnowledgeBootstrapPort {
  /** 记下「这个根确定了」，异步跑一次自举；不阻塞、不抛。 */
  ensure(root?: string): void
}

export interface KnowledgeBootstrapOptions {
  /** 当前读根对应的仓储（未指定目标根时用它）。 */
  readonly docs: DocRepository
  /**
   * 按根取「根绑定仓储」（组合根提供）。
   *
   * **为什么必须有它**：用例的写路径是按 `docs.workspaceRoot()` 解析的，而看板路由是按会话
   * 构造自己的仓储——若拿共享单例去跑「会话根」的自举，知识层会被生成到**插件宿主目录**
   * （实测 ~/.dsh/profiles/<profile>）而不是用户项目里。给一个按根产出仓储的工厂，
   * 既不污染共享单例的根，也不需要在 application 层 import 适配器。
   */
  readonly docsFor?: (root: string) => DocRepository
  /** 关掉则一律 no-op（`knowledge.enabled=false` 或 `autoBootstrap=false`）。 */
  readonly enabled: boolean
  readonly log?: (message: string) => void
}

/** 根的归一（纯字符串，不碰 fs——本层不许 IO）：去尾斜杠、压重复分隔符。 */
function normalizeKey(root: string): string {
  return root.replace(/\/+$/, '').replace(/\/{2,}/g, '/')
}

export class KnowledgeBootstrap implements KnowledgeBootstrapPort {
  private readonly inflight = new Map<string, Promise<KbEnsureResult>>()

  constructor(private readonly options: KnowledgeBootstrapOptions) {}

  /** 通知点入口：即发即忘（失败只记日志，绝不打断宿主与请求）。 */
  ensure(root?: string): void {
    void this.run(root).catch(() => { /* run 内部已兜住；这里只保证不产生未处理拒绝 */ })
  }

  /** 可 await 版本（测试与显式调用用）。 */  async run(root?: string, opts: { force?: boolean } = {}): Promise<KbEnsureResult> {
    const target = root ?? this.options.docs.workspaceRoot()
    if (!this.options.enabled) {
      return { status: 'skipped', root: target, created: [], skipped: [], drift: [], reason: 'disabled' }
    }
    if (typeof target !== 'string' || target.length === 0) {
      return { status: 'skipped', root: '', created: [], skipped: [], drift: [], reason: 'root-unknown' }
    }
    const key = normalizeKey(target)
    const hit = this.inflight.get(key)
    if (hit !== undefined && opts.force !== true) return await hit
    // 目标根 ≠ 当前读根 → 必须换一根绑定的仓储（否则会把知识层写到宿主目录，见 options.docsFor）。
    const bound = this.boundDocsFor(target)
    if (bound === undefined) {
      this.options.log?.('reqboard: 知识层自举跳过——无法为根 ' + target + ' 取到仓储（docsFor 未装配）')
      return { status: 'skipped', root: target, created: [], skipped: [], drift: [], reason: 'root-unknown' }
    }
    const promise = ensureKnowledgeLayer({ docs: bound }, opts.force === true ? { force: true } : {})
    this.inflight.set(key, promise)
    const result = await promise
    if (result.status === 'failed') {
      // 失败**留存**在表里（同根不再自动重试），但必须响亮报出：写清根、文件、原因。
      this.options.log?.(
        'reqboard: 知识层自举失败（不重试，可用 knowledge.autoBootstrap=false 关闭）：'
        + 'root=' + result.root + ' path=' + (result.failedPath ?? '(未知)') + ' reason=' + (result.error ?? (result.reason ?? '未知')),
      )
    }
    return result
  }

  /**
   * 取目标根对应的仓储：与当前读根相同 → 直接用共享仓储（常见情形，零成本）；
   * 不同 → 用 `docsFor` 造一个根绑定仓储；没有 `docsFor` 又根不同 → `undefined`（调用方跳过并记日志，
   * **绝不**退回共享仓储硬写——那就是往宿主目录写的那个 bug）。
   */
  private boundDocsFor(target: string): DocRepository | undefined {
    const current = this.options.docs.workspaceRoot()
    if (typeof current === 'string' && normalizeKey(current) === normalizeKey(target)) return this.options.docs
    return this.options.docsFor?.(target)
  }
}
