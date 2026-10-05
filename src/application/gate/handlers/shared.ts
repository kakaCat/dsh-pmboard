/**
 * 闸门 handlers 的共享助手（REQ-e3b6a0 t5/t6）——归属需求选择、文档安全读取、错误转文本。
 *
 * 抽出来的理由：H2（压缩）与 H3（注入）都要"本窗口是哪条需求"与"需求文档读得到吗"，
 * 各写一份必然漂移（本仓"两份真相"教训）。
 *
 * @module dsh-pmboard/application/gate/handlers/shared
 */
import type { DocRepository, RequirementStore } from '../../ports.js'
import type { ConfirmContext } from '../../../domain/gate/GateSpec.js'
import type { RequirementRecord } from '../../../shared/protocol.js'
import { isOpenRequirement } from '../../../domain/status/Predicates.js'

/**
 * 归属需求：显式 id 优先，否则本窗口最近更新的进行中需求。
 *
 * B12 阶段①-a（design §六③ 方案 A）：由**同步整册快照**改为**权威异步定点读**——
 * 先用一次带 `sourceSessionId` 过滤的摘要查询定位，再 `get` 一条全文。最多两次读，**不整册扫**。
 *
 * 为什么不能用非权威窄投影：本函数服务的是 `H1/H2/H3` 闸门判定
 * （H1 直接据 `requirement.status === ctx.to` 写 `ctx.verdict`）⇒ 属**门禁路径**，
 * 读到略旧的状态就可能给出错误裁决。故这里必须权威读（与 `peekFacts()` 的许可区相对）。
 */
export async function pickGateRequirement(store: RequirementStore, ctx: ConfirmContext): Promise<RequirementRecord | undefined> {
  if (ctx.requirementId !== undefined && ctx.requirementId.length > 0) {
    const byId = await store.get(ctx.requirementId)
    if (byId !== undefined) return byId
  }
  const page = await store.listSummaries({ scope: 'all', sourceSessionId: ctx.windowKey })
  const pick = page.items.filter(isOpenRequirement).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (pick === undefined) return undefined
  return await store.get(pick.id)
}

/** 读文档；失败按"读不到"处理（调用方据此 skip，不冒泡）。 */
export async function safeReadDoc(docs: DocRepository, relPath: string): Promise<string> {
  try {
    return await docs.read(relPath)
  } catch {
    return ''
  }
}

/** 错误 → 一行可读文本。 */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
