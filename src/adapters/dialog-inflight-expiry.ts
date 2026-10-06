/**
 * 在途弹框登记的分档过期（REQ-261006170150-52cc FR-3）——把「多久算没人等」写成可测的一处。
 *
 * 为什么单独成文件：`PendingConfirmRegistry` 本体要守 `src/` 的 400 行尺寸门禁
 * （与 `storage-action-types.ts` 同源理由：**不能靠删注释腾地方**——该写清的「为什么」必须写清），
 * 故把「过期这条规则」搬到小模块，注册表只留一次调用。
 *
 * 分档依据是 `suspend`：
 *   · `suspend:true`（后台续跑等作答）→ `ttlMs`（缺省 30 分钟，与挂起票 TTL 同值，语义不变）；
 *   · `suspend:false`（人在工具调用里等）→ `blockingTtlMs`（缺省 60 分钟）。
 * 为什么必须分档：阻塞型弹框的最长真实等待是宿主交互工具超时（1 小时），
 * 套 30 分钟会把「人还在看框」误判成「没人答」⇒ 自动链抢在人前面动。
 *
 * @module dsh-pmboard/adapters/dialog-inflight-expiry
 */
import type { DialogInFlightRecord } from '../application/ports.js'

/** 两档 TTL（毫秒）：挂起型 / 阻塞型。 */
export interface InFlightTtl {
  /** 挂起型（`suspend:true`）：后台续跑等作答，与挂起票 TTL 同值。 */
  suspend: number
  /** 阻塞型（`suspend:false`）：人在工具调用里等，上界 = 宿主交互工具超时。 */
  blocking: number
}

/**
 * 该在途登记是否已过期：基准 = **登记时刻** `since`。
 *
 * 判据用**严格大于**（与票的 `expired` 同口径）：恰好到阈值那一下仍算「还在等」，
 * 免得边界上把「人正在答」错判成「没人答」。
 */
export function inFlightExpired(record: DialogInFlightRecord, now: number, ttl: InFlightTtl): boolean {
  return now - record.since > (record.suspend ? ttl.suspend : ttl.blocking)
}

/**
 * 就地摘除已过期的在途登记（**惰性删除**，FR-3）：读到即摘，于是「过期」无需任何定时器——
 * 台账里那句「过期后自动恢复」才有了实现，而不是一句承诺。
 *
 * 删除当前项对 Map 迭代是安全的（规范保证未访问项不受影响），故边遍历边删，不另拷快照。
 */
export function sweepInFlightTtl(map: Map<string, DialogInFlightRecord>, now: number, ttl: InFlightTtl): void {
  for (const [ref, record] of map) {
    if (inFlightExpired(record, now, ttl)) map.delete(ref)
  }
}
