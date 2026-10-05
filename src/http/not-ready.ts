/**
 * 未就绪 handler（REQ-261003191948-e94a · t3 / FR-2、FR-5）。
 *
 * ## 它解决什么
 *
 * 迁移门拒绝装配时，正常路由（`createReqboardHandler`）**根本没被注册**——因为它的必填依赖
 * （`requirementStore` / `taskStore`）恰恰不存在。于是客户端请求 `/dashboard/api/reqboard/*`
 * 落到 SPA 兜底，得到 **404**：用户只看到"404"，看不出是"没迁移"还是"路径写错"（2026-10-03 事故）。
 *
 * 本 handler 挂在**同一个前缀**上，对任何方法、任何子路径一律回 **503 + 结构化原因 + 可复制命令**。
 *
 * ## 三条硬约束（design/interfaces.md §HTTP 端点状态码矩阵）
 *
 * 1. **绝不返回 404**——404 与"路径写错"不可区分，正是本需求要消灭的形态；
 * 2. **绝不返回空册**（`{requirements: []}`）——那会被读成"需求全没了"，比 404 更危险
 *    （迁移门存在的理由就是防这个）；
 * 3. **SSE 端点不得挂起**——`/events` 也走本分支，先写头再 end，不进事件循环。
 *
 * ## 为什么独立成模块而不是复用 createReqboardHandler
 *
 * 复用会逼出"假存储"（拿空对象冒充 `requirementStore`），而那正是迁移门要防的事。
 * 这里连 `RouterCtx` 都不需要——只用信封，不碰任何业务端口（FR-5 零副作用）。
 *
 * @module dsh-pmboard/http/not-ready
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MigrationFailure } from '../repositories/migrationGate.js'
import { json } from './envelope.js'

/**
 * 造一个只回答 503 的 handler。
 *
 * 返回的 handler **忽略 method 与 path**：未就绪态下没有"合法请求"这回事，
 * 按路径分派只会给出一堆各不相同的 404/400，反而掩盖真正的原因。
 */
export function createNotReadyHandler(
  failure: MigrationFailure,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const body = {
    success: false as const,
    // 沿用迁移门的人读原因（与抛错路径**同一份文本**）
    error: failure.message,
    code: failure.code,
    // 代入真实路径的可复制命令（FR-3）——用户复制即跑，无需替换占位符
    hint: failure.hint,
  }
  return async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    json(res, 503, body)
  }
}
