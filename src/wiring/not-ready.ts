/**
 * 未就绪态的接线点（REQ-261003191948-e94a · t4 / FR-1、FR-5、FR-6）。
 *
 * ## 为什么单独成模块
 *
 * `apply()` 所在的 `src/index.ts` 已达 600+ 行（C-02 的 400 行门禁是既有失败项），
 * 本需求**不得**再往它里面加逻辑：组合根只留"预检 + 分叉"6 行，降级动作收在这里。
 *
 * ## 三条实现纪律
 *
 * 1. **零数据面副作用**：本函数不建目录、不写数据根、不构造任何存储——
 *    迁移门的纪律是"只读探测"，降级态沿用同一条（FR-5）。
 * 2. **前缀与正常路由逐字一致**（`/dashboard/api/reqboard`）：`webServer.register` 对
 *    `(kind, path)` 重复注册会抛错，同一个字面量恰好保证"未就绪"与"正常"不会同时挂上。
 * 3. **双通道留痕**（FR-6）：宿主日志 error 一条 + 诊断文件一条。2026-10-03 事故的排查之痛
 *    就是诊断日志停在「apply function STARTED」半句话上——那一刻什么原因都没留下。
 *
 * @module dsh-pmboard/wiring/not-ready
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MigrationFailure } from '../repositories/migrationGate.js'
import { createNotReadyHandler } from '../http/not-ready.js'
import { captureDiag } from '../application/internal/diag-log.js'

/** 与 `src/index.ts` 正常分支里的注册前缀**必须逐字一致**（重复注册会抛错）。 */
export const NOT_READY_ROUTE_PATH = '/dashboard/api/reqboard'

/** 留痕只需 error 级；刻意用最小面，避免把 cordis 的 Logger 类型拖进接线模块。 */
export interface NotReadyLogger {
  error(message: string, ...rest: unknown[]): void
}

/**
 * 进入未就绪态：注册降级路由 + 双通道留痕，然后**正常返回**（不抛）。
 *
 * 调用方（`apply`）随后必须 `return`——本函数不接管控制流，
 * 因为"不再继续装配"这件事只有组合根知道该怎么表达。
 */
export function enterNotReadyMode(ctx: Context, failure: MigrationFailure, logger: NotReadyLogger): void {
  // 诊断文件逐行消费：把多行原因压成一行，保住"一条失败一行"的可读性。
  // 注意 hint 自带换行（"请执行：\n" + 命令），不压平就会让命令落到第二行——
  // 那正是 2026-10-03 事故里"日志停在半句话"的同款形态（tests 里有一条断言只认一行）。
  const oneLine = `${failure.code}: ${failure.message}｜迁移命令：${failure.hint}`.replace(/\n/g, ' | ')
  logger.error('reqboard 未就绪（HTTP 全端点 503）：' + oneLine)
  captureDiag('reqboard-capture [NOT-READY]: ' + oneLine)

  // 与正常分支同款的惰性注入写法（见 src/index.ts 头注：无静态 inject 的插件走注入）
  ;(ctx as unknown as { inject?: (services: string[], cb: (c: unknown) => void) => void }).inject?.(
    ['webServer'],
    (webCtx: unknown) => {
      const c = webCtx as {
        effect?: (fn: () => void, label?: string) => void
        webServer?: { register: (route: unknown) => unknown }
      }
      c.effect?.(() => {
        c.webServer?.register({
          kind: 'prefix',
          path: NOT_READY_ROUTE_PATH,
          handler: createNotReadyHandler(failure),
        })
      }, 'dsh-pmboard: not-ready api')
    },
  )
}
