/**
 * HTTP 信封与错误 → 状态码映射的**唯一实现**（REQ-261003191948-e94a · t2 / FR-2）。
 *
 * ## 为什么从 routes.ts 搬出来
 *
 * 未就绪态需要一个**只回 503** 的最小 handler（`src/http/not-ready.ts`），它不该、也不能复用
 * `createReqboardHandler`——后者强制要求 `requirementStore` / `taskStore`，而降级态恰恰没有这些对象
 * （迁移门要防的就是"拿空存储冒充正常"）。但两条路径的**响应信封必须同形**，
 * 否则客户端要按"是谁回的"写两套解析。
 *
 * 本仓有"两份真相必然漂移"的教训，故信封只此一份：routes 与 not-ready 都从这里 import。
 *
 * 搬运纪律：三个函数**逐字节搬**（原 `src/http/routes.ts` 内联实现），只加两处与本次需求相关的改动
 * （迁移门 → 503 映射、`hint` 透传），不做顺手重构。
 *
 * @module dsh-pmboard/http/envelope
 */
import type { ServerResponse } from 'node:http'

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function ok(res: ServerResponse, data: unknown): void {
  json(res, 200, { success: true, data })
}

/**
 * 错误 → HTTP 状态码的**唯一映射点**（t7：此前散在各处理器的 badInput/notFound，
 * 现集中在此）。code 语义对齐 design/domain-model.md §7。
 *
 * REQ-261003191948-e94a · FR-2 新增：
 *  - `REQBOARD_REQUIRES_MIGRATION` → **503**（与 `REQBOARD_BRIDGE_NOT_READY` 并列）——
 *    台账未迁移是"明确拒服务、且用户可自救"的状态，不是 500 也不是 404；
 *  - 错误对象带 `hint` 时原样透出（可复制的迁移命令）；不带则响应体形状**逐字节不变**。
 */
/**
 * 传输码 → HTTP 状态码的**唯一**映射表（REQ-261004103330-005f t1 收敛）。
 *
 * 为什么改成表：原先是一条三元链，加一个码就得改一处嵌套——REQ-261004103330-005f 一次要加 5 个码
 * （确认门/未就绪/开窗/投递/迁移中），继续往链里塞必然写出"某个码漏映射 → 全部落 500"。
 * 落 500 与"失败要响亮、且要分得清"相悖：500 让人以为是服务器坏了，而实际是流程问题。
 *
 * 未登记码**如实落 500**（不猜），消息与 code 原样带出。
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  // 入参/流程不满足（补齐后可重发）
  invalid_input: 400,
  invalid_transition: 400,
  invalid_dag: 400,
  missing_artifact: 400,
  artifact_not_confirmed: 400,
  verify_override_required: 400, // REQ-a8d582 FR-4：不合规通过缺覆盖说明
  design_doc_incomplete: 400, // REQ-2d1c74：G2 完整性门
  design_contains_decomposition: 400, // REQ-2d1c74：拆分内容硬门
  // 人工/系统门（agent 不得越过）
  human_gate: 403,
  system_gate: 403,
  // REQ-261004103330-005f FR-11：拿不到"已落章未消费"的确认票据 → 403（与 human_gate 同语义）
  confirmation_required: 403,
  // REQ-261004103330-005f：「选择…」拿不到系统选择窗口（平台不支持 / osascript 不在 / 超时）
  // 501 = 服务器不支持该功能——**不是**用户错误，所以不能报 4xx；界面据此提示"可手动输入路径"。
  path_picker_unavailable: 501,
  not_found: 404,
  REQBOARD_NOT_FOUND: 404,
  // REQ-261004103330-005f FR-10：迁移已在跑 / 库还没迁移就切换 → 409（状态冲突，等等再试）
  migration_in_progress: 409,
  sqlite_not_migrated: 409,
  // REQ-261004103330-005f FR-10：开窗成功但底稿没投到（窗口在、任务没到）→ 502
  dispatch_failed: 502,
  // 未就绪：启动装配中 → **503 明确拒服务**，绝不返回空册（空册 = 看板"需求全没了"）
  REQBOARD_BRIDGE_NOT_READY: 503,
  // REQ-261003191948-e94a FR-2：单册在场而数据根未迁移（人工跑迁移即可恢复）
  REQBOARD_REQUIRES_MIGRATION: 503,
  // REQ-261004103330-005f FR-12：已选 SQLite 而库空、分片非空 → 同一语义的 503 + 可复制指引
  REQBOARD_REQUIRES_SQLITE_MIGRATION: 503,
  // REQ-261004103330-005f FR-10：开窗能力未装配 / 既有开窗不可得
  window_opener_unavailable: 503,
  REQBOARD_OPEN_WINDOW_UNAVAILABLE: 503,
}

function statusForCode(code: string | undefined): number {
  if (code === undefined) return 500
  return STATUS_BY_CODE[code] ?? 500
}

export function fail(res: ServerResponse, err: unknown): void {
  const e = err as { message?: string; code?: string; hint?: unknown }
  const status = statusForCode(e.code)
  json(res, status, {
    success: false,
    error: e.message ?? String(err),
    ...(e.code ? { code: e.code } : {}),
    // 只认 string：非字符串 hint 不冒充（宁可少一个字段，也不给客户端一个假的命令）
    ...(typeof e.hint === 'string' && e.hint.length > 0 ? { hint: e.hint } : {}),
  })
}
