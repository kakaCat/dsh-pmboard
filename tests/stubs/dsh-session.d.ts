/**
 * `@deepseek-ai/dsh-session` 的**仅类型**声明（tsconfig `paths` 目标；无运行时实现）。
 *
 * ## 为什么是"仅类型"
 *
 * 该包**未随本仓安装**：它只作为 `@deepseek-ai/dsh-tools` 的 peer 落在
 * `node_modules/.pnpm/@deepseek-ai+dsh-session@0.2.0-rc.1*` 里，pnpm 严格模式**不把它暴露**给
 * 包根，故 `tests/isolate-node-context.test.ts` 的 `import { Session, SessionId } from
 * '@deepseek-ai/dsh-session'` 在 tsc 下是 TS2307。
 *
 * 本文件按该包 0.2.0-rc.1 的**公开形状**（`lib/types/index.d.ts` / `types.d.ts` / `surface.d.ts`）
 * 抄出本仓用例真正用到的**最小子集**，只为让 tsc 可见。
 *
 * ## 两条必须知道的边界
 *
 * 1. **不含运行时实现**：这里没有任何 `Session.create` 的行为——真实会话语义（surface 折叠、
 *    拒绝区间、`deriveMessages` 投影）都在宿主侧那份包里。本仓**没有**、也**不假装有**它。
 *    故 `tests/isolate-node-context.test.ts` 的「路线 A 端到端」在本 checkout **无法运行**
 *    （顶层 import 解不到真实包 → 整个文件加载失败）。这是**环境缺口**，不是代码缺陷；
 *    要跑它需要宿主侧提供/安装 `@deepseek-ai/dsh-session@0.2.0-rc.1`。
 * 2. **不是逐字契约**：只保留用例读到的成员与最宽的兼容形状（如 `append` 的事件名收成
 *    `string`，真实包是 `'system/message' | 'user/message' | …` 的受控联合 + 条件化的
 *    `SurfaceIntent`）。改动本文件**不会**改变生产行为，只影响 tsc 对本模块的看法。
 *
 * @module dsh-pmboard/tests/stubs/dsh-session
 */

/** 会话身份（真实包为 `Branded<'SessionId'>` 的字符串品牌）。 */
export type SessionId = string & { readonly __sessionIdBrand?: unique symbol }

/** 把字符串品牌成 {@link SessionId}（真实包的 `SessionId(id)` 工厂）。 */
export declare function SessionId(id: string): SessionId

/** 事件序号（真实包为品牌数字）。 */
export type SessionSeq = number

/** 日志偏移（真实包为品牌数字）。 */
export type SessionLogOffset = number

/** surface 折叠结果：模型可见的事件序号序列。 */
export interface SessionSurface {
  readonly nodes: readonly SessionSeq[]
}

/** 一条已提交的会话事件（本仓只读 `type`）。 */
export interface SessionEvent {
  readonly type: string
  readonly seq: SessionSeq
}

/** 派生出的消息（本仓读 `role` / `content`）。 */
export interface SessionMessage {
  readonly role: string
  readonly content: unknown
}

/** surface 意图：追加或整段替换。 */
export type SurfaceOp = 'append' | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }

/** `append` 的 surface 元数据（真实包按事件类型条件化，此处取并集以便两种形态都能传）。 */
export interface SurfaceIntent {
  surfaceOp: SurfaceOp
  sourceEventSeqs?: readonly SessionSeq[]
}

/** 会话（只声明本仓用例用到的成员）。 */
export declare class Session {
  static create(id: SessionId): Session
  get id(): SessionId
  /** 下一个事件的序号（= 日志长度）。 */
  get seq(): SessionLogOffset
  /** 当前 surface。 */
  get surface(): SessionSurface
  append(type: string, data: unknown, opts?: SurfaceIntent): SessionEvent
  deriveMessages(): SessionMessage[]
  snapshotEvents(fromSeq?: SessionLogOffset, toSeqExclusive?: SessionLogOffset): readonly SessionEvent[]
}
